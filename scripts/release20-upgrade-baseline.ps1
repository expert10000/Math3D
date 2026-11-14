param(
  [Parameter(Mandatory = $true)][string]$OldInstaller,
  [Parameter(Mandatory = $true)][string]$ChecksumsPath,
  [Parameter(Mandatory = $true)][string]$ReleaseManifestPath,
  [string]$WorkRoot = '',
  [string]$EvidencePath = ''
)

$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'The 1.7 baseline requires a clean Windows runner.' }
$repo = Split-Path -Parent $PSScriptRoot
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
if (-not $WorkRoot) { $WorkRoot = Join-Path $temporaryBase 'math3d-17-baseline' }
if (-not $EvidencePath) { $EvidencePath = Join-Path $temporaryBase 'release20-upgrade-baseline.json' }
$temp = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$root = [IO.Path]::GetFullPath($WorkRoot).TrimEnd('\', '/')
if (-not $root.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or $root -eq $temp.TrimEnd('\', '/')) {
  throw 'WorkRoot must be a fresh child of the temporary directory.'
}
if (Test-Path -LiteralPath $root) { throw "WorkRoot already exists: $root" }
$registered = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
  ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue } |
  Where-Object { $_.DisplayName -eq 'Math3D' })
if ($registered.Count) { throw 'A stable Math3D installation is registered; use a clean Windows runner.' }

$install = Join-Path $root 'Math3D'
$profile = Join-Path $root 'profile'
$backup = Join-Path $root 'profile-before-2.0'
$rollbackProfile = Join-Path $root 'profile-rollback-rehearsal'
$seedFile = Join-Path $root 'seed.json'
$rollbackFile = Join-Path $root 'rollback.json'
$evidence = [ordered]@{
  schema = 'math3d/release20-upgrade-baseline/v1'; status = 'started'
  checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  sourceCommit = (& git -C $repo rev-parse HEAD).Trim()
  oldVersion = '1.7.0'; oldInstallerSha256 = $null; publishedChecksumSha256 = $null
  releaseManifestSha256 = $null; checkpointSha256 = $null; profileInventorySha256 = $null
  profileFileCount = $null; installedExecutableSha256 = $null
  checks = [ordered]@{ exactPublishedBytes = 'pending'; oldInstall = 'pending'; seed = 'pending'
    profileBackup = 'pending'; rollbackProfile = 'pending'; reinstall = 'pending'; rollbackOpen = 'pending'; backupUnchanged = 'pending' }
  failure = $null
}
function Invoke-Installer([string]$file, [string]$phase) {
  $process = Start-Process -FilePath $file -ArgumentList @('/S', '/CURRENTUSER', "/D=$install") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id -Force; throw "$phase installer exceeded 180 seconds." }
  if ($process.ExitCode -ne 0) { throw "$phase installer exited with code $($process.ExitCode)." }
  if (-not (Test-Path -LiteralPath (Join-Path $install 'Math3D.exe') -PathType Leaf)) { throw "$phase installed executable missing." }
}
function Invoke-Phase([string]$phase, [string]$result, [string]$profileRoot) {
  $env:MATH3D_PACKAGED_APP_EXE = Join-Path $install 'Math3D.exe'
  $env:MATH3D_RELEASE20_UPGRADE_PHASE = $phase
  $env:MATH3D_RELEASE20_UPGRADE_PROFILE = $profileRoot
  $env:MATH3D_RELEASE20_UPGRADE_SEED = $seedFile
  $env:MATH3D_RELEASE20_UPGRADE_RESULT = $result
  Push-Location $repo
  try {
    & (Join-Path $repo 'node_modules/.bin/playwright.cmd') test tests/e2e/release20-upgrade-project-settings.spec.ts --reporter=list
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $result -PathType Leaf)) { throw "$phase UI check failed or wrote no evidence." }
    $record = Get-Content -LiteralPath $result -Raw | ConvertFrom-Json
    if ($record.schema -ne 'math3d/release20-upgrade-phase/v1' -or $record.phase -ne $phase -or
      $record.version -ne '1.7.0' -or -not $record.settingOff -or
      $record.projectTitle -ne 'Upgrade Graph from v1.7.0' -or $record.checkpointSha256 -notmatch '^[0-9a-f]{64}$') {
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
  $old = (Resolve-Path -LiteralPath $OldInstaller).Path
  $checksums = (Resolve-Path -LiteralPath $ChecksumsPath).Path
  $manifestPath = (Resolve-Path -LiteralPath $ReleaseManifestPath).Path
  $oldHash = (Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant()
  $lines = @(Get-Content -LiteralPath $checksums | Where-Object { $_ -match '^[0-9a-fA-F]{64}\s+\*?Math3D-Setup-1\.7\.0\.exe\s*$' })
  if ($lines.Count -ne 1) { throw 'Published SHA256SUMS.txt has no unique Math3D 1.7 installer entry.' }
  $publishedHash = ($lines[0] -split '\s+')[0].ToLowerInvariant()
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ([IO.Path]::GetFileName($old) -ne 'Math3D-Setup-1.7.0.exe' -or
      $oldHash -ne 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db' -or
      $oldHash -ne $publishedHash -or $manifest.math3d.version -ne '1.7.0' -or
      $manifest.math3d.installerName -ne 'Math3D-Setup-1.7.0.exe' -or
      $manifest.math3d.installerSha256 -ne $oldHash) { throw 'Installer differs from the pinned published release checksums or manifest.' }
  $evidence.oldInstallerSha256 = $oldHash
  $evidence.publishedChecksumSha256 = (Get-FileHash -LiteralPath $checksums -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.releaseManifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.exactPublishedBytes = 'passed'

  New-Item -ItemType Directory -Path $root | Out-Null
  Invoke-Installer $old 'Published 1.7.0'
  $evidence.installedExecutableSha256 = (Get-FileHash -LiteralPath (Join-Path $install 'Math3D.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.oldInstall = 'passed'
  Invoke-Phase 'seed' $seedFile $profile
  $seed = Get-Content -LiteralPath $seedFile -Raw | ConvertFrom-Json
  $evidence.checkpointSha256 = $seed.checkpointSha256
  $evidence.seedEvidenceSha256 = (Get-FileHash -LiteralPath $seedFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.seed = 'passed'

  $inventoryScript = Join-Path $repo 'scripts/release20-profile-inventory.mjs'
  $original = & node $inventoryScript $profile | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Could not inventory original 1.7 profile.' }
  Copy-Item -LiteralPath $profile -Destination $backup -Recurse
  $backupInventory = & node $inventoryScript $backup | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $backupInventory.digest -ne $original.digest) { throw '1.7 backup differs from original profile.' }
  $inventoryPath = Join-Path $root 'profile-inventory.json'
  $original | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $inventoryPath -Encoding UTF8
  $evidence.profileInventorySha256 = $original.digest
  $evidence.profileFileCount = $original.fileCount
  $evidence.checks.profileBackup = 'passed'

  Copy-Item -LiteralPath $backup -Destination $rollbackProfile -Recurse
  $rollbackInventory = & node $inventoryScript $rollbackProfile | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $rollbackInventory.digest -ne $original.digest) { throw 'Rollback profile differs from original 1.7 bytes.' }
  $evidence.checks.rollbackProfile = 'passed'
  Invoke-Installer $old '1.7 rollback rehearsal'
  $reinstalledHash = (Get-FileHash -LiteralPath (Join-Path $install 'Math3D.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($reinstalledHash -ne $evidence.installedExecutableSha256) { throw 'Reinstalled 1.7 executable bytes changed.' }
  $evidence.checks.reinstall = 'passed'
  Invoke-Phase 'rollback' $rollbackFile $rollbackProfile
  $rollback = Get-Content -LiteralPath $rollbackFile -Raw | ConvertFrom-Json
  if ($rollback.checkpointSha256 -ne $seed.checkpointSha256 -or $rollback.checkpointBytes -cne $seed.checkpointBytes) {
    throw 'Rollback did not reopen the original Graph Project bytes.'
  }
  $evidence.rollbackEvidenceSha256 = (Get-FileHash -LiteralPath $rollbackFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.rollbackOpen = 'passed'
  $backupAfter = & node $inventoryScript $backup | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $backupAfter.digest -ne $original.digest) { throw 'Rollback rehearsal changed the pristine profile backup.' }
  $evidence.checks.backupUnchanged = 'passed'
  $evidence.status = 'passed'
} catch {
  $evidence.status = 'failed'; $evidence.failure = $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "M3D20-13 baseline evidence: $EvidencePath"
}
