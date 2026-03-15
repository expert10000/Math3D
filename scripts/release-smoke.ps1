param(
  [string]$InstallerPath = "",
  [string]$InstallRoot = "",
  [switch]$SkipBuild,
  [switch]$SkipInstall,
  [switch]$SkipLaunchCheck,
  [switch]$StrictLaunchCheck
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  $InstallRoot = Join-Path $env:LOCALAPPDATA "Programs/Math3D"
}

if (-not $SkipBuild) {
  Write-Host "[release-smoke] building installer (npm run dist)"
  npm run dist
  if ($LASTEXITCODE -ne 0) {
    throw "npm run dist failed (exit code $LASTEXITCODE)"
  }
}

$verifyScript = Join-Path $repo "scripts/verify-installer-worker.ps1"
if (-not (Test-Path $verifyScript)) {
  throw "Missing verify script: $verifyScript"
}

Write-Host "[release-smoke] verifying installer layout + worker smoke"
& $verifyScript `
  -InstallerPath $InstallerPath `
  -InstallRoot $InstallRoot `
  -SkipInstall:$SkipInstall.IsPresent `
  -SkipLaunchCheck:$SkipLaunchCheck.IsPresent
if ($LASTEXITCODE -ne 0) {
  throw "verify-installer-worker failed (exit code $LASTEXITCODE)"
}

$installedExe = Join-Path $InstallRoot "Math3D.exe"
if (-not (Test-Path $installedExe)) {
  throw "Installed app executable not found: $installedExe"
}

if (-not $SkipLaunchCheck) {
  Write-Host "[release-smoke] checking app launch"
  $before = @(Get-Process -Name "Math3D" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $spawned = Start-Process -FilePath $installedExe -PassThru
  Start-Sleep -Seconds 6
  $after = @(Get-Process -Name "Math3D" -ErrorAction SilentlyContinue)
  $new = @($after | Where-Object { $before -notcontains $_.Id })
  if ($new.Count -eq 0) {
    if ($spawned.HasExited) {
      if ($spawned.ExitCode -ne 0) {
        throw "Installed app exited during launch check (exit code $($spawned.ExitCode))."
      }
      $msg = "Installed app launch check saw an early exit with code 0 (possible false-negative in this session)."
      if ($StrictLaunchCheck) {
        throw $msg
      }
      Write-Warning $msg
    } else {
      $msg = "Installed app launch check did not observe a new running Math3D process."
      if ($StrictLaunchCheck) {
        throw $msg
      }
      Write-Warning $msg
    }
  } else {
    Write-Host "[release-smoke] app launch ok (pid(s): $($new.Id -join ', '))"
    $new | Stop-Process -Force
  }
}

$installedWorker = Join-Path $InstallRoot "resources/python-worker/worker.exe"
if (-not (Test-Path $installedWorker)) {
  throw "Installed worker missing: $installedWorker"
}

$nodeExe = (Get-Command node).Source
$smokeScript = Join-Path $repo "scripts/smoke-python-worker.mjs"
if (-not (Test-Path $smokeScript)) {
  throw "Smoke script missing: $smokeScript"
}

Write-Host "[release-smoke] verifying worker without python/conda paths"
$pathBackup = $env:PATH
try {
  $filtered = ($pathBackup -split ";" | Where-Object { $_ -and ($_ -notmatch "(?i)python|conda") }) -join ";"
  if (-not [string]::IsNullOrWhiteSpace($filtered)) {
    $env:PATH = $filtered
  }
  & $nodeExe $smokeScript --exe $installedWorker
  if ($LASTEXITCODE -ne 0) {
    throw "Installed worker smoke failed without python paths (exit code $LASTEXITCODE)"
  }
} finally {
  $env:PATH = $pathBackup
}

Write-Host "[release-smoke] all release smoke checks passed"
