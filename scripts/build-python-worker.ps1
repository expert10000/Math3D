param(
  [switch]$SmokeTest
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repo

node (Join-Path $repo "scripts/build-python-worker.mjs")

$exe = Join-Path $repo "build/python-worker-dist/worker.exe"
if (!(Test-Path $exe)) {
  throw "worker.exe not found at $exe"
}

if ($SmokeTest) {
  & $exe --ping
  & $exe --version
  node (Join-Path $repo "scripts/smoke-python-worker.mjs") --exe $exe
}

Write-Host "worker build complete: $exe"
