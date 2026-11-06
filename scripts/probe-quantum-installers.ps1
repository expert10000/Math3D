param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [string]$InstallRoot = "",
  [string]$EvidencePath = ""
)

$ErrorActionPreference = 'Stop'
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
$mathSha = (Get-FileHash -LiteralPath $mathInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$labSha = (Get-FileHash -LiteralPath $labInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
$evidence = [ordered]@{
  schema = 'math3d/qi40-installer-probe/v1'
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  environment = 'clean Windows runner'
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
}

function Get-ApplicationErrors([string]$installerName, [datetime]$startedAt) {
  Start-Sleep -Seconds 2
  @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = $startedAt.AddSeconds(-5) } `
    -ErrorAction SilentlyContinue | Where-Object { $_.Properties.Count -ge 7 -and
      $_.Properties[0].Value -eq $installerName } | Select-Object -First 3 | ForEach-Object { [ordered]@{
      timeUtc = $_.TimeCreated.ToUniversalTime().ToString('o')
      faultingApplication = $_.Properties[0].Value
      faultingModule = $_.Properties[3].Value
      exceptionCode = $_.Properties[6].Value
    } })
}

function Invoke-ProbeInstall([string]$installer, [string]$destination, [string]$phase) {
  $name = [IO.Path]::GetFileName($installer)
  $startedAt = Get-Date
  Write-Host "Starting $phase installer: $name"
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', '/CURRENTUSER', "/D=$destination") `
    -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) {
    $evidence.installerFailure = [ordered]@{ phase = $phase; installerName = $name; reason = 'timeout';
      applicationErrors = Get-ApplicationErrors $name $startedAt }
    try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch { }
    throw "$phase installer exceeded 180 seconds"
  }
  if ($process.ExitCode -ne 0) {
    $hexCode = '0x{0:X8}' -f ($process.ExitCode -band 0xffffffffL)
    $evidence.installerFailure = [ordered]@{ phase = $phase; installerName = $name;
      exitCode = $process.ExitCode; exitCodeHex = $hexCode;
      applicationErrors = Get-ApplicationErrors $name $startedAt }
    throw "$phase installer exited with code $($process.ExitCode) ($hexCode)"
  }
  Write-Host "$phase installer exited successfully"
}

try {
  if ($manifest.schema -ne 'math3d/two-app-candidate/v1' -or
      $manifest.buildRunId -ne '42123298884' -or
      $manifest.math3d.commit -ne '49485e816fcfc7b46d5da1634c6746a631343f8e' -or
      $manifest.theoryLab.commit -ne '38842c8ca927720e9a0f39bd6a04f0e366073996' -or
      $mathSha -ne $manifest.math3d.installerSha256 -or
      $labSha -ne $manifest.theoryLab.installerSha256 -or
      $mathSha -ne '63442950be85edb6f90f0321a37781650bde2c16cf4b32923aa64a3ae2cb6535' -or
      $labSha -ne '18bfd9bd243b101a2ba2b6a3586e3e080b6e3223866af57853e32024b9fc3d81') {
    throw 'Downloaded candidate identity differs from pinned source and installer hashes'
  }
  $evidence.checks.exactBytes = 'passed'
  New-Item -ItemType Directory -Path $root | Out-Null
  $mathInstall = Join-Path $root 'Math3D'
  $labInstall = Join-Path $root 'TheoryLab'
  Invoke-ProbeInstall $mathInstaller $mathInstall 'Math3D'
  $evidence.checks.math3dInstall = 'passed'
  Invoke-ProbeInstall $labInstaller $labInstall 'Theory Lab'
  $evidence.checks.theoryLabInstall = 'passed'
  foreach ($required in @(
    (Join-Path $mathInstall 'Math3D.exe'),
    (Join-Path $mathInstall 'resources/python-worker/worker.exe'),
    (Join-Path $labInstall 'Quantum Hamiltonian Lab.exe'),
    (Join-Path $labInstall 'resources/quantum-worker/quantum-worker.exe')
  )) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Installed file missing: $required" }
  }
  $evidence.checks.packagedWorkers = 'passed'
  $evidence.status = 'passed'
} catch {
  $evidence.status = 'failed'
  $evidence.failure = $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "Installer probe evidence: $EvidencePath"
}
