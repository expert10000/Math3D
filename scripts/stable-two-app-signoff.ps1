param(
  [Parameter(Mandatory = $true)][string]$TheoryLabRepo,
  [Parameter(Mandatory = $true)][string]$Math3DInstaller,
  [Parameter(Mandatory = $true)][string]$TheoryLabInstaller,
  [string]$InstallRoot = "",
  [string]$EvidencePath = ""
)

$ErrorActionPreference = "Stop"
$mathRepo = Split-Path -Parent $PSScriptRoot
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $temporaryBase "stable-two-app-signoff"
}
if ([string]::IsNullOrWhiteSpace($EvidencePath)) {
  $EvidencePath = Join-Path $mathRepo "test-results/stable-two-app-signoff.json"
}

$tempRoot = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$resolvedRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\', '/')
if (-not $resolvedRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "InstallRoot must be a fresh child of the temporary directory: $resolvedRoot"
}
if (Test-Path -LiteralPath $resolvedRoot) {
  throw "InstallRoot already exists; use a clean Windows runner: $resolvedRoot"
}

$mathInstaller = (Resolve-Path -LiteralPath $Math3DInstaller).Path
$labInstaller = (Resolve-Path -LiteralPath $TheoryLabInstaller).Path
$labRepo = (Resolve-Path -LiteralPath $TheoryLabRepo).Path
$mathInstall = Join-Path $resolvedRoot "Math3D"
$labInstall = Join-Path $resolvedRoot "TheoryLab"
$uiResultPath = Join-Path $resolvedRoot "ui-roundtrip.json"
$evidence = [ordered]@{
  schema = "math3d/stable-two-app-signoff/v1"
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  environment = "clean Windows runner"
  status = "started"
  math3d = [ordered]@{
    version = (Get-Content -LiteralPath (Join-Path $mathRepo "package.json") -Raw | ConvertFrom-Json).version
    commit = (& git -C $mathRepo rev-parse HEAD).Trim()
    channel = "stable"
    installerName = [IO.Path]::GetFileName($mathInstaller)
    installerSha256 = (Get-FileHash -LiteralPath $mathInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  theoryLab = [ordered]@{
    version = (Get-Content -LiteralPath (Join-Path $labRepo "package.json") -Raw | ConvertFrom-Json).version
    commit = (& git -C $labRepo rev-parse HEAD).Trim()
    installerName = [IO.Path]::GetFileName($labInstaller)
    installerSha256 = (Get-FileHash -LiteralPath $labInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  checks = [ordered]@{ install = "pending"; installedUiRoundtrip = "pending" }
  failure = $null
}

try {
  New-Item -ItemType Directory -Path $resolvedRoot | Out-Null
  foreach ($item in @(@($mathInstaller, $mathInstall), @($labInstaller, $labInstall))) {
    $installer, $destination = $item
    $process = Start-Process -FilePath $installer -ArgumentList @("/S", "/CURRENTUSER", "/D=$destination") `
      -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode): $installer" }
  }
  $mathExe = Join-Path $mathInstall "Math3D.exe"
  $labExe = Join-Path $labInstall "Quantum Hamiltonian Lab.exe"
  foreach ($required in @(
    $mathExe, $labExe,
    (Join-Path $mathInstall "resources/python-worker/worker.exe"),
    (Join-Path $labInstall "resources/quantum-worker/quantum-worker.exe")
  )) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Installed file missing: $required" }
  }
  $evidence.checks.install = "passed"
  $evidence.math3d.installedExe = $mathExe
  $evidence.theoryLab.installedExe = $labExe

  $env:MATH3D_E2E_INSTALLED_EXE = $mathExe
  $env:QLAB_E2E_INSTALLED_EXE = $labExe
  $env:MATH3D_SIGNOFF_RESULT_PATH = $uiResultPath
  Remove-Item Env:QLAB_E2E_CHECKOUT -ErrorAction SilentlyContinue
  Push-Location $mathRepo
  try {
    & (Join-Path $mathRepo "node_modules/.bin/playwright.cmd") test `
      tests/e2e/quantum-installed-ui-roundtrip.spec.ts --reporter=list
    $testExit = $LASTEXITCODE
  } finally { Pop-Location }
  if ($testExit -ne 0) { throw "Installed UI round trip failed (exit $testExit)" }
  if (-not (Test-Path -LiteralPath $uiResultPath -PathType Leaf)) {
    throw "Installed UI test passed without run evidence: $uiResultPath"
  }
  $evidence.uiRun = Get-Content -LiteralPath $uiResultPath -Raw | ConvertFrom-Json
  $evidence.checks.installedUiRoundtrip = "passed"
  $evidence.status = "passed"
} catch {
  $evidence.status = "failed"
  $evidence.failure = $_.Exception.Message
  throw
} finally {
  $evidenceDir = Split-Path -Parent $EvidencePath
  New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "Stable two-app evidence: $EvidencePath"
  Write-Host "Math3D installer SHA-256: $($evidence.math3d.installerSha256)"
  Write-Host "Theory Lab installer SHA-256: $($evidence.theoryLab.installerSha256)"
}
