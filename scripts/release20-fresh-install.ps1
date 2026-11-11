param(
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [Parameter(Mandatory = $true)][string]$CandidateManifest,
  [string]$InstallRoot = "",
  [string]$EvidencePath = ""
)

$ErrorActionPreference = "Stop"
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw "M3D20-13b requires a clean Windows VM." }
$repo = Split-Path -Parent $PSScriptRoot
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if (-not $InstallRoot) { $InstallRoot = Join-Path $temporaryBase "math3d-20-fresh-install" }
if (-not $EvidencePath) { $EvidencePath = Join-Path $repo "test-results/release20-fresh-install.json" }
$temp = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$install = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\', '/')
if (-not $install.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or $install -eq $temp.TrimEnd('\', '/')) {
  throw "InstallRoot must be a fresh child of the temporary directory."
}
if (Test-Path -LiteralPath $install) { throw "InstallRoot already exists; use a clean Windows VM: $install" }
$registered = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue } |
  Where-Object { $_.DisplayName -eq 'Math3D' })
if ($registered.Count) { throw "A stable Math3D installation is registered; use a clean Windows VM." }

$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
$candidateCheck = & node (Join-Path $repo 'scripts/verify-release20-candidate.mjs') $CandidateManifest $installer
if ($LASTEXITCODE -ne 0) { throw 'Exact 2.0 candidate verification failed.' }
$candidate = Get-Content -LiteralPath $CandidateManifest -Raw | ConvertFrom-Json
$identity = $candidateCheck | ConvertFrom-Json
$hash = $identity.installerSha256
$signature = Get-AuthenticodeSignature -LiteralPath $installer
if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
    $signature.SignerCertificate.Thumbprint.ToLowerInvariant() -ne $identity.signerThumbprint) {
  throw "Installer signature or signer differs from candidate: $($signature.Status)"
}
$nsisCheck = & (Join-Path $repo 'scripts/verify-release20-nsis.ps1') -InstallerPath $installer | ConvertFrom-Json
if ($nsisCheck.installerSha256 -ne $hash -or $nsisCheck.systemDllSha256 -ne $identity.nsisSystemDllSha256) {
  throw 'Embedded NSIS component differs from candidate.'
}
$evidence = [ordered]@{
  schema = 'math3d/release20-fresh-install/v1'; status = 'started'; checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  sourceCommit = $candidate.math3d.commit; version = '2.0.0'; installerSha256 = $hash
  signerThumbprint = $signature.SignerCertificate.Thumbprint; checks = [ordered]@{
    exactBytes = 'passed'; signature = 'passed'; pinnedNsis = 'passed'; cleanInstall = 'pending'; installedResources = 'pending'
    workerWithoutPython = 'pending'; firstUseStudy = 'pending'
  }; failure = $null
}
try {
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', '/CURRENTUSER', "/D=$install") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id -Force; throw "Installer exceeded 180 seconds." }
  if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)." }
  $evidence.checks.cleanInstall = 'passed'
  $app = Join-Path $install 'Math3D.exe'
  $worker = Join-Path $install 'resources/python-worker/worker.exe'
  $web = Join-Path $install 'resources/web-app/index.html'
  foreach ($file in @($app, $worker, $web)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Installed resource missing: $file" }
  }
  foreach ($signed in @(@{ path = $app; digest = $identity.executableSha256 }, @{ path = $worker; digest = $identity.workerSha256 })) {
    if ((Get-FileHash -LiteralPath $signed.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $signed.digest) {
      throw "Installed executable bytes differ from candidate: $($signed.path)"
    }
    $installedSignature = Get-AuthenticodeSignature -LiteralPath $signed.path
    if ($installedSignature.Status -ne 'Valid' -or -not $installedSignature.SignerCertificate -or
        $installedSignature.SignerCertificate.Thumbprint.ToLowerInvariant() -ne $identity.signerThumbprint) {
      throw "Installed executable signature differs from candidate: $($signed.path)"
    }
  }
  $evidence.checks.installedResources = 'passed'
  $pathBefore = $env:PATH
  try {
    $env:PATH = ($pathBefore -split ';' | Where-Object { $_ -and $_ -notmatch '(?i)python|conda' }) -join ';'
    node (Join-Path $repo 'scripts/smoke-python-worker.mjs') --exe $worker
    if ($LASTEXITCODE -ne 0) { throw "Installed worker smoke failed without Python on PATH." }
  } finally { $env:PATH = $pathBefore }
  $evidence.checks.workerWithoutPython = 'passed'
  $env:MATH3D_PACKAGED_APP_EXE = $app
  $env:MATH3D_RELEASE20_EXPECTED_VERSION = '2.0.0'
  Push-Location $repo
  try {
    & (Join-Path $repo 'node_modules/.bin/playwright.cmd') test tests/e2e/release20-first-use-study.spec.ts --reporter=list
    if ($LASTEXITCODE -ne 0) { throw "Installed first-use Study test failed." }
  } finally {
    Pop-Location
    Remove-Item Env:MATH3D_PACKAGED_APP_EXE -ErrorAction SilentlyContinue
    Remove-Item Env:MATH3D_RELEASE20_EXPECTED_VERSION -ErrorAction SilentlyContinue
  }
  $evidence.checks.firstUseStudy = 'passed'
  $evidence.status = 'passed'
} catch {
  $evidence.status = 'failed'; $evidence.failure = $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "M3D20-13b evidence: $EvidencePath"
}
