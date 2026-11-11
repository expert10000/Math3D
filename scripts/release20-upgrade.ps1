param(
  [Parameter(Mandatory = $true)][string]$OldInstaller,
  [Parameter(Mandatory = $true)][string]$CandidateInstaller,
  [Parameter(Mandatory = $true)][string]$CandidateManifest,
  [string]$WorkRoot = "",
  [string]$EvidencePath = ""
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'M3D20-13c requires a clean Windows VM.' }
$repo = Split-Path -Parent $PSScriptRoot
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if (-not $WorkRoot) { $WorkRoot = Join-Path $temporaryBase 'math3d-17-to-20-upgrade' }
if (-not $EvidencePath) { $EvidencePath = Join-Path $repo 'test-results/release20-upgrade.json' }
$temp = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$root = [IO.Path]::GetFullPath($WorkRoot).TrimEnd('\', '/')
if (-not $root.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or $root -eq $temp.TrimEnd('\', '/')) {
  throw 'WorkRoot must be a fresh child of the temporary directory.'
}
if (Test-Path -LiteralPath $root) { throw "WorkRoot already exists; use a clean Windows VM: $root" }
$registered = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue } |
  Where-Object { $_.DisplayName -eq 'Math3D' })
if ($registered.Count) { throw 'A stable Math3D installation is registered; use a clean Windows VM.' }

$old = (Resolve-Path -LiteralPath $OldInstaller).Path
$candidateFile = (Resolve-Path -LiteralPath $CandidateInstaller).Path
$oldHash = (Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant()
if ([IO.Path]::GetFileName($old) -ne 'Math3D-Setup-1.7.0.exe' -or
    $oldHash -ne 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db') {
  throw 'Old installer is not the exact published Math3D v1.7.0 asset.'
}
$candidateCheck = & node (Join-Path $repo 'scripts/verify-release20-candidate.mjs') $CandidateManifest $candidateFile
if ($LASTEXITCODE -ne 0) { throw 'Exact 2.0 candidate verification failed.' }
$identity = $candidateCheck | ConvertFrom-Json
$candidateHash = $identity.installerSha256
$signature = Get-AuthenticodeSignature -LiteralPath $candidateFile
if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
    $signature.SignerCertificate.Thumbprint.ToLowerInvariant() -ne $identity.signerThumbprint) {
  throw "Candidate installer signature or signer differs from manifest: $($signature.Status)"
}
$nsisCheck = & (Join-Path $repo 'scripts/verify-release20-nsis.ps1') -InstallerPath $candidateFile | ConvertFrom-Json
if ($nsisCheck.installerSha256 -ne $candidateHash -or $nsisCheck.systemDllSha256 -ne $identity.nsisSystemDllSha256) {
  throw 'Embedded NSIS component differs from candidate.'
}

$install = Join-Path $root 'Math3D'
$profile = Join-Path $root 'profile'
$backup = Join-Path $root 'profile-before-2.0'
$rollbackProfile = Join-Path $root 'profile-rollback-rehearsal'
$seedFile = Join-Path $root 'seed.json'
$verifyFile = Join-Path $root 'verify.json'
$evidence = [ordered]@{
  schema = 'math3d/release20-upgrade/v1'; status = 'started'; checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  oldVersion = '1.7.0'; oldInstallerSha256 = $oldHash; candidateVersion = '2.0.0'
  candidateCommit = $identity.commit; candidateInstallerSha256 = $candidateHash
  signerThumbprint = $signature.SignerCertificate.Thumbprint
  checks = [ordered]@{ exactBytes = 'passed'; signature = 'passed'; pinnedNsis = 'passed'; oldInstall = 'pending'; seed = 'pending'
    profileBackup = 'pending'; inPlaceUpgrade = 'pending'; retainedBytesAndSetting = 'pending'; rollback = 'pending' }
  failure = $null
}
function Invoke-Installer([string]$file, [string]$phase) {
  $process = Start-Process -FilePath $file -ArgumentList @('/S', '/CURRENTUSER', "/D=$install") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id -Force; throw "$phase installer exceeded 180 seconds." }
  if ($process.ExitCode -ne 0) { throw "$phase installer exited with code $($process.ExitCode)." }
  if (-not (Test-Path -LiteralPath (Join-Path $install 'Math3D.exe') -PathType Leaf)) { throw "$phase installed executable missing." }
}
function Invoke-Phase([string]$phase, [string]$result) {
  $env:MATH3D_PACKAGED_APP_EXE = Join-Path $install 'Math3D.exe'
  $env:MATH3D_RELEASE20_UPGRADE_PHASE = $phase
  $env:MATH3D_RELEASE20_UPGRADE_PROFILE = $profile
  $env:MATH3D_RELEASE20_UPGRADE_SEED = $seedFile
  $env:MATH3D_RELEASE20_UPGRADE_RESULT = $result
  Push-Location $repo
  try {
    & (Join-Path $repo 'node_modules/.bin/playwright.cmd') test tests/e2e/release20-upgrade-project-settings.spec.ts --reporter=list
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $result -PathType Leaf)) { throw "$phase UI verification failed or wrote no evidence." }
    $record = Get-Content -LiteralPath $result -Raw | ConvertFrom-Json
    if ($record.schema -ne 'math3d/release20-upgrade-phase/v1' -or $record.phase -ne $phase -or
      $record.version -ne $(if ($phase -eq 'verify') { '2.0.0' } else { '1.7.0' }) -or
      -not $record.settingOff -or $record.projectTitle -ne 'Upgrade Graph from v1.7.0' -or
      $record.checkpointSha256 -notmatch '^[0-9a-f]{64}$') {
      throw "$phase UI evidence is incomplete."
    }
  } finally {
    Pop-Location
    foreach ($name in @('MATH3D_PACKAGED_APP_EXE', 'MATH3D_RELEASE20_UPGRADE_PHASE', 'MATH3D_RELEASE20_UPGRADE_PROFILE',
      'MATH3D_RELEASE20_UPGRADE_SEED', 'MATH3D_RELEASE20_UPGRADE_RESULT')) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
  }
}
try {
  New-Item -ItemType Directory -Path $root | Out-Null
  Invoke-Installer $old 'Published 1.7.0'
  $evidence.checks.oldInstall = 'passed'
  Invoke-Phase 'seed' $seedFile
  $evidence.checkpointSha256 = (Get-Content -LiteralPath $seedFile -Raw | ConvertFrom-Json).checkpointSha256
  $evidence.seedSha256 = (Get-FileHash -LiteralPath $seedFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.seed = 'passed'
  $inventoryScript = Join-Path $repo 'scripts/release20-profile-inventory.mjs'
  $originalInventory = & node $inventoryScript $profile | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Could not inventory original 1.7 profile.' }
  Copy-Item -LiteralPath $profile -Destination $backup -Recurse
  if (-not (Test-Path -LiteralPath (Join-Path $backup 'user-data') -PathType Container)) { throw 'Original profile backup is incomplete.' }
  $backupInventory = & node $inventoryScript $backup | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $backupInventory.digest -ne $originalInventory.digest) {
    throw 'Original profile backup differs from the 1.7 source profile.'
  }
  $evidence.profileBackup = $backup
  $evidence.profileInventorySha256 = $originalInventory.digest
  $evidence.profileFileCount = $originalInventory.fileCount
  $evidence.checks.profileBackup = 'passed'
  Invoke-Installer $candidateFile 'Candidate 2.0.0'
  foreach ($signed in @(@{ path = (Join-Path $install 'Math3D.exe'); digest = $identity.executableSha256 },
      @{ path = (Join-Path $install 'resources/python-worker/worker.exe'); digest = $identity.workerSha256 })) {
    if ((Get-FileHash -LiteralPath $signed.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $signed.digest) {
      throw "Upgraded executable bytes differ from candidate: $($signed.path)"
    }
    $installedSignature = Get-AuthenticodeSignature -LiteralPath $signed.path
    if ($installedSignature.Status -ne 'Valid' -or -not $installedSignature.SignerCertificate -or
        $installedSignature.SignerCertificate.Thumbprint.ToLowerInvariant() -ne $identity.signerThumbprint) {
      throw "Upgraded executable signature differs from candidate: $($signed.path)"
    }
  }
  $evidence.checks.inPlaceUpgrade = 'passed'
  Invoke-Phase 'verify' $verifyFile
  $verification = Get-Content -LiteralPath $verifyFile -Raw | ConvertFrom-Json
  if ($verification.checkpointSha256 -ne $evidence.checkpointSha256) { throw 'Graph Project bytes changed across upgrade.' }
  $evidence.verifySha256 = (Get-FileHash -LiteralPath $verifyFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.retainedBytesAndSetting = 'passed'
  $backupAfter = & node $inventoryScript $backup | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $backupAfter.digest -ne $originalInventory.digest) {
    throw 'Upgrade changed the saved 1.7 profile backup.'
  }
  Copy-Item -LiteralPath $backup -Destination $rollbackProfile -Recurse
  $rollbackInventory = & node $inventoryScript $rollbackProfile | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $rollbackInventory.digest -ne $originalInventory.digest) {
    throw 'Rollback profile differs from original 1.7 bytes.'
  }
  $profile = $rollbackProfile
  Invoke-Installer $old 'Rollback 1.7.0'
  $rollbackFile = Join-Path $root 'rollback.json'
  Invoke-Phase 'rollback' $rollbackFile
  $rollback = Get-Content -LiteralPath $rollbackFile -Raw | ConvertFrom-Json
  if ($rollback.checkpointSha256 -ne $evidence.checkpointSha256) { throw 'Rollback did not reopen original Graph bytes.' }
  $evidence.rollbackSha256 = (Get-FileHash -LiteralPath $rollbackFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.rollback = 'passed'
  $evidence.status = 'passed'
} catch {
  $evidence.status = 'failed'; $evidence.failure = $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "M3D20-13c evidence: $EvidencePath"
}
