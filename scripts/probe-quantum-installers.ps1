param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [string]$InstallRoot = "",
  [string]$EvidencePath = "",
  [switch]$Math3DOnly,
  [switch]$TheoryLabOnly,
  [switch]$CaptureCrashDump,
  [switch]$FullCrashDump,
  [ValidateSet('CurrentUser', 'AllUsers')][string]$InstallMode = 'CurrentUser',
  [string]$ExpectedBuildRunId = '',
  [string]$ExpectedMath3DCommit = ''
)

$ErrorActionPreference = 'Stop'
if ($Math3DOnly -and $TheoryLabOnly) { throw 'Choose only one single-app probe scope' }
if ($FullCrashDump -and -not $CaptureCrashDump) { throw 'FullCrashDump requires CaptureCrashDump' }
$repo = Split-Path -Parent $PSScriptRoot
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $InstallRoot = Join-Path $temporaryBase 'qi40-installer-probe' }
if ([string]::IsNullOrWhiteSpace($EvidencePath)) { $EvidencePath = Join-Path $repo 'test-results/qi40-installer-probe.json' }
$tempRoot = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\', '/')
if (-not $root.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "InstallRoot must be a fresh child of the temporary directory: $root"
}
if (Test-Path -LiteralPath $root) { throw "InstallRoot already exists: $root" }

$candidateRoot = (Resolve-Path -LiteralPath $CandidateDirectory).Path
$manifestPath = Join-Path $candidateRoot 'candidate-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$mathInstaller = (Resolve-Path -LiteralPath (Join-Path $candidateRoot $manifest.math3d.installerName)).Path
$labInstaller = (Resolve-Path -LiteralPath (Join-Path $candidateRoot $manifest.theoryLab.installerName)).Path
$werRoot = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps'
$dumpDir = Join-Path $root 'crash-dumps'
$werKeysCreated = @()
$mathSha = (Get-FileHash -LiteralPath $mathInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$labSha = (Get-FileHash -LiteralPath $labInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
$debuggerCandidates = @(
  (Get-Command cdb.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source),
  $(if ($programFilesX86) { Join-Path $programFilesX86 'Windows Kits\10\Debuggers\x64\cdb.exe' }),
  $(if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'Windows Kits\10\Debuggers\x64\cdb.exe' })
)
$cdb = $debuggerCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
$evidence = [ordered]@{
  schema = 'math3d/qi40-installer-probe/v1'
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  environment = 'clean Windows runner'
  scope = if ($Math3DOnly) { 'Math3D' } elseif ($TheoryLabOnly) { 'Theory Lab' } else { 'both apps' }
  installMode = $InstallMode
  imageVersion = $env:ImageVersion
  osVersion = (Get-CimInstance Win32_OperatingSystem).Version
  status = 'started'
  candidate = [ordered]@{
    buildRunId = $manifest.buildRunId
    manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    math3dCommit = $manifest.math3d.commit
    theoryLabCommit = $manifest.theoryLab.commit
    math3dInstallerSha256 = $mathSha
    theoryLabInstallerSha256 = $labSha
  }
  checks = [ordered]@{ exactBytes = 'pending'; math3dInstall = 'pending'; theoryLabInstall = 'pending';
    packagedWorkers = 'pending' }
  failure = $null
  debugger = [ordered]@{ cdbAvailable = [bool]$cdb; dumpAnalysis = 'not attempted' }
}

function Get-SanitizedDumpStack([string]$dump) {
  if (-not $cdb) { return [ordered]@{ status = 'cdb unavailable'; frames = @() } }
  $stdout = Join-Path $root 'cdb-stdout.txt'
  $stderr = Join-Path $root 'cdb-stderr.txt'
  # k omits the argument columns emitted by kb, leaving a stable Call Site.
  $arguments = "-z `"$dump`" -c `".exr -1; .echo QI40_STACK_BEGIN; .ecxr; k; .echo QI40_STACK_END; .echo QI40_STACK_WORDS_BEGIN; dds @esp L40; .echo QI40_STACK_WORDS_END; q`""
  $process = Start-Process -FilePath $cdb -ArgumentList $arguments -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  if (-not $process.WaitForExit(180000)) {
    try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch { }
    return [ordered]@{ status = 'cdb timeout'; frames = @() }
  }
  $raw = Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue
  $stackLines = @($raw -split '\r?\n' | Where-Object { $_ -match '^\s*\d{1,2}\s+' })
  $frames = @($stackLines | ForEach-Object {
    if ($_ -match '([A-Za-z][A-Za-z0-9_.-]*(?:![A-Za-z0-9_?$@<>.+-]+|\+(?:0x)?[0-9a-f]+))') {
      $Matches[1]
    }
  } | Select-Object -First 20)
  $exceptionCode = if ($raw -match 'ExceptionCode:\s*([0-9a-fA-F]{8})') { $Matches[1].ToLowerInvariant() } else { $null }
  $stderrText = Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
  $moduleTokens = @([regex]::Matches($raw, '\b[A-Za-z][A-Za-z0-9_.-]*(?:![A-Za-z0-9_?$@<>.+-]+|\+(?:0x)?[0-9a-f]{3,})') |
    ForEach-Object { $_.Value } | Select-Object -Unique -First 20)
  $stackWordSection = [regex]::Match($raw, '(?s)QI40_STACK_WORDS_BEGIN\r?\n(.*?)\r?\nQI40_STACK_WORDS_END')
  $stackWordSymbols = if ($stackWordSection.Success) {
    @($stackWordSection.Groups[1].Value -split '\r?\n' | ForEach-Object {
      if ($_ -match '^\s*[0-9a-fA-F]{8}\s+[0-9a-fA-F]{8}\s+([A-Za-z][A-Za-z0-9_.-]*![A-Za-z0-9_?$@<>.+-]+)') {
        $Matches[1]
      }
    } | Select-Object -First 30)
  } else { @() }
  $diagnosticTags = @('Unable to', 'Failed to', 'No stack', 'Stack unwind', 'Unable to get',
    'Symbol search path') | Where-Object { $raw -match [regex]::Escape($_) }
  return [ordered]@{ status = if ($frames.Count) { 'stack summarized' } else { 'no stack frames parsed' };
    exceptionCode = $exceptionCode; frames = $frames; stackLineCount = $stackLines.Count;
    moduleTokens = $moduleTokens; commandMarkers = [ordered]@{
      begin = [bool]($raw -match '(?m)^QI40_STACK_BEGIN\r?$');
      end = [bool]($raw -match '(?m)^QI40_STACK_END\r?$');
      stackWordsBegin = [bool]($raw -match '(?m)^QI40_STACK_WORDS_BEGIN\r?$');
      stackWordsEnd = [bool]($raw -match '(?m)^QI40_STACK_WORDS_END\r?$') };
    stackWordSymbols = $stackWordSymbols;
    diagnosticTags = $diagnosticTags; stdoutChars = ([string]$raw).Length;
    stderrChars = ([string]$stderrText).Length;
    debuggerExitCode = $process.ExitCode }
}

function Get-ApplicationErrors([string]$installerName, [datetime]$startedAt) {
  Start-Sleep -Seconds 2
  @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = $startedAt.AddSeconds(-5) } `
    -ErrorAction SilentlyContinue | Where-Object { $_.Properties.Count -ge 7 -and
      $_.Properties[0].Value -eq $installerName } | Select-Object -First 3 | ForEach-Object { [ordered]@{
      timeUtc = $_.TimeCreated.ToUniversalTime().ToString('o')
      faultingApplication = $_.Properties[0].Value
      applicationVersion = $_.Properties[1].Value
      faultingModule = $_.Properties[3].Value
      moduleVersion = $_.Properties[4].Value
      exceptionCode = $_.Properties[6].Value
      faultOffset = if ($_.Properties.Count -gt 7) { $_.Properties[7].Value } else { $null }
      modulePathName = if ($_.Properties.Count -gt 11) {
        [IO.Path]::GetFileName([string]$_.Properties[11].Value)
      } else { $null }
      eventRecordId = $_.RecordId
    } })
}

function Get-WerEvents([string]$installerName, [datetime]$startedAt) {
  @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1001; StartTime = $startedAt.AddSeconds(-5) } `
    -ErrorAction SilentlyContinue | Where-Object { $_.Message -like "*$installerName*" } |
    Select-Object -First 3 | ForEach-Object { [ordered]@{
      timeUtc = $_.TimeCreated.ToUniversalTime().ToString('o')
      eventRecordId = $_.RecordId
      provider = $_.ProviderName
    } })
}

function Invoke-ProbeInstall([string]$installer, [string]$destination, [string]$phase) {
  $name = [IO.Path]::GetFileName($installer)
  $startedAt = Get-Date
  Write-Host "Starting $phase installer: $name"
  $modeArgument = if ($InstallMode -eq 'AllUsers') { '/ALLUSERS' } else { '/CURRENTUSER' }
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', $modeArgument, "/D=$destination") `
    -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) {
    $evidence.installerFailure = [ordered]@{ phase = $phase; installerName = $name; reason = 'timeout';
      processId = $process.Id; startedUtc = $startedAt.ToUniversalTime().ToString('o');
      applicationErrors = @(Get-ApplicationErrors $name $startedAt);
      werEvents = @(Get-WerEvents $name $startedAt) }
    try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch { }
    throw "$phase installer exceeded 180 seconds"
  }
  if ($process.ExitCode -ne 0) {
    $hexCode = '0x{0:X8}' -f ($process.ExitCode -band 0xffffffffL)
    $evidence.installerFailure = [ordered]@{ phase = $phase; installerName = $name;
      processId = $process.Id; startedUtc = $startedAt.ToUniversalTime().ToString('o');
      endedUtc = (Get-Date).ToUniversalTime().ToString('o');
      exitCode = $process.ExitCode; exitCodeHex = $hexCode;
      applicationErrors = @(Get-ApplicationErrors $name $startedAt);
      werEvents = @(Get-WerEvents $name $startedAt) }
    throw "$phase installer exited with code $($process.ExitCode) ($hexCode)"
  }
  Write-Host "$phase installer exited successfully"
}

try {
  $usingNewCandidate = -not [string]::IsNullOrWhiteSpace($ExpectedBuildRunId)
  if ($usingNewCandidate -and [string]::IsNullOrWhiteSpace($ExpectedMath3DCommit)) {
    throw 'ExpectedMath3DCommit is required with ExpectedBuildRunId'
  }
  $identityMismatch = if ($usingNewCandidate) {
    [string]$manifest.buildRunId -ne $ExpectedBuildRunId -or
    [string]$manifest.math3d.commit -ne $ExpectedMath3DCommit -or
    [string]::IsNullOrWhiteSpace([string]$manifest.theoryLab.commit)
  } else {
    [string]$manifest.buildRunId -ne '42123298884' -or
    $manifest.math3d.commit -ne '49485e816fcfc7b46d5da1634c6746a631343f8e' -or
    $manifest.theoryLab.commit -ne '38842c8ca927720e9a0f39bd6a04f0e366073996' -or
    $mathSha -ne '63442950be85edb6f90f0321a37781650bde2c16cf4b32923aa64a3ae2cb6535' -or
    $labSha -ne '18bfd9bd243b101a2ba2b6a3586e3e080b6e3223866af57853e32024b9fc3d81'
  }
  if ($manifest.schema -ne 'math3d/two-app-candidate/v1' -or $identityMismatch -or
      $mathSha -ne $manifest.math3d.installerSha256 -or
      $labSha -ne $manifest.theoryLab.installerSha256) {
    throw 'Downloaded candidate identity differs from pinned source and installer hashes'
  }
  $evidence.checks.exactBytes = 'passed'
  New-Item -ItemType Directory -Path $root | Out-Null
  if ($CaptureCrashDump) {
    $targetInstallers = if ($Math3DOnly) { @($mathInstaller) } elseif ($TheoryLabOnly) {
      @($labInstaller)
    } else { @($mathInstaller, $labInstaller) }
    $targetKeys = @($targetInstallers | ForEach-Object { Join-Path $werRoot ([IO.Path]::GetFileName($_)) })
    foreach ($key in $targetKeys) {
      if (Test-Path -LiteralPath $key) { throw "Per-application WER LocalDumps key already exists: $key" }
    }
    New-Item -ItemType Directory -Path $dumpDir | Out-Null
    New-Item -Path $werRoot -Force | Out-Null
    foreach ($key in $targetKeys) {
      New-Item -Path $key -Force | Out-Null
      $werKeysCreated += $key
      New-ItemProperty -Path $key -Name DumpFolder -PropertyType ExpandString -Value $dumpDir -Force | Out-Null
      New-ItemProperty -Path $key -Name DumpType -PropertyType DWord -Value $(if ($FullCrashDump) { 2 } else { 1 }) -Force | Out-Null
      New-ItemProperty -Path $key -Name DumpCount -PropertyType DWord -Value 2 -Force | Out-Null
    }
    $evidence.crashDump = [ordered]@{ configured = $true; dumpType = $(if ($FullCrashDump) { 'full' } else { 'mini' });
      configuredFor = @($targetInstallers | ForEach-Object { [IO.Path]::GetFileName($_) }); files = @() }
  }
  $mathInstall = Join-Path $root 'Math3D'
  $labInstall = Join-Path $root 'TheoryLab'
  if (-not $TheoryLabOnly) {
    Invoke-ProbeInstall $mathInstaller $mathInstall 'Math3D'
    $evidence.checks.math3dInstall = 'passed'
  } else { $evidence.checks.math3dInstall = 'not requested' }
  if ($TheoryLabOnly) {
    Invoke-ProbeInstall $labInstaller $labInstall 'Theory Lab'
    $evidence.checks.theoryLabInstall = 'passed'
    $requiredFiles = @(
      (Join-Path $labInstall 'Quantum Hamiltonian Lab.exe'),
      (Join-Path $labInstall 'resources/quantum-worker/quantum-worker.exe')
    )
  } elseif ($Math3DOnly) {
    $evidence.checks.theoryLabInstall = 'not requested'
    $requiredFiles = @(
      (Join-Path $mathInstall 'Math3D.exe'),
      (Join-Path $mathInstall 'resources/python-worker/worker.exe')
    )
  } else {
    Invoke-ProbeInstall $labInstaller $labInstall 'Theory Lab'
    $evidence.checks.theoryLabInstall = 'passed'
    $requiredFiles = @(
    (Join-Path $mathInstall 'Math3D.exe'),
    (Join-Path $mathInstall 'resources/python-worker/worker.exe'),
    (Join-Path $labInstall 'Quantum Hamiltonian Lab.exe'),
    (Join-Path $labInstall 'resources/quantum-worker/quantum-worker.exe')
    )
  }
  foreach ($required in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Installed file missing: $required" }
  }
  $evidence.checks.packagedWorkers = 'passed'
  $evidence.status = 'passed'
} catch {
  $evidence.status = 'failed'
  $evidence.failure = $_.Exception.Message
  throw
} finally {
  if ($werKeysCreated.Count -gt 0) {
    try {
      if ($evidence.status -eq 'failed') {
        $deadline = (Get-Date).AddSeconds($(if ($FullCrashDump) { 90 } else { 20 }))
        do {
          $dumpFiles = @(Get-ChildItem -LiteralPath $dumpDir -Filter '*.dmp' -File -ErrorAction SilentlyContinue)
          if ($dumpFiles.Count -eq 0 -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2 }
        } while ($dumpFiles.Count -eq 0 -and (Get-Date) -lt $deadline)
      }
      if ($evidence.crashDump) {
        $foundDumps = @(Get-ChildItem -LiteralPath $dumpDir -Filter '*.dmp' -File -ErrorAction SilentlyContinue)
        $evidence.crashDump.files = @($foundDumps |
          ForEach-Object { [ordered]@{ name = $_.Name; bytes = $_.Length;
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } })
        if ($foundDumps.Count -gt 0) {
          $evidence.crashDump.stackSummary = Get-SanitizedDumpStack $foundDumps[0].FullName
          $evidence.debugger.dumpAnalysis = $evidence.crashDump.stackSummary.status
        }
      }
    } finally {
      foreach ($key in $werKeysCreated) { Remove-Item -LiteralPath $key -Force }
    }
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "Installer probe evidence: $EvidencePath"
}
