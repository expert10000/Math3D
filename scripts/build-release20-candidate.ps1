param([string]$OutputRoot = '')

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'The 2.0 Windows candidate requires Windows.' }
if (-not $env:RUNNER_TEMP) { $env:RUNNER_TEMP = $env:TEMP }
if (-not $OutputRoot) { $OutputRoot = Join-Path $env:RUNNER_TEMP 'math3d-release20-candidate' }
$tempRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$output = [IO.Path]::GetFullPath($OutputRoot).TrimEnd('\', '/')
if (-not $output.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $output)) {
  throw 'Candidate output must be a new child of the temporary directory.'
}
Push-Location $repo
try {
  node scripts/release20-candidate.mjs --preflight
  if ($LASTEXITCODE -ne 0) { throw '2.0 candidate preflight refused this checkout or signer.' }
  $nsisRoot = Join-Path $env:RUNNER_TEMP ('math3d-release20-nsis-' + [guid]::NewGuid().ToString('N'))
  & scripts/prepare-qi40-nsis313.ps1 -OutputRoot $nsisRoot
  $env:CSC_LINK = $env:MATH3D_WINDOWS_CSC_LINK
  $env:CSC_KEY_PASSWORD = $env:MATH3D_WINDOWS_CSC_KEY_PASSWORD
  npm run dist:ci
  if ($LASTEXITCODE -ne 0) { throw '2.0 candidate packaging failed.' }
  node scripts/smoke-python-worker.mjs --exe (Join-Path $repo 'release/win-unpacked/resources/python-worker/worker.exe')
  if ($LASTEXITCODE -ne 0) { throw 'Frozen candidate worker protocol smoke failed.' }
  $installer = Join-Path $repo 'release/Math3D Setup 2.0.0.exe'
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw 'Exact 2.0 installer was not produced.' }
  New-Item -ItemType Directory -Path $output | Out-Null
  $staged = Join-Path $output 'Math3D-Setup-2.0.0.exe'
  Copy-Item -LiteralPath $installer -Destination $staged
  $signatureReport = Join-Path $output 'signatures.json'
  & scripts/verify-release20-signatures.ps1 -AssetsRoot $output -UnpackedRoot (Join-Path $repo 'release/win-unpacked') `
    -ExpectedThumbprint $env:MATH3D_WINDOWS_SIGNER_THUMBPRINT | Set-Content -LiteralPath $signatureReport -Encoding UTF8
  $nsisReport = Join-Path $output 'nsis.json'
  & scripts/verify-release20-nsis.ps1 -InstallerPath $staged | Set-Content -LiteralPath $nsisReport -Encoding UTF8
  node scripts/release20-candidate.mjs --record $staged (Join-Path $repo 'release/win-unpacked') `
    $signatureReport $nsisReport (Join-Path $output 'candidate-manifest.json')
  if ($LASTEXITCODE -ne 0) { throw 'Candidate manifest generation failed.' }
  $sbom = Join-Path $output 'sbom'
  node scripts/generate-release-sbom.mjs --target windows --app-dir (Join-Path $repo 'release/win-unpacked') `
    --out $sbom --version 2.0.0
  if ($LASTEXITCODE -ne 0) { throw 'Candidate SBOM generation failed.' }
  node scripts/stage-release20-candidate-assets.mjs $repo $output $sbom (Join-Path $output 'assets')
  if ($LASTEXITCODE -ne 0) { throw 'Candidate asset integrity verification failed.' }
  Write-Host "Exact 2.0 candidate and verification receipts: $output"
} finally {
  Remove-Item Env:CSC_LINK, Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
  Pop-Location
}
