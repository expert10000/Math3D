param(
  [string]$InstallerPath = "",
  [string]$InstallRoot = "",
  [switch]$SkipBuild,
  [switch]$SkipInstall,
  [switch]$SkipLaunchCheck,
  [switch]$StrictLaunchCheck,
  [switch]$SourceDev
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    $InstallRoot = Join-Path $env:RUNNER_TEMP "Math3D-smoke-install"
  } else {
    $InstallRoot = Join-Path (Join-Path $env:LOCALAPPDATA "Programs") "Math3D"
  }
}

if (-not $SkipBuild) {
  $ciBackup = $env:CI
  try {
    # Prevent electron-builder CI auto-publish behavior in smoke runs.
    $env:CI = "false"
    $buildCommand = if ($SourceDev) { "dist:dev:ci" } else { "dist:ci" }
    if ($SourceDev) { Write-Host "[release-smoke] source-only unsigned Dev installer; not a signed 2.0 candidate" }
    Write-Host "[release-smoke] building installer (npm run $buildCommand)"
    npm run $buildCommand
    if ($LASTEXITCODE -ne 0) {
      throw "npm run $buildCommand failed (exit code $LASTEXITCODE)"
    }
  } finally {
    if ($null -eq $ciBackup) {
      Remove-Item Env:CI -ErrorAction SilentlyContinue
    } else {
      $env:CI = $ciBackup
    }
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
  -SkipLaunchCheck:$SkipLaunchCheck.IsPresent `
  -SourceDev:$SourceDev.IsPresent
if ($LASTEXITCODE -ne 0) {
  throw "verify-installer-worker failed (exit code $LASTEXITCODE)"
}

$appName = if ($SourceDev) { "Math3D Dev" } else { "Math3D" }
$installedExe = Join-Path $InstallRoot "$appName.exe"
if (-not (Test-Path $installedExe)) {
  throw "Installed app executable not found: $installedExe"
}

if (-not $SkipLaunchCheck) {
  Write-Host "[release-smoke] checking app launch"
  $before = @(Get-Process -Name $appName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $spawned = Start-Process -FilePath $installedExe -WindowStyle Hidden -PassThru
  Start-Sleep -Seconds 6
  $after = @(Get-Process -Name $appName -ErrorAction SilentlyContinue)
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
