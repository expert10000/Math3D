param(
  [Parameter(Mandatory = $true)][string]$FreezeManifest,
  [Parameter(Mandatory = $true)][string]$PfxPath,
  [Parameter(Mandatory = $true)][string]$PasswordDpapiPath,
  [Parameter(Mandatory = $true)][string]$PublicCertificatePath,
  [Parameter(Mandatory = $true)][string]$ExpectedThumbprint,
  [string]$OutputRoot = '',
  [switch]$PreflightOnly
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows is required.' }
$repo = Split-Path -Parent $PSScriptRoot
$commit = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { throw 'Cannot identify the source commit.' }
if (& git -C $repo status --porcelain) { throw 'Prerelease packaging requires a clean source checkout.' }
if (-not (Test-Path -LiteralPath $FreezeManifest -PathType Leaf)) { throw 'Reviewed freeze manifest is missing.' }
foreach ($file in @($PfxPath, $PasswordDpapiPath, $PublicCertificatePath)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Signing input is missing: $file" }
  $absolute = [IO.Path]::GetFullPath($file)
  $checkout = [IO.Path]::GetFullPath($repo).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if ($absolute.StartsWith($checkout, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Signing inputs must remain outside the source checkout.'
  }
}
$thumbprint = ($ExpectedThumbprint -replace '\s', '').ToUpperInvariant()
if ($thumbprint -notmatch '^[0-9A-F]{40}$') { throw 'Expected thumbprint must be 40 hexadecimal characters.' }
$published = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($PublicCertificatePath)
if ($published.Thumbprint.ToUpperInvariant() -ne $thumbprint) { throw 'Public certificate thumbprint differs.' }

$protectedPassword = Get-Content -Raw -LiteralPath $PasswordDpapiPath
$securePassword = ConvertTo-SecureString $protectedPassword
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
$pfxBytes = [IO.File]::ReadAllBytes([IO.Path]::GetFullPath($PfxPath))
$certificates = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
try {
  $certificates.Import($pfxBytes, $password,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
  $signers = @($certificates | Where-Object { $_.HasPrivateKey })
  if ($signers.Count -ne 1 -or $signers[0].Thumbprint.ToUpperInvariant() -ne $thumbprint -or
      $signers[0].Subject -ne $signers[0].Issuer -or
      $signers[0].NotAfter.ToUniversalTime() -le [DateTime]::UtcNow) {
    throw 'PFX must contain exactly one current self-signed private-key certificate with the expected thumbprint.'
  }
  $eku = $signers[0].Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | Select-Object -First 1
  if (-not $eku -or -not @($eku.EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' }).Count) {
    throw 'Prerelease signer lacks Code Signing usage.'
  }
} finally { foreach ($certificate in $certificates) { $certificate.Dispose() } }

Push-Location $repo
try {
  node scripts/verify-release20-freeze.mjs $FreezeManifest
  if ($LASTEXITCODE -ne 0) { throw 'Source differs from the reviewed freeze manifest.' }
  if ($PreflightOnly) {
    Write-Host "Self-signed prerelease inputs match clean source $commit and signer $thumbprint."
    return
  }

  if (-not $OutputRoot) { $OutputRoot = Join-Path $env:TEMP ('math3d-2.0-selfsigned-' + $commit.Substring(0, 8)) }
  $output = [IO.Path]::GetFullPath($OutputRoot)
  $tempBase = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
  if (-not $output.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -or
      (Test-Path -LiteralPath $output)) {
    throw 'OutputRoot must be a new child of the temporary directory.'
  }
  $nsisRoot = Join-Path $env:TEMP ('math3d-2.0-prerelease-nsis-' + [guid]::NewGuid().ToString('N'))
  ./scripts/prepare-qi40-nsis313.ps1 -OutputRoot $nsisRoot
  ./scripts/test-release20-nsis-include.ps1 -MakensisPath (Join-Path $env:ELECTRON_BUILDER_NSIS_DIR 'Bin/makensis.exe')

  $previousCscLink = $env:CSC_LINK
  $previousCscPassword = $env:CSC_KEY_PASSWORD
  $previousTimestamp = $env:MATH3D_WINDOWS_TIMESTAMP_URL
  $previousCi = $env:CI
  try {
    $env:CSC_LINK = [Convert]::ToBase64String($pfxBytes)
    $env:CSC_KEY_PASSWORD = $password
    $env:MATH3D_WINDOWS_TIMESTAMP_URL = 'http://timestamp.digicert.com'
    $env:CI = 'false'
    npm run dist:ci
    if ($LASTEXITCODE -ne 0) { throw 'Self-signed prerelease packaging failed.' }
  } finally {
    if ($null -eq $previousCscLink) { Remove-Item Env:CSC_LINK -ErrorAction SilentlyContinue }
    else { $env:CSC_LINK = $previousCscLink }
    if ($null -eq $previousCscPassword) { Remove-Item Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue }
    else { $env:CSC_KEY_PASSWORD = $previousCscPassword }
    if ($null -eq $previousTimestamp) { Remove-Item Env:MATH3D_WINDOWS_TIMESTAMP_URL -ErrorAction SilentlyContinue }
    else { $env:MATH3D_WINDOWS_TIMESTAMP_URL = $previousTimestamp }
    if ($null -eq $previousCi) { Remove-Item Env:CI -ErrorAction SilentlyContinue }
    else { $env:CI = $previousCi }
  }

  $app = Join-Path $repo 'release/win-unpacked/Math3D.exe'
  $worker = Join-Path $repo 'release/win-unpacked/resources/python-worker/worker.exe'
  $installer = Join-Path $repo 'release/Math3D Setup 2.0.0.exe'
  foreach ($file in @($app, $worker, $installer)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Packaged executable is missing: $file" }
  }
  node scripts/smoke-python-worker.mjs --exe $worker
  if ($LASTEXITCODE -ne 0) { throw 'Frozen worker protocol smoke failed.' }

  New-Item -ItemType Directory -Path $output | Out-Null
  $staged = Join-Path $output 'Math3D-Setup-2.0.0-selfsigned-prerelease.exe'
  Copy-Item -LiteralPath $installer -Destination $staged
  Copy-Item -LiteralPath $FreezeManifest -Destination (Join-Path $output 'freeze-manifest.json')
  Copy-Item -LiteralPath $PublicCertificatePath -Destination (Join-Path $output 'signer-public.cer')
  ./scripts/verify-release20-selfsigned-prerelease.ps1 -Paths @($staged, $app, $worker) `
    -ExpectedThumbprint $thumbprint | Set-Content -LiteralPath (Join-Path $output 'signatures.json') -Encoding UTF8
  ./scripts/verify-release20-nsis.ps1 -InstallerPath $staged |
    Set-Content -LiteralPath (Join-Path $output 'nsis.json') -Encoding UTF8
  node scripts/generate-release-sbom.mjs --target windows `
    --app-dir (Join-Path $repo 'release/win-unpacked') --out (Join-Path $output 'sbom') --version 2.0.0
  if ($LASTEXITCODE -ne 0) { throw 'Prerelease SBOM generation failed.' }
  node scripts/prepare-public-source-bundle.mjs --target windows `
    --out (Join-Path $output 'source') --version 2.0.0
  if ($LASTEXITCODE -ne 0) { throw 'Prerelease corresponding-source bundle failed.' }

  [ordered]@{
    schema = 'math3d/release20-selfsigned-prerelease/v1'
    version = '2.0.0'
    sourceCommit = $commit
    trust = 'self-signed-untrusted-by-default'
    publiclyTrustedPublisher = $false
    signerThumbprint = $thumbprint
    freezeSha256 = (Get-FileHash -LiteralPath $FreezeManifest -Algorithm SHA256).Hash.ToLowerInvariant()
    installerSha256 = (Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant()
    appSha256 = (Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash.ToLowerInvariant()
    workerSha256 = (Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash.ToLowerInvariant()
    installedJourneysQualified = $false
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'prerelease-manifest.json') -Encoding UTF8
  Write-Host "Self-signed 2.0 prerelease and receipts: $output"
} finally {
  Pop-Location
  $password = $null
  [Array]::Clear($pfxBytes, 0, $pfxBytes.Length)
}
