param(
  [Parameter(Mandatory = $true)][string]$PublishedInstaller,
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [string]$ExpectedVersion = "",
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
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
}
if ($manifest.schema -ne "math3d/two-app-candidate/v1" -or
    $manifest.math3d.version -ne $ExpectedVersion -or $manifest.math3d.channel -ne "stable" -or
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
  checks = [ordered]@{ exactBytes = "pending"; oldInstall = "pending"; oldProjectAndSetting = "pending";
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
  $installRegistration = @(Get-ChildItem -Path 'HKCU:\Software' | ForEach-Object {
    Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
  } | Where-Object { $_.InstallLocation -eq $mathInstall -and $_.Math3DUpgradeFrom -eq '1.6.0' })
  if ($installRegistration.Count -ne 1) { throw 'The bounded v1.6.0 migration marker was not registered' }
  $evidence.migration = 'registered-v1.6.0-overlay'
  $evidence.checks.inPlaceUpgrade = "passed"

  $env:MATH3D_UPGRADE_PHASE = "verify"
  $env:MATH3D_UPGRADE_EXPECTED_VERSION = $ExpectedVersion
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
