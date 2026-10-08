param([switch]$Build, [string]$ProfileDirectory = (Join-Path $env:USERPROFILE '.math3d/projects-desktop-profile'), [int]$DebugPort = 0)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $workspacePath
try {
  if ($Build) { & npm.cmd run build:core; if ($LASTEXITCODE -ne 0) { throw 'Current build failed.' } }
  $electronPath = Join-Path $workspacePath 'node_modules/electron/dist/electron.exe'
  foreach ($requiredPath in @($electronPath, (Join-Path $workspacePath 'dist/main.js'), (Join-Path $workspacePath 'renderer/dist/index.html'), (Join-Path $workspacePath 'dist/build-identity.json'))) {
    if (!(Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "Missing current build file: $requiredPath. Run npm run build:core." }
  }
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_DEV_SERVER_URL -ErrorAction SilentlyContinue
  Remove-Item Env:MATH3D_E2E -ErrorAction SilentlyContinue
  $existingWindow = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like "*$workspacePath*" -and $_.CommandLine -like "*$ProfileDirectory*" -and $_.CommandLine -notlike '*--type=*' }
  if ($existingWindow) { Write-Output 'This current-build profile is already running. Close its window before launching a rebuilt version.'; return }
  $launchArguments = @('"' + $workspacePath + '"')
  if ($ProfileDirectory) { $env:MATH3D_DEV_USER_DATA_DIR = $ProfileDirectory; $launchArguments += '--user-data-dir="' + $ProfileDirectory + '"' }
  if ($DebugPort -gt 0) { $launchArguments += "--remote-debugging-port=$DebugPort" }
  $identity = Get-Content -LiteralPath (Join-Path $workspacePath 'dist/build-identity.json') -Raw | ConvertFrom-Json
  Write-Output "Math3D $($identity.version) | $($identity.commit) | built $($identity.builtAt)"
  Start-Process -FilePath $electronPath -WorkingDirectory $workspacePath -ArgumentList $launchArguments -WindowStyle Hidden
} finally { Pop-Location }
