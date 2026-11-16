param(
  [string]$Repository = 'expert10000/Math3D',
  [string]$CloudflaredPath = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $CloudflaredPath) { $CloudflaredPath = Join-Path $env:TEMP 'cloudflared-release20.exe' }
if (-not (Test-Path -LiteralPath $CloudflaredPath -PathType Leaf)) {
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $CloudflaredPath
}
$tunnelName = [IO.Path]::GetFileNameWithoutExtension($CloudflaredPath)
if (Get-Process -Name $tunnelName -ErrorAction SilentlyContinue) {
  throw 'A release Sage tunnel is already running. Stop it before rotating the endpoint secret.'
}
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8767/health' -TimeoutSec 15
if ($health.engine -ne 'sagemath' -or $health.engineVersion -notmatch '^10\.10(\.|$)') {
  throw 'Start the repository SageMath 10.10 Docker worker before creating its Windows CI tunnel.'
}
$stateDir = Join-Path $env:TEMP ('math3d-release20-sage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stateDir | Out-Null
$token = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
$token | Set-Content -LiteralPath (Join-Path $stateDir 'token.txt') -NoNewline
$port = Get-Random -Minimum 20000 -Maximum 40000
$bridge = $null
$tunnel = $null
try {
  $env:MATH3D_RELEASE20_SAGE_BRIDGE_TOKEN = $token
  $env:MATH3D_RELEASE20_SAGE_BRIDGE_PORT = [string]$port
  $bridge = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('scripts/release20-sage-bridge.mjs') `
    -WorkingDirectory $repoRoot -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $stateDir 'bridge.out.log') `
    -RedirectStandardError (Join-Path $stateDir 'bridge.err.log') -PassThru
  Remove-Item Env:MATH3D_RELEASE20_SAGE_BRIDGE_TOKEN, Env:MATH3D_RELEASE20_SAGE_BRIDGE_PORT
  $bridge.Id | Set-Content -LiteralPath (Join-Path $stateDir 'bridge.pid')
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:$port/$token/health" -TimeoutSec 3
      if ($response.engineVersion -eq $health.engineVersion) { $ready = $true; break }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw 'The token-guarded local Sage bridge did not start.' }
  $tunnel = Start-Process -FilePath $CloudflaredPath `
    -ArgumentList @('tunnel', '--url', "http://127.0.0.1:$port", '--no-autoupdate') `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $stateDir 'tunnel.out.log') `
    -RedirectStandardError (Join-Path $stateDir 'tunnel.err.log') -PassThru
  $tunnel.Id | Set-Content -LiteralPath (Join-Path $stateDir 'tunnel.pid')
  $hostUrl = ''
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Seconds 1
    $log = Get-Content -LiteralPath (Join-Path $stateDir 'tunnel.err.log') -Raw -ErrorAction SilentlyContinue
    $hostUrl = [regex]::Match([string]$log, 'https://[a-z0-9-]+\.trycloudflare\.com').Value
    if ($hostUrl) { break }
    if ($tunnel.HasExited) { throw 'The HTTPS tunnel exited before publishing an address.' }
  }
  if (-not $hostUrl) { throw 'The HTTPS tunnel did not publish an address.' }
  $env:MATH3D_RELEASE20_SAGE_SERVICE_URL = "$hostUrl/$token"
  $oraclePassed = $false
  for ($attempt = 0; $attempt -lt 12; $attempt++) {
    & node (Join-Path $PSScriptRoot 'release20-sage-oracle.mjs') (Join-Path $stateDir 'sage-oracle.json') `
      *> (Join-Path $stateDir 'oracle.log')
    if ($LASTEXITCODE -eq 0) { $oraclePassed = $true; break }
    Start-Sleep -Seconds 5
  }
  if (-not $oraclePassed) { throw 'The HTTPS Sage oracle failed; see the local oracle log.' }
  $env:MATH3D_RELEASE20_SAGE_SERVICE_URL | gh secret set MATH3D_RELEASE20_SAGE_SERVICE_URL --repo $Repository
  if ($LASTEXITCODE -ne 0) { throw 'Could not set the GitHub Sage endpoint secret.' }
  Remove-Item Env:MATH3D_RELEASE20_SAGE_SERVICE_URL
  Write-Output "Sage 10.10 tunnel ready at $hostUrl; GitHub secret set. State: $stateDir"
} catch {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
  if ($bridge -and -not $bridge.HasExited) { Stop-Process -Id $bridge.Id -ErrorAction SilentlyContinue }
  throw
} finally {
  Remove-Item Env:MATH3D_RELEASE20_SAGE_BRIDGE_TOKEN, Env:MATH3D_RELEASE20_SAGE_BRIDGE_PORT, `
    Env:MATH3D_RELEASE20_SAGE_SERVICE_URL -ErrorAction SilentlyContinue
}
