param(
  [Parameter(Mandatory = $true)][string[]]$Paths,
  [Parameter(Mandatory = $true)][string]$ExpectedThumbprint
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Authenticode verification requires Windows.' }
$thumbprint = ($ExpectedThumbprint -replace '\s', '').ToUpperInvariant()
if ($thumbprint -notmatch '^[0-9A-F]{40}$') { throw 'Expected thumbprint must be 40 hexadecimal characters.' }

$files = @()
foreach ($path in $Paths) {
  $file = [IO.Path]::GetFullPath($path)
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Signed file missing: $file" }
  $signature = Get-AuthenticodeSignature -LiteralPath $file
  $certificate = $signature.SignerCertificate
  if (-not $certificate -or $certificate.Thumbprint.ToUpperInvariant() -ne $thumbprint) {
    throw "Unexpected or missing Authenticode signer: $file"
  }
  # An untrusted self-signed root reports UnknownError. HashMismatch and every
  # other status remain failures. A locally trusted copy may report Valid.
  if ([string]$signature.Status -notin @('Valid', 'UnknownError')) {
    throw "Authenticode integrity failed: $file ($($signature.Status))"
  }
  if ($certificate.Subject -ne $certificate.Issuer -or
      $certificate.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow -or
      $certificate.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow) {
    throw "Expected a current self-signed certificate: $file"
  }
  $eku = $certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | Select-Object -First 1
  if (-not $eku -or -not @($eku.EnhancedKeyUsages | Where-Object { $_.Value -eq '1.3.6.1.5.5.7.3.3' }).Count) {
    throw "Signer lacks the Code Signing enhanced key usage: $file"
  }
  if (-not $signature.TimeStamperCertificate) { throw "Signature lacks a timestamp: $file" }

  $chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
  try {
    $chain.ChainPolicy.TrustMode = [System.Security.Cryptography.X509Certificates.X509ChainTrustMode]::CustomRootTrust
    $chain.ChainPolicy.CustomTrustStore.Add($certificate) | Out-Null
    $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
    if (-not $chain.Build($certificate)) { throw "Self-signed certificate chain is invalid: $file" }
  } finally { $chain.Dispose() }

  $files += [ordered]@{
    name = [IO.Path]::GetFileName($file)
    sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    signerThumbprint = $thumbprint
    authenticodeStatus = [string]$signature.Status
    timestamped = $true
  }
}

[ordered]@{
  schema = 'math3d/release20-selfsigned-prerelease-signatures/v1'
  trust = 'self-signed-untrusted-by-default'
  publiclyTrustedPublisher = $false
  signerThumbprint = $thumbprint
  files = $files
} | ConvertTo-Json -Depth 5
