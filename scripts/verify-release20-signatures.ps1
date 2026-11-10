param(
  [string]$AssetsRoot = 'release-assets',
  [string]$UnpackedRoot = 'release/win-unpacked',
  [Parameter(Mandatory = $true)][string]$ExpectedThumbprint
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Windows Authenticode is required.' }
$thumbprint = ($ExpectedThumbprint -replace '\s', '').ToUpperInvariant()
if ($thumbprint -notmatch '^[0-9A-F]{40}$') { throw 'Expected signing certificate thumbprint must be 40 hex characters.' }
$files = @(
  (Join-Path $AssetsRoot 'Math3D-Setup-2.0.0.exe'),
  (Join-Path $UnpackedRoot 'Math3D.exe'),
  (Join-Path $UnpackedRoot 'resources/python-worker/worker.exe')
)
$native = Join-Path $UnpackedRoot 'resources/native-cgal/math3d-cgal-worker.exe'
if (Test-Path -LiteralPath $native -PathType Leaf) { $files += $native }
elseif (Test-Path -LiteralPath (Join-Path $UnpackedRoot 'resources/native-cgal')) {
  throw 'Native CGAL resource exists without its signed worker executable.'
}
$evidence = [ordered]@{ schema = 'math3d/release20-signatures/v1'; version = '2.0.0'; thumbprint = $thumbprint; files = @() }
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Signed executable missing: $file" }
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
      $signature.SignerCertificate.Thumbprint.ToUpperInvariant() -ne $thumbprint) {
    throw "Invalid or unexpected Authenticode signer: $file ($($signature.Status))"
  }
  $evidence.files += [ordered]@{ name = $file; sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$evidence | ConvertTo-Json -Depth 5
