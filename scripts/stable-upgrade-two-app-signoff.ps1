param(
  [Parameter(Mandatory = $true)][string]$PublishedInstaller,
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [string]$InstallRoot = "",
  [string]$EvidencePath = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if ([string]::IsNullOrWhiteSpace($InstallRoot)) { $InstallRoot = Join-Path $temporaryBase "stable-upgrade-two-app" }
if ([string]::IsNullOrWhiteSpace($EvidencePath)) { $EvidencePath = Join-Path $repo "test-results/stable-upgrade-two-app.json" }
$tempRoot = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\', '/')
if (-not $root.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "InstallRoot must be a fresh child of the temporary directory: $root"
}
if (Test-Path -LiteralPath $root) { throw "InstallRoot already exists: $root" }

$old = (Resolve-Path -LiteralPath $PublishedInstaller).Path
$candidateRoot = (Resolve-Path -LiteralPath $CandidateDirectory).Path
$manifestFile = Join-Path $candidateRoot "candidate-manifest.json"
$manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
if ($manifest.schema -ne "math3d/two-app-candidate/v1" -or
    $manifest.math3d.version -ne "1.7.0-rc.1" -or $manifest.math3d.channel -ne "stable" -or
    $manifest.theoryLab.version -ne "0.1.0") { throw "Unexpected release candidate manifest" }
$new = (Resolve-Path -LiteralPath (Join-Path $candidateRoot $manifest.math3d.installerName)).Path
$lab = (Resolve-Path -LiteralPath (Join-Path $candidateRoot $manifest.theoryLab.installerName)).Path
$oldSha = (Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant()
$newSha = (Get-FileHash -LiteralPath $new -Algorithm SHA256).Hash.ToLowerInvariant()
$labSha = (Get-FileHash -LiteralPath $lab -Algorithm SHA256).Hash.ToLowerInvariant()
$evidence = [ordered]@{
  schema = "math3d/stable-upgrade-two-app/v1"
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  environment = "fresh Windows upgrade VM"
  status = "started"
  oldInstaller = [ordered]@{ name = [IO.Path]::GetFileName($old); version = "1.6.0"; sha256 = $oldSha }
  candidate = [ordered]@{
    buildRunId = $manifest.buildRunId
    manifestSha256 = (Get-FileHash -LiteralPath $manifestFile -Algorithm SHA256).Hash.ToLowerInvariant()
    math3d = $manifest.math3d
    theoryLab = $manifest.theoryLab
  }
  checks = [ordered]@{ exactBytes = "pending"; oldUninstaller = "pending"; oldInstall = "pending"; oldProjectAndSetting = "pending";
    inPlaceUpgrade = "pending"; retainedProjectAndSetting = "pending"; installedUiRoundtrip = "pending" }
  failure = $null
}

function Get-InstallerProcessSnapshot {
  @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(Math3D|Quantum Hamiltonian Lab|.*Setup.*|.*Uninstall.*)' } |
    Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine)
}

function Invoke-BoundedInstaller([string]$installer, [string]$destination, [string]$phase) {
  Write-Host "Starting $phase installer: $([IO.Path]::GetFileName($installer))"
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', '/CURRENTUSER', "/D=$destination") `
    -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) {
    $evidence.installerProcesses = Get-InstallerProcessSnapshot
    try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch { }
    throw "$phase installer did not exit within 180 seconds; inspect installerProcesses in evidence"
  }
  if ($process.ExitCode -ne 0) { throw "$phase installer exited with code $($process.ExitCode)" }
  Write-Host "$phase installer exited successfully"
}

try {
  if ($oldSha -ne "5a785909352816e80995f203b1bb28263ed4f9423abf76664c5eec4813c36341" -or
      $newSha -ne $manifest.math3d.installerSha256 -or
      $labSha -ne $manifest.theoryLab.installerSha256) {
    throw "Published or candidate installer bytes differ from pinned SHA-256"
  }
  $evidence.checks.exactBytes = "passed"
  New-Item -ItemType Directory -Path $root | Out-Null
  $mathInstall = Join-Path $root "Math3D"
  $labInstall = Join-Path $root "TheoryLab"
  $profile = Join-Path $root "profile"
  $mathExe = Join-Path $mathInstall "Math3D.exe"
  $labExe = Join-Path $labInstall "Quantum Hamiltonian Lab.exe"
  # Probe the published v1.6.0 uninstaller before creating the real upgrade
  # installation. NSIS runs this old uninstaller when the candidate upgrades.
  $probeInstall = Join-Path $root 'OldUninstallerProbe'
  Invoke-BoundedInstaller $old $probeInstall 'Published v1.6.0 uninstall probe install'
  $probeUninstaller = @(Get-ChildItem -LiteralPath $probeInstall -File -Filter '*uninstall*.exe') | Select-Object -First 1
  if (-not $probeUninstaller) { throw 'Published v1.6.0 uninstaller was not installed' }
  $probeUninstallerCopy = Join-Path $root 'old-uninstaller-probe.exe'
  Copy-Item -LiteralPath $probeUninstaller.FullName -Destination $probeUninstallerCopy
  $probeProcess = Start-Process -FilePath $probeUninstallerCopy `
    -ArgumentList @('/S', '/KEEP_APP_DATA', '/currentuser', '--updated', "_?=$probeInstall") `
    -WindowStyle Hidden -PassThru
  if (-not $probeProcess.WaitForExit(60000)) {
    $evidence.installerProcesses = Get-InstallerProcessSnapshot
    try { Stop-Process -Id $probeProcess.Id -Force -ErrorAction Stop } catch { }
    throw 'Published v1.6.0 uninstaller did not exit within 60 seconds'
  }
  $evidence.oldUninstallerExitCode = $probeProcess.ExitCode
  if ($probeProcess.ExitCode -ne 0) { throw "Published v1.6.0 uninstaller exited with code $($probeProcess.ExitCode)" }
  $evidence.checks.oldUninstaller = 'passed'
  Invoke-BoundedInstaller $old $mathInstall 'Published v1.6.0'
  Invoke-BoundedInstaller $lab $labInstall 'Candidate Theory Lab'
  foreach ($required in @($mathExe, $labExe)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Installed executable missing: $required" }
  }
  $evidence.checks.oldInstall = "passed"

  $env:MATH3D_E2E_INSTALLED_EXE = $mathExe
  $env:QLAB_E2E_INSTALLED_EXE = $labExe
  $env:MATH3D_UPGRADE_PROFILE_ROOT = $profile
  $env:MATH3D_UPGRADE_PHASE = "seed"
  $env:MATH3D_UPGRADE_PHASE_RESULT_PATH = Join-Path $root "seed.json"
  Push-Location $repo
  try {
    & (Join-Path $repo "node_modules/.bin/playwright.cmd") test `
      tests/e2e/stable-upgrade-project-settings.spec.ts --reporter=list
    $seedExit = $LASTEXITCODE
  } finally { Pop-Location }
  if ($seedExit -ne 0) { throw "Published v1.6.0 Project/settings seed failed (exit $seedExit)" }
  $evidence.seed = Get-Content -LiteralPath $env:MATH3D_UPGRADE_PHASE_RESULT_PATH -Raw | ConvertFrom-Json
  $evidence.checks.oldProjectAndSetting = "passed"
  $evidence.beforeUpgradeProcesses = Get-InstallerProcessSnapshot

  Invoke-BoundedInstaller $new $mathInstall 'Candidate Math3D upgrade'
  if (-not (Test-Path -LiteralPath $mathExe -PathType Leaf)) { throw "Upgraded Math3D executable missing" }
  $evidence.checks.inPlaceUpgrade = "passed"

  $env:MATH3D_UPGRADE_PHASE = "verify"
  $env:MATH3D_UPGRADE_PHASE_RESULT_PATH = Join-Path $root "verify.json"
  Push-Location $repo
  try {
    & (Join-Path $repo "node_modules/.bin/playwright.cmd") test `
      tests/e2e/stable-upgrade-project-settings.spec.ts --reporter=list
    $verifyExit = $LASTEXITCODE
  } finally { Pop-Location }
  if ($verifyExit -ne 0) { throw "Upgraded Project/settings verification failed (exit $verifyExit)" }
  $evidence.verify = Get-Content -LiteralPath $env:MATH3D_UPGRADE_PHASE_RESULT_PATH -Raw | ConvertFrom-Json
  $evidence.checks.retainedProjectAndSetting = "passed"

  $env:MATH3D_SIGNOFF_MATH_PROFILE = $profile
  $env:MATH3D_SIGNOFF_RESULT_PATH = Join-Path $root "ui-roundtrip.json"
  Push-Location $repo
  try {
    & (Join-Path $repo "node_modules/.bin/playwright.cmd") test `
      tests/e2e/quantum-installed-ui-roundtrip.spec.ts --reporter=list
    $roundtripExit = $LASTEXITCODE
  } finally { Pop-Location }
  if ($roundtripExit -ne 0) { throw "Upgraded two-app UI round trip failed (exit $roundtripExit)" }
  $evidence.uiRun = Get-Content -LiteralPath $env:MATH3D_SIGNOFF_RESULT_PATH -Raw | ConvertFrom-Json
  $evidence.checks.installedUiRoundtrip = "passed"
  $evidence.status = "passed"
} catch {
  $evidence.status = "failed"
  $evidence.failure = $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "Stable upgrade evidence: $EvidencePath"
}
