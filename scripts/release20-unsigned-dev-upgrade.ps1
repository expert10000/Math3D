param(
  [Parameter(Mandatory = $true)][string]$OldInstaller,
  [Parameter(Mandatory = $true)][string]$ChecksumsPath,
  [Parameter(Mandatory = $true)][string]$ReleaseManifestPath,
  [Parameter(Mandatory = $true)][string]$DevInstaller,
  [string]$WorkRoot = '',
  [string]$EvidencePath = '',
  [switch]$PreserveLocalRegistration,
  [string]$OldPortableZip = '',
  [string]$DevInstalledDirectory = '',
  [string]$ExpectedDevExecutableSha256 = '',
  [string]$ExpectedDevAsarSha256 = '',
  [string]$ExpectedDevWorkerSha256 = ''
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'The Dev upgrade rehearsal requires a clean Windows runner.' }
$repo = Split-Path -Parent $PSScriptRoot
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if (-not $WorkRoot) { $WorkRoot = Join-Path $temporaryBase 'math3d-17-to-dev-upgrade' }
if (-not $EvidencePath) { $EvidencePath = Join-Path $temporaryBase 'release20-unsigned-dev-upgrade.json' }
$temp = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$root = [IO.Path]::GetFullPath($WorkRoot).TrimEnd('\', '/')
if (-not $root.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or $root -eq $temp.TrimEnd('\', '/')) {
  throw 'WorkRoot must be a fresh child of the temporary directory.'
}
if (Test-Path -LiteralPath $root) { throw "WorkRoot already exists: $root" }
$registered = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue } |
  Where-Object { $_.DisplayName -eq 'Math3D' })
if ($registered.Count -and -not $PreserveLocalRegistration -and -not ($OldPortableZip -and $DevInstalledDirectory)) {
  throw 'A stable Math3D installation is registered; use a clean Windows runner.'
}
if ($DevInstalledDirectory -and (-not $OldPortableZip -or @($ExpectedDevExecutableSha256,
      $ExpectedDevAsarSha256, $ExpectedDevWorkerSha256 | Where-Object { $_ -notmatch '^[0-9a-fA-F]{64}$' }).Count)) {
  throw 'Payload overlay requires a published portable baseline and three expected payload SHA-256 values.'
}

$registryRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$registrationBefore = @()
$shortcutsBefore = @()
if ($PreserveLocalRegistration) {
  # This guarded mode changes only a disposable installation directory. Snapshot
  # the two installer registrations and shortcuts that NSIS can update locally.
  New-Item -ItemType Directory -Path $root | Out-Null
  $registrationBefore = @(Get-ChildItem $registryRoot | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } |
    Where-Object { $_.DisplayName -in @('Math3D', 'Math3D Dev') })
  foreach ($item in $registrationBefore) {
    $saved = Join-Path $root "registration-$($item.PSChildName).reg"
    & reg.exe export "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\$($item.PSChildName)" $saved /y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not back up registration $($item.PSChildName)" }
  }
  $shortcutRoots = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
  $shortcutsBefore = @(foreach ($directory in $shortcutRoots) {
    Get-ChildItem -LiteralPath $directory -Filter 'Math3D*.lnk' -File -Recurse -ErrorAction SilentlyContinue
  })
  $shortcutBackup = Join-Path $root 'shortcut-backup'
  New-Item -ItemType Directory -Path $shortcutBackup | Out-Null
  $shortcutsBefore = @($shortcutsBefore | ForEach-Object -Begin { $index = 0 } -Process {
    $saved = Join-Path $shortcutBackup "$index.lnk"; $index++
    Copy-Item -LiteralPath $_.FullName -Destination $saved
    [pscustomobject]@{ FullName = $_.FullName; Saved = $saved;
      Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  })
}

$install = Join-Path $root 'Math3D'
$rollbackInstall = Join-Path $root 'published-1.7-install-copy'
$profile = Join-Path $root 'profile'
$backup = Join-Path $root 'profile-before-dev'
$rollbackProfile = Join-Path $root 'profile-rollback'
$seedFile = Join-Path $root 'seed.json'
$verifyFile = Join-Path $root 'verify.json'
$rollbackFile = Join-Path $root 'rollback.json'
$inventoryScript = Join-Path $repo 'scripts/release20-profile-inventory.mjs'
$evidence = [ordered]@{
  schema = 'math3d/release20-unsigned-dev-upgrade-rehearsal/v1'; status = 'started'
  sourceCommit = (& git -C $repo rev-parse HEAD).Trim()
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  installMode = 'same-directory-dev-overlay'; stableIdentityUpgrade = $false
  oldPayloadMode = if ($OldPortableZip) { 'published-portable-extraction' } else { 'published-installer' }
  devPayloadMode = if ($DevInstalledDirectory) { 'previously-installed-payload-copy' } else { 'installer' }
  oldVersion = '1.7.0'; devVersion = '2.0.0'; oldInstallerSha256 = $null
  devInstallerSha256 = $null; oldInstalledExecutableSha256 = $null
  devInstalledExecutableSha256 = $null; checkpointSha256 = $null
  profileInventorySha256 = $null; profileFileCount = $null
  checks = [ordered]@{ publishedBytes = 'pending'; unsignedDevBytes = 'pending'; oldInstall = 'pending'
    seed = 'pending'; profileBackup = 'pending'; sameDirectoryDevInstall = 'pending'; sameDirectoryDevPayload = 'pending'
    retainedProjectAndSetting = 'pending'; rollbackProfile = 'pending'; rollbackOpen = 'pending' }
  failure = $null
}
function Invoke-Installer([string]$file, [string]$phase, [string]$expectedExe) {
  $process = Start-Process -FilePath $file -ArgumentList @('/S', '/CURRENTUSER', "/D=$install") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id -Force; throw "$phase installer exceeded 180 seconds." }
  if ($process.ExitCode -ne 0) { throw "$phase installer exited with code $($process.ExitCode)." }
  if (-not (Test-Path -LiteralPath (Join-Path $install $expectedExe) -PathType Leaf)) { throw "$phase installed executable missing." }
}
function Invoke-Phase([string]$phase, [string]$exe, [string]$profileRoot, [string]$result) {
  $env:MATH3D_PACKAGED_APP_EXE = $exe
  $env:MATH3D_RELEASE20_UPGRADE_PHASE = $phase
  $env:MATH3D_RELEASE20_UPGRADE_PROFILE = $profileRoot
  $env:MATH3D_RELEASE20_UPGRADE_SEED = $seedFile
  $env:MATH3D_RELEASE20_UPGRADE_RESULT = $result
  Push-Location $repo
  try {
    & (Join-Path $repo 'node_modules/.bin/playwright.cmd') test tests/e2e/release20-upgrade-project-settings.spec.ts --reporter=list |
      ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $result -PathType Leaf)) { throw "$phase UI check failed or wrote no evidence." }
    $record = Get-Content -LiteralPath $result -Raw | ConvertFrom-Json
    $expectedVersion = if ($phase -eq 'verify') { '2.0.0' } else { '1.7.0' }
    if ($record.schema -ne 'math3d/release20-upgrade-phase/v1' -or $record.phase -ne $phase -or
      $record.version -ne $expectedVersion -or -not $record.settingOff -or
      $record.projectTitle -ne 'Upgrade Graph from v1.7.0' -or $record.checkpointSha256 -notmatch '^[0-9a-f]{64}$') {
      throw "$phase UI evidence is incomplete."
    }
    return $record
  } finally {
    Pop-Location
    foreach ($name in @('MATH3D_PACKAGED_APP_EXE', 'MATH3D_RELEASE20_UPGRADE_PHASE', 'MATH3D_RELEASE20_UPGRADE_PROFILE',
        'MATH3D_RELEASE20_UPGRADE_SEED', 'MATH3D_RELEASE20_UPGRADE_RESULT')) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
  }
}
try {
  $old = (Resolve-Path -LiteralPath $OldInstaller).Path
  $checksums = (Resolve-Path -LiteralPath $ChecksumsPath).Path
  $manifestPath = (Resolve-Path -LiteralPath $ReleaseManifestPath).Path
  $dev = (Resolve-Path -LiteralPath $DevInstaller).Path
  $oldHash = (Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant()
  $lines = @(Get-Content -LiteralPath $checksums | Where-Object { $_ -match '^[0-9a-fA-F]{64}\s+\*?Math3D-Setup-1\.7\.0\.exe\s*$' })
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($lines.Count -ne 1 -or [IO.Path]::GetFileName($old) -ne 'Math3D-Setup-1.7.0.exe' -or
    $oldHash -ne 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db' -or
    $oldHash -ne ($lines[0] -split '\s+')[0].ToLowerInvariant() -or
    $manifest.math3d.version -ne '1.7.0' -or $manifest.math3d.installerName -ne 'Math3D-Setup-1.7.0.exe' -or
    $manifest.math3d.installerSha256 -ne $oldHash) { throw 'Published 1.7 bytes differ from pinned release metadata.' }
  $evidence.oldInstallerSha256 = $oldHash
  $evidence.checks.publishedBytes = 'passed'
  if ($OldPortableZip) {
    $portable = (Resolve-Path -LiteralPath $OldPortableZip).Path
    $portableHash = (Get-FileHash -LiteralPath $portable -Algorithm SHA256).Hash.ToLowerInvariant()
    if ([IO.Path]::GetFileName($portable) -ne 'Math3D-1.7.0-win-portable.zip' -or
      $portableHash -ne '08adf6505a7c556a96e67f21d2fdface4f8a40e14ffeac4dde374175731116bf') {
      throw 'Published portable 1.7 payload differs from pinned release bytes.'
    }
    $evidence.oldPortableSha256 = $portableHash
  }
  if ([IO.Path]::GetFileName($dev) -ne 'Math3D Dev Setup 2.0.0.exe') { throw 'Expected the unsigned 2.0 Dev installer.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $dev
  if ($signature.Status -ne 'NotSigned') { throw "Dev rehearsal expected an unsigned installer: $($signature.Status)" }
  $evidence.devSignatureStatus = [string]$signature.Status
  $evidence.devInstallerSha256 = (Get-FileHash -LiteralPath $dev -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.unsignedDevBytes = 'passed'

  if (-not (Test-Path -LiteralPath $root)) { New-Item -ItemType Directory -Path $root | Out-Null }
  if ($OldPortableZip) {
    New-Item -ItemType Directory -Path $install | Out-Null
    & 'C:\Program Files\7-Zip\7z.exe' x -y "-o$install" $portable | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $install 'Math3D.exe'))) {
      throw 'Published 1.7 portable extraction failed.'
    }
  } else {
    Invoke-Installer $old 'Published 1.7.0' 'Math3D.exe'
  }
  $oldExe = Join-Path $install 'Math3D.exe'
  $evidence.oldInstalledExecutableSha256 = (Get-FileHash -LiteralPath $oldExe -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.oldInstall = 'passed'
  $seed = Invoke-Phase 'seed' $oldExe $profile $seedFile
  $evidence.checkpointSha256 = $seed.checkpointSha256
  $evidence.checks.seed = 'passed'
  $original = & node $inventoryScript $profile | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Could not inventory original 1.7 profile.' }
  Copy-Item -LiteralPath $profile -Destination $backup -Recurse
  $backupInventory = & node $inventoryScript $backup | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $backupInventory.digest -ne $original.digest) { throw '1.7 profile backup differs from source.' }
  $evidence.profileInventorySha256 = $original.digest
  $evidence.profileFileCount = $original.fileCount
  $original | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $root 'profile-inventory.json') -Encoding UTF8
  Copy-Item -LiteralPath $install -Destination $rollbackInstall -Recurse
  $rollbackExe = Join-Path $rollbackInstall 'Math3D.exe'
  if ((Get-FileHash -LiteralPath $rollbackExe -Algorithm SHA256).Hash.ToLowerInvariant() -ne $evidence.oldInstalledExecutableSha256) {
    throw 'Published 1.7 rollback executable copy differs.'
  }
  $evidence.checks.profileBackup = 'passed'

  if ($DevInstalledDirectory) {
    $devPayload = (Resolve-Path -LiteralPath $DevInstalledDirectory).Path
    $files = @(
      @('Math3D Dev.exe', $ExpectedDevExecutableSha256),
      @('resources\app.asar', $ExpectedDevAsarSha256),
      @('resources\python-worker\worker.exe', $ExpectedDevWorkerSha256)
    )
    foreach ($file in $files) {
      $actual = (Get-FileHash -LiteralPath (Join-Path $devPayload $file[0]) -Algorithm SHA256).Hash
      if ($actual -ine $file[1]) { throw "Previously installed Dev payload mismatch: $($file[0])" }
    }
    & robocopy.exe $devPayload $install /E /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Previously installed Dev payload copy failed: $LASTEXITCODE" }
    foreach ($file in $files) {
      $actual = (Get-FileHash -LiteralPath (Join-Path $install $file[0]) -Algorithm SHA256).Hash
      if ($actual -ine $file[1]) { throw "Copied Dev payload mismatch: $($file[0])" }
    }
    $evidence.checks.sameDirectoryDevInstall = 'not-run'
    $evidence.checks.sameDirectoryDevPayload = 'passed'
  } else {
    Invoke-Installer $dev 'Unsigned Dev 2.0.0 overlay' 'Math3D Dev.exe'
    $evidence.checks.sameDirectoryDevInstall = 'passed'
    $evidence.checks.sameDirectoryDevPayload = 'not-applicable'
  }
  $devExe = Join-Path $install 'Math3D Dev.exe'
  $evidence.devInstalledExecutableSha256 = (Get-FileHash -LiteralPath $devExe -Algorithm SHA256).Hash.ToLowerInvariant()
  $verify = Invoke-Phase 'verify' $devExe $profile $verifyFile
  if ($verify.checkpointSha256 -ne $seed.checkpointSha256 -or $verify.checkpointBytes -cne $seed.checkpointBytes) {
    throw 'Graph Project checkpoint bytes changed across Dev overlay.'
  }
  $evidence.checks.retainedProjectAndSetting = 'passed'
  $backupAfter = & node $inventoryScript $backup | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $backupAfter.digest -ne $original.digest) { throw 'Dev overlay changed the saved 1.7 backup.' }
  Copy-Item -LiteralPath $backup -Destination $rollbackProfile -Recurse
  $rollbackInventory = & node $inventoryScript $rollbackProfile | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $rollbackInventory.digest -ne $original.digest) { throw 'Rollback profile differs from 1.7 bytes.' }
  $evidence.checks.rollbackProfile = 'passed'
  $rollback = Invoke-Phase 'rollback' $rollbackExe $rollbackProfile $rollbackFile
  if ($rollback.checkpointSha256 -ne $seed.checkpointSha256 -or $rollback.checkpointBytes -cne $seed.checkpointBytes) {
    throw 'Restored 1.7 profile did not reopen exact Graph Project bytes.'
  }
  $evidence.checks.rollbackOpen = 'passed'
  $evidence.status = 'passed'
} catch {
  $evidence.status = 'failed'; $evidence.failure = $_.Exception.Message
  throw
} finally {
  $restoreFailure = $null
  if ($PreserveLocalRegistration) {
    try {
      $registrationAfter = @(Get-ChildItem $registryRoot | ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath } |
        Where-Object { $_.DisplayName -in @('Math3D', 'Math3D Dev') })
      $oldKeys = @($registrationBefore | ForEach-Object { $_.PSChildName })
      foreach ($item in $registrationAfter) {
        if ($item.PSChildName -notin $oldKeys) {
          Remove-Item -LiteralPath (Join-Path $registryRoot $item.PSChildName) -Recurse -Force
        }
      }
      foreach ($item in $registrationBefore) {
        & reg.exe import (Join-Path $root "registration-$($item.PSChildName).reg") | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not restore registration $($item.PSChildName)" }
      }
      $shortcutRoots = @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))
      $shortcutsAfter = @(foreach ($directory in $shortcutRoots) {
        Get-ChildItem -LiteralPath $directory -Filter 'Math3D*.lnk' -File -Recurse -ErrorAction SilentlyContinue
      })
      $oldShortcutNames = @($shortcutsBefore | ForEach-Object { $_.FullName })
      foreach ($item in $shortcutsAfter) {
        if ($item.FullName -notin $oldShortcutNames) { Remove-Item -LiteralPath $item.FullName -Force }
      }
      foreach ($item in $shortcutsBefore) {
        Copy-Item -LiteralPath $item.Saved -Destination $item.FullName -Force
        if ((Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Sha256) {
          throw "Could not restore shortcut $($item.FullName)"
        }
      }
      $evidence.localRegistrationRestored = $true
    } catch {
      $restoreFailure = $_.Exception.Message
      $evidence.status = 'failed'; $evidence.localRegistrationRestored = $false
      $evidence.registrationRestoreFailure = $restoreFailure
    }
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "Unsigned Dev upgrade evidence: $EvidencePath"
  if ($restoreFailure) { throw $restoreFailure }
}
