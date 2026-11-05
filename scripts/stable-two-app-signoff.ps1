param(
  [Parameter(Mandatory = $true)][string]$TheoryLabRepo,
  [Parameter(Mandatory = $true)][string]$Math3DInstaller,
  [Parameter(Mandatory = $true)][string]$TheoryLabInstaller,
  [string]$CandidateManifest = "",
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
$qecResultPath = Join-Path $resolvedRoot "qec-roundtrip.json"
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
  checks = [ordered]@{ candidateBytes = "pending"; install = "pending"; installedUiRoundtrip = "pending";
    installedQecRoundtrip = "pending" }
  failure = $null
}

try {
  if (-not [string]::IsNullOrWhiteSpace($CandidateManifest)) {
    $manifestPath = (Resolve-Path -LiteralPath $CandidateManifest).Path
    $candidate = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($candidate.schema -ne "math3d/two-app-candidate/v1" -or
        $candidate.math3d.version -ne $evidence.math3d.version -or
        $candidate.theoryLab.version -ne $evidence.theoryLab.version -or
        $candidate.math3d.commit -ne $evidence.math3d.commit -or
        $candidate.theoryLab.commit -ne $evidence.theoryLab.commit -or
        $candidate.math3d.installerName -ne $evidence.math3d.installerName -or
        $candidate.theoryLab.installerName -ne $evidence.theoryLab.installerName -or
        $candidate.math3d.installerSha256 -ne $evidence.math3d.installerSha256 -or
        $candidate.theoryLab.installerSha256 -ne $evidence.theoryLab.installerSha256) {
      throw "Downloaded installer bytes or source identity differ from candidate manifest"
    }
    $evidence.candidateBuildRunId = $candidate.buildRunId
    $evidence.candidateManifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $evidence.checks.candidateBytes = "passed"
  New-Item -ItemType Directory -Path $resolvedRoot | Out-Null
  foreach ($item in @(@($mathInstaller, $mathInstall), @($labInstaller, $labInstall))) {
    $installer, $destination = $item
    $startedAt = Get-Date
    $process = Start-Process -FilePath $installer -ArgumentList @("/S", "/CURRENTUSER", "/D=$destination") `
      -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      $hexCode = '0x{0:X8}' -f ($process.ExitCode -band 0xffffffffL)
      $faults = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = $startedAt.AddSeconds(-5) } `
        -ErrorAction SilentlyContinue | Where-Object { $_.Properties.Count -ge 7 -and
          $_.Properties[0].Value -eq [IO.Path]::GetFileName($installer) } |
        Select-Object -First 3)
      $evidence.installerFailure = [ordered]@{
        installerName = [IO.Path]::GetFileName($installer)
        exitCode = $process.ExitCode
        exitCodeHex = $hexCode
        applicationErrors = @($faults | ForEach-Object { [ordered]@{
          timeUtc = $_.TimeCreated.ToUniversalTime().ToString('o')
          faultingApplication = $_.Properties[0].Value
          faultingModule = $_.Properties[3].Value
          exceptionCode = $_.Properties[6].Value
        } })
      }
      throw "Installer exited with code $($process.ExitCode) ($hexCode): $installer"
    }
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

  $env:MATH3D_SIGNOFF_QEC_RESULT_PATH = $qecResultPath
  Push-Location $mathRepo
  try {
    & (Join-Path $mathRepo "node_modules/.bin/playwright.cmd") test `
      tests/e2e/quantum-installed-qec.spec.ts --reporter=list
    $qecExit = $LASTEXITCODE
  } finally { Pop-Location }
  if ($qecExit -ne 0) { throw "Installed QEC round trip failed (exit $qecExit)" }
  if (-not (Test-Path -LiteralPath $qecResultPath -PathType Leaf)) {
    throw "Installed QEC test passed without run evidence: $qecResultPath"
  }
  $evidence.qecRun = Get-Content -LiteralPath $qecResultPath -Raw | ConvertFrom-Json
  $evidence.checks.installedQecRoundtrip = "passed"
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
