$ErrorActionPreference = 'Stop'

$encoded = $env:MATH3D_WINDOWS_CSC_LINK
$password = $env:MATH3D_WINDOWS_CSC_KEY_PASSWORD
$expected = ($env:MATH3D_WINDOWS_SIGNER_THUMBPRINT -replace '\s', '').ToUpperInvariant()
$timestamp = $env:MATH3D_WINDOWS_TIMESTAMP_URL
if ([string]::IsNullOrWhiteSpace($encoded) -or [string]::IsNullOrWhiteSpace($password) -or
    $expected -notmatch '^[0-9A-F]{40}$' -or [string]::IsNullOrWhiteSpace($timestamp)) {
  throw 'Windows signing certificate, password, 40-character thumbprint, and timestamp URL are required.'
}

$timestampUri = [Uri]$null
if (-not [Uri]::TryCreate($timestamp, [UriKind]::Absolute, [ref]$timestampUri) -or
    $timestampUri.Scheme -notin @('http', 'https') -or [string]::IsNullOrWhiteSpace($timestampUri.Host)) {
  throw 'Windows timestamp URL must be an absolute HTTP or HTTPS URL.'
}

$certificates = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
try {
  $bytes = [Convert]::FromBase64String($encoded)
  $certificates.Import($bytes, $password,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
  $signers = @($certificates | Where-Object { $_.HasPrivateKey })
  if ($signers.Count -ne 1) { throw 'Windows signing PFX must contain exactly one private-key certificate.' }
  $signer = $signers[0]
  if ($signer.Thumbprint.ToUpperInvariant() -ne $expected) {
    throw 'Windows signing certificate does not match the approved thumbprint.'
  }
  $now = [DateTime]::UtcNow
  if ($signer.NotBefore.ToUniversalTime() -gt $now -or $signer.NotAfter.ToUniversalTime() -le $now) {
    throw 'Windows signing certificate is outside its validity period.'
  }
  $eku = $signer.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | Select-Object -First 1
  if (-not $eku -or -not @($eku.EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' }).Count) {
    throw 'Windows signing certificate lacks the code-signing enhanced key usage.'
  }
  Write-Host 'Windows signing PFX, private key, thumbprint, validity, code-signing usage, and timestamp URL validated.'
} finally {
  foreach ($certificate in $certificates) { $certificate.Dispose() }
}
