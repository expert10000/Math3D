param(
  [string]$InstallerPath = "",
  [string]$InstallRoot = "",
  [switch]$SkipInstall,
  [switch]$SkipSmoke,
  [switch]$SkipLaunchCheck
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot

function Invoke-WorkerCliSmoke {
  param(
    [Parameter(Mandatory = $true)][string]$WorkerPath
  )

  foreach ($check in @(
    @{ Flag = "--ping"; ExpectedType = "pong" },
    @{ Flag = "--version"; ExpectedType = "version" }
  )) {
    $raw = (& $WorkerPath $check.Flag | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
      throw "Worker CLI check failed: $WorkerPath $($check.Flag) (exit code $LASTEXITCODE)"
    }
    if ([string]::IsNullOrWhiteSpace($raw)) {
      throw "Worker CLI check returned empty output: $WorkerPath $($check.Flag)"
    }
    try {
      $obj = $raw | ConvertFrom-Json
    } catch {
      throw "Worker CLI check returned non-JSON output: $raw"
    }
    if ($obj.type -ne $check.ExpectedType -or -not $obj.ok) {
      throw "Worker CLI check returned unexpected payload for $($check.Flag): $raw"
    }
  }
}

function Invoke-WorkerProtocolSmoke {
  param(
    [Parameter(Mandatory = $true)][string]$WorkerPath
  )

  $smokeScript = Join-Path $repo "scripts/smoke-python-worker.mjs"
  if (-not (Test-Path $smokeScript)) {
    throw "Smoke script not found: $smokeScript"
  }
  node $smokeScript --exe $WorkerPath
  if ($LASTEXITCODE -ne 0) {
    throw "Smoke test failed for worker: $WorkerPath (exit code $LASTEXITCODE)"
  }
}

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  # In CI we prefer a deterministic temp install root to avoid stale upgrade state.
  if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    $InstallRoot = Join-Path $env:RUNNER_TEMP "Math3D-smoke-install"
  } else {
    $InstallRoot = Join-Path (Join-Path $env:LOCALAPPDATA "Programs") "Math3D"
  }
}
$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot).Replace("/", "\")

function Test-SafeInstallRoot {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  $resolved = [System.IO.Path]::GetFullPath($PathValue).TrimEnd("\")
  $root = [System.IO.Path]::GetPathRoot($resolved).TrimEnd("\")
  if ([string]::IsNullOrWhiteSpace($resolved) -or $resolved -eq $root) {
    return $false
  }
  if ($resolved -notmatch "(?i)math3d") {
    return $false
  }
  return $true
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
  $installerArgs = @("/S", "/CURRENTUSER")
  # /D must be the final NSIS argument.
  $installerArgs += "/D=$InstallRoot"

  if (Test-Path $InstallRoot) {
    if (-not (Test-SafeInstallRoot -PathValue $InstallRoot)) {
      throw "Refusing to remove unsafe install root path: $InstallRoot"
    }
    Write-Host "[verify] removing existing install root $InstallRoot"
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue
  }

  $attempts = @("initial", "retry")
  $installed = $false
  foreach ($attempt in $attempts) {
    if ($attempt -eq "retry") {
      Write-Warning "[verify] installer attempt failed; retrying once..."
      Start-Sleep -Seconds 2
    }
    $proc = Start-Process -FilePath $InstallerPath -ArgumentList $installerArgs -Wait -PassThru
    if ($proc.ExitCode -eq 0) {
      $installed = $true
      break
    }
    Write-Warning "[verify] installer exited with code $($proc.ExitCode) on $attempt attempt"
  }

  if (-not $installed) {
    throw "Installer failed (exit code $($proc.ExitCode)): $InstallerPath"
  }
}

$installedWorker = Join-Path $InstallRoot "resources/python-worker/worker.exe"
if (-not (Test-Path $installedWorker)) {
  throw "Missing installed worker at $installedWorker"
}
Write-Host "[verify] installed worker found: $installedWorker"

if (-not $SkipSmoke) {
  Write-Host "[verify] running CLI smoke (packaged worker)"
  Invoke-WorkerCliSmoke -WorkerPath $unpackedWorker

  Write-Host "[verify] running protocol smoke (packaged worker)"
  Invoke-WorkerProtocolSmoke -WorkerPath $unpackedWorker

  Write-Host "[verify] running CLI smoke (installed worker)"
  Invoke-WorkerCliSmoke -WorkerPath $installedWorker

  Write-Host "[verify] running protocol smoke (installed worker)"
  Invoke-WorkerProtocolSmoke -WorkerPath $installedWorker
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
