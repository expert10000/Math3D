param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [Parameter(Mandatory = $true)][string]$RollbackDirectory,
  [string]$ExpectedCandidateCommit = "",
  [string]$ExpectedCandidateSha256 = "",
  [string]$InstallRoot = "",
  [string]$EvidencePath = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $InstallRoot = Join-Path $temporaryBase 'stable-quantum-installed-rollback' }
if ([string]::IsNullOrWhiteSpace($EvidencePath)) { $EvidencePath = Join-Path $repo 'test-results/stable-quantum-installed-rollback.json' }
$tempRoot = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\', '/')
if (-not $root.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "InstallRoot must be a fresh child of the temporary directory: $root"
}
if (Test-Path -LiteralPath $root) { throw "InstallRoot already exists: $root" }

$candidateRoot = (Resolve-Path -LiteralPath $CandidateDirectory).Path
$rollbackRoot = (Resolve-Path -LiteralPath $RollbackDirectory).Path
$candidateManifestFile = Join-Path $candidateRoot 'candidate-manifest.json'
$rollbackManifestFile = Join-Path $rollbackRoot 'candidate-manifest.json'
$candidateManifest = Get-Content -LiteralPath $candidateManifestFile -Raw | ConvertFrom-Json
$rollbackManifest = Get-Content -LiteralPath $rollbackManifestFile -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($ExpectedCandidateCommit)) {
  $ExpectedCandidateCommit = (& git -C $repo rev-parse HEAD).Trim()
}
$candidate = (Resolve-Path -LiteralPath (Join-Path $candidateRoot $candidateManifest.math3d.installerName)).Path
$rollback = (Resolve-Path -LiteralPath (Join-Path $rollbackRoot $rollbackManifest.math3d.installerName)).Path
$candidateSha = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
$rollbackSha = (Get-FileHash -LiteralPath $rollback -Algorithm SHA256).Hash.ToLowerInvariant()
$install = Join-Path $root 'Math3D'
$executable = Join-Path $install 'Math3D.exe'
$profile = Join-Path $root 'profile'
$evidence = [ordered]@{
  schema = 'math3d/stable-quantum-installed-rollback/v1'
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  environment = 'fresh Windows rollback VM'
  status = 'started'
  candidate = [ordered]@{ commit = $candidateManifest.math3d.commit; version = $candidateManifest.math3d.version;
    installerSha256 = $candidateSha; manifestSha256 = (Get-FileHash -LiteralPath $candidateManifestFile -Algorithm SHA256).Hash.ToLowerInvariant() }
  rollback = [ordered]@{ commit = $rollbackManifest.math3d.commit; version = $rollbackManifest.math3d.version;
    installerSha256 = $rollbackSha; manifestSha256 = (Get-FileHash -LiteralPath $rollbackManifestFile -Algorithm SHA256).Hash.ToLowerInvariant() }
  checks = [ordered]@{ exactBytes = 'pending'; candidateInstall = 'pending'; candidateProfileSeed = 'pending';
    candidateQec = 'pending';
    candidateUninstall = 'pending';
    rollbackInstall = 'pending'; rollbackProfileRetained = 'pending'; v1v2Readers = 'pending' }
  failure = $null
}

function Get-InstallerProcessSnapshot {
  try {
    @(Get-CimInstance Win32_Process | Where-Object {
      $_.Name -match '^(Math3D|.*Setup.*|.*Uninstall.*)' } |
      Select-Object Name, ProcessId, ParentProcessId, ExecutablePath)
  } catch { @() }
}

function Invoke-Installer([string]$file, [string]$phase) {
  Write-Host "Starting $phase installer: $([IO.Path]::GetFileName($file))"
  $startedAt = Get-Date
  $process = Start-Process -FilePath $file -ArgumentList @('/S', '/CURRENTUSER', "/D=$install") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) {
    $evidence.installerProcesses = Get-InstallerProcessSnapshot
    try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch { }
    throw "$phase installer did not exit within 180 seconds; inspect installerProcesses"
  }
  if ($process.ExitCode -ne 0) {
    $hexCode = '0x{0:X8}' -f ($process.ExitCode -band 0xffffffffL)
    # Windows Error Reporting can write its event after the installer exits.
    $faults = @()
    $eventLogPolls = 0
    do {
      $eventLogPolls++
      $faults = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = $startedAt.AddSeconds(-5) } `
        -ErrorAction SilentlyContinue | Where-Object { $_.Properties.Count -ge 7 -and
          $_.Properties[0].Value -eq [IO.Path]::GetFileName($file) } | Select-Object -First 3)
      if ($faults.Count -eq 0 -and $eventLogPolls -lt 6) { Start-Sleep -Seconds 2 }
    } while ($faults.Count -eq 0 -and $eventLogPolls -lt 6)
    $evidence.installerFailure = [ordered]@{
      phase = $phase
      exitCode = $process.ExitCode
      exitCodeHex = $hexCode
      eventLogPolls = $eventLogPolls
      applicationErrors = @($faults | ForEach-Object { [ordered]@{
        timeUtc = $_.TimeCreated.ToUniversalTime().ToString('o')
        faultingApplication = $_.Properties[0].Value
        faultingModule = $_.Properties[3].Value
        exceptionCode = $_.Properties[6].Value
      } })
    }
    $evidence.installerProcesses = Get-InstallerProcessSnapshot
    throw "$phase installer exited with code $($process.ExitCode) ($hexCode)"
  }
}

function Invoke-CandidateUninstall {
  $uninstallers = @(Get-ChildItem -LiteralPath $install -Filter 'Uninstall*.exe' -File)
  if ($uninstallers.Count -ne 1) { throw "Expected one installed candidate uninstaller, found $($uninstallers.Count)" }
  Write-Host "Starting candidate uninstaller: $($uninstallers[0].Name)"
  $process = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) {
    $evidence.installerProcesses = Get-InstallerProcessSnapshot
    try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch { }
    throw 'Candidate uninstaller did not exit within 180 seconds; inspect installerProcesses'
  }
  if ($process.ExitCode -ne 0) { throw "Candidate uninstaller exited with code $($process.ExitCode)" }
  $deadline = (Get-Date).AddSeconds(120)
  while ((Test-Path -LiteralPath $executable -PathType Leaf) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
  }
  if (Test-Path -LiteralPath $executable -PathType Leaf) {
    $evidence.installerProcesses = Get-InstallerProcessSnapshot
    throw 'Candidate executable remains 120 seconds after uninstaller exit; inspect installerProcesses'
  }
}

function Invoke-Phase([string]$phase, [string]$path) {
  $env:MATH3D_E2E_INSTALLED_EXE = $executable
  $env:MATH3D_ROLLBACK_PROFILE_ROOT = $profile
  $env:MATH3D_ROLLBACK_PHASE = $phase
  $env:MATH3D_ROLLBACK_PHASE_RESULT_PATH = $path
  Push-Location $repo
  try {
    & (Join-Path $repo 'node_modules/.bin/playwright.cmd') test tests/e2e/quantum-installed-rollback.spec.ts --reporter=list | Out-Host
    $result = $LASTEXITCODE
  } finally { Pop-Location }
  if ($result -ne 0) { throw "Installed $phase scene test failed (exit $result)" }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Installed $phase test passed without evidence" }
  return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
}

function Invoke-ProfilePhase([string]$phase, [string]$path) {
  $env:MATH3D_E2E_INSTALLED_EXE = $executable
  $env:MATH3D_ROLLBACK_PROFILE_ROOT = $profile
  $env:MATH3D_ROLLBACK_PROFILE_PHASE = $phase
  $env:MATH3D_ROLLBACK_PROFILE_RESULT_PATH = $path
  $env:MATH3D_ROLLBACK_PROMOTED_GEOMETRY_ID = if ($phase -eq 'verify') {
    $evidence.profileSeed.promotedGeometryId
  } else { '' }
  Push-Location $repo
  try {
    & (Join-Path $repo 'node_modules/.bin/playwright.cmd') test tests/e2e/quantum-installed-rollback-profile.spec.ts --reporter=list | Out-Host
    $result = $LASTEXITCODE
  } finally { Pop-Location }
  if ($result -ne 0) { throw "Installed rollback profile $phase failed (exit $result)" }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Installed rollback profile $phase passed without evidence" }
  return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json)
}

try {
  if ($candidateManifest.schema -ne 'math3d/two-app-candidate/v1' -or
      $rollbackManifest.schema -ne 'math3d/two-app-candidate/v1' -or
      $candidateManifest.math3d.commit -ne $ExpectedCandidateCommit -or
      $candidateManifest.math3d.version -ne '1.7.0' -or
      $rollbackManifest.math3d.version -ne '1.7.0' -or
      $rollbackManifest.math3d.commit -ne '55a0196fe63ca16f49c97ff1aead7e41105e0ede' -or
      $candidateSha -ne $candidateManifest.math3d.installerSha256 -or
      (-not [string]::IsNullOrWhiteSpace($ExpectedCandidateSha256) -and $candidateSha -ne $ExpectedCandidateSha256) -or
      $rollbackSha -ne $rollbackManifest.math3d.installerSha256 -or
      $rollbackSha -ne 'b515f926f0794679f19b4cbe3adb5133b3d15b95f2b31e3856ff14ee5a4b46ac') {
    throw 'Candidate or rollback installer identity differs from pinned manifests and hashes'
  }
  $evidence.checks.exactBytes = 'passed'
  New-Item -ItemType Directory -Path $root | Out-Null
  Invoke-Installer $candidate 'QEC candidate'
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Candidate Math3D executable missing' }
  $evidence.checks.candidateInstall = 'passed'
  $evidence.profileSeed = Invoke-ProfilePhase 'seed' (Join-Path $root 'profile-seed.json')
  $evidence.checks.candidateProfileSeed = 'passed'
  $evidence.candidateScene = Invoke-Phase 'candidate' (Join-Path $root 'candidate-scene.json')
  $evidence.checks.candidateQec = 'passed'

  $active = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $executable })
  if ($active.Count -gt 0) { throw 'Candidate Math3D still running before rollback installer' }
  Invoke-CandidateUninstall
  $evidence.checks.candidateUninstall = 'passed'
  Invoke-Installer $rollback 'Pre-QEC rollback'
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'Rolled-back Math3D executable missing' }
  $evidence.checks.rollbackInstall = 'passed'
  $evidence.profileVerify = Invoke-ProfilePhase 'verify' (Join-Path $root 'profile-verify.json')
  if ($evidence.profileVerify.quantumProjectId -ne $evidence.profileSeed.quantumProjectId -or
      $evidence.profileVerify.promotedGeometryId -ne $evidence.profileSeed.promotedGeometryId -or
      -not $evidence.profileVerify.promotedGeometryReopenedAfterRollback) {
    throw 'Installed rollback changed the saved Project or promoted geometry identity'
  }
  $evidence.checks.rollbackProfileRetained = 'passed'
  $evidence.rollbackScenes = Invoke-Phase 'rolled-back' (Join-Path $root 'rollback-scenes.json')
  $evidence.checks.v1v2Readers = 'passed'
  $evidence.status = 'passed'
} catch {
  $evidence.status = 'failed'
  $evidence.failure = $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "Installed rollback evidence: $EvidencePath"
}
