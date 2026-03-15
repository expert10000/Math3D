param(
  [string]$InstallerPath = "",
  [string]$InstallRoot = "",
  [switch]$SkipInstall,
  [switch]$SkipSmoke,
  [switch]$SkipLaunchCheck
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA "Programs/Math3D"
}

$unpackedWorker = Join-Path $repo "release/win-unpacked/resources/python-worker/worker.exe"
if (-not (Test-Path $unpackedWorker)) {
  throw "Missing packaged worker at $unpackedWorker. Run npm run dist first."
}
Write-Host "[verify] packaged worker found: $unpackedWorker"

if ([string]::IsNullOrWhiteSpace($InstallerPath)) {
  $candidate = Get-ChildItem -Path (Join-Path $repo "release") -Filter "Math3D Setup *.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $candidate) {
    throw "No installer found in $repo/release (expected Math3D Setup *.exe)."
  }
  $InstallerPath = $candidate.FullName
}

if (-not $SkipInstall) {
  Write-Host "[verify] installing from $InstallerPath"
  Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait
}

$installedWorker = Join-Path $InstallRoot "resources/python-worker/worker.exe"
if (-not (Test-Path $installedWorker)) {
  throw "Missing installed worker at $installedWorker"
}
Write-Host "[verify] installed worker found: $installedWorker"

if (-not $SkipSmoke) {
  $smokeScript = Join-Path $repo "scripts/smoke-python-worker.mjs"
  if (-not (Test-Path $smokeScript)) {
    throw "Smoke script not found: $smokeScript"
  }
  Write-Host "[verify] running smoke test against installed worker"
  node $smokeScript --exe $installedWorker
  if ($LASTEXITCODE -ne 0) {
    throw "Smoke test failed for installed worker (exit code $LASTEXITCODE)"
  }
}

if (-not $SkipLaunchCheck) {
  $installedExe = Join-Path $InstallRoot "Math3D.exe"
  if (Test-Path $installedExe) {
    $before = @(Get-Process -Name "Math3D" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    Start-Process -FilePath $installedExe
    Start-Sleep -Seconds 6
    $after = @(Get-Process -Name "Math3D" -ErrorAction SilentlyContinue)
    $new = @($after | Where-Object { $before -notcontains $_.Id })
    if ($new.Count -gt 0) {
      Write-Host "[verify] launch check observed running Math3D process(es): $($new.Id -join ', ')"
      $new | Stop-Process -Force
    } else {
      Write-Warning "[verify] launch check did not observe a persistent Math3D process in this session."
    }
  } else {
    Write-Warning "[verify] installed app executable not found at $installedExe"
  }
}

Write-Host "[verify] installer worker validation complete"
