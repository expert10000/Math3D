param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[1-9][0-9]*$')][string]$ReleaseId,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$InstallerSha256,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{64}$')][string]$FreezeSha256,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-F0-9]{40}$')][string]$SignerThumbprint,
  [Parameter(Mandatory = $true)][string]$ArtifactRoot
)

$ErrorActionPreference = 'Stop'
if (-not $env:GH_TOKEN) { throw 'A repository-scoped draft release token is required in GH_TOKEN.' }
if (Test-Path -LiteralPath $ArtifactRoot) { throw 'ArtifactRoot must be new.' }
$repo = Split-Path -Parent $PSScriptRoot
$release = & gh api "repos/expert10000/Math3D/releases/$ReleaseId" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $release) { throw 'Draft release lookup failed.' }
if ($release.draft -ne $true -or $release.published_at -or $release.target_commitish -ne $SourceCommit) {
  throw 'Release must remain draft and target the approved source commit.'
}
$names = @('Math3D-Setup-2.0.0-selfsigned-prerelease.exe', 'prerelease-manifest.json', 'freeze-manifest.json')
foreach ($name in $names) {
  $assets = @($release.assets | Where-Object { $_.name -eq $name -and $_.state -eq 'uploaded' })
  if ($assets.Count -ne 1) { throw "Draft release must contain exactly one uploaded $name asset." }
}
New-Item -ItemType Directory -Path $ArtifactRoot | Out-Null
foreach ($name in $names) {
  & gh release download $release.tag_name --repo expert10000/Math3D --pattern $name --dir $ArtifactRoot
  if ($LASTEXITCODE -ne 0) { throw "Draft release download failed for $name." }
}
$installer = Join-Path $ArtifactRoot $names[0]
$manifestPath = Join-Path $ArtifactRoot $names[1]
$freezePath = Join-Path $ArtifactRoot $names[2]
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$actualInstallerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$actualFreezeSha256 = (Get-FileHash -LiteralPath $freezePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($manifest.schema -ne 'math3d/release20-selfsigned-prerelease/v1' -or
    $manifest.sourceCommit -ne $SourceCommit -or
    $manifest.installerSha256 -ne $InstallerSha256 -or
    $manifest.freezeSha256 -ne $FreezeSha256 -or
    $manifest.signerThumbprint -ne $SignerThumbprint -or
    $manifest.publiclyTrustedPublisher -ne $false -or
    $manifest.trust -ne 'self-signed-untrusted-by-default' -or
    $actualInstallerSha256 -ne $InstallerSha256 -or
    $actualFreezeSha256 -ne $FreezeSha256) {
  throw 'Downloaded draft assets differ from the approved signed candidate.'
}
$signature = & (Join-Path $repo 'scripts/verify-release20-selfsigned-prerelease.ps1') -Paths @($installer) -ExpectedThumbprint $SignerThumbprint | ConvertFrom-Json
if ($signature.files.Count -ne 1 -or $signature.files[0].sha256 -ne $InstallerSha256) {
  throw 'Downloaded installer signature verification failed.'
}
$nsis = & (Join-Path $repo 'scripts/verify-release20-nsis.ps1') -InstallerPath $installer | ConvertFrom-Json
if ($nsis.installerSha256 -ne $InstallerSha256) { throw 'Downloaded installer NSIS verification failed.' }
[ordered]@{
  schema = 'math3d/release20-selfsigned-draft-stage/v1'; status = 'passed'
  releaseId = $ReleaseId; sourceCommit = $SourceCommit; installerSha256 = $actualInstallerSha256
  freezeSha256 = $actualFreezeSha256; signerThumbprint = $SignerThumbprint
  trust = 'self-signed-untrusted-by-default'; publiclyTrustedPublisher = $false
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $ArtifactRoot 'stage-receipt.json') -Encoding UTF8
