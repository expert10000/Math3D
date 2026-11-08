param(
  [switch]$SmokeTest
)

$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repo

node (Join-Path $repo "scripts/build-python-worker.mjs")
if ($LASTEXITCODE -ne 0) { throw "Worker freeze failed (exit $LASTEXITCODE)." }

$exe = Join-Path $repo "build/python-worker-dist/worker/worker.exe"
if (!(Test-Path $exe)) {
  throw "worker.exe not found at $exe"
}

if ($SmokeTest) {
  & $exe --ping
  if ($LASTEXITCODE -ne 0) { throw "Worker ping failed (exit $LASTEXITCODE)." }
  & $exe --version
  if ($LASTEXITCODE -ne 0) { throw "Worker version check failed (exit $LASTEXITCODE)." }
  node (Join-Path $repo "scripts/smoke-python-worker.mjs") --exe $exe
  if ($LASTEXITCODE -ne 0) { throw "Frozen worker smoke failed (exit $LASTEXITCODE)." }
}

Write-Host "worker build complete: $exe"
