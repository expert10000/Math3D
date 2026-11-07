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
$manifest = Get-Content -LiteralPath $CandidateManifest -Raw | ConvertFrom-Json
$oldHash = (Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant()
if ([IO.Path]::GetFileName($old) -ne 'Math3D-Setup-1.7.0.exe' -or
    $oldHash -ne 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db') {
  throw 'Old installer is not the exact published Math3D v1.7.0 asset.'
}
if ($manifest.schema -notin @('math3d/two-app-candidate/v1', 'math3d/release20-candidate/v1') -or
    $manifest.math3d.version -ne '2.0.0' -or $manifest.math3d.channel -ne 'stable' -or
    $manifest.math3d.commit -notmatch '^[0-9a-f]{40}$' -or
    $manifest.math3d.installerSha256 -notmatch '^[0-9a-f]{64}$' -or
    [IO.Path]::GetFileName($candidateFile) -ne $manifest.math3d.installerName) {
  throw 'Candidate manifest must identify the exact stable Math3D v2.0.0 installer.'
}
$candidateHash = (Get-FileHash -LiteralPath $candidateFile -Algorithm SHA256).Hash.ToLowerInvariant()
if ($candidateHash -ne $manifest.math3d.installerSha256) { throw 'Candidate installer bytes differ from manifest.' }
$signature = Get-AuthenticodeSignature -LiteralPath $candidateFile
if ($signature.Status -ne 'Valid') { throw "Candidate installer signature is not valid: $($signature.Status)" }

$install = Join-Path $root 'Math3D'
$profile = Join-Path $root 'profile'
$backup = Join-Path $root 'profile-before-2.0'
$seedFile = Join-Path $root 'seed.json'
$verifyFile = Join-Path $root 'verify.json'
$evidence = [ordered]@{
  schema = 'math3d/release20-upgrade/v1'; status = 'started'; checkedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  oldVersion = '1.7.0'; oldInstallerSha256 = $oldHash; candidateVersion = '2.0.0'
  candidateCommit = $manifest.math3d.commit; candidateInstallerSha256 = $candidateHash
  signerThumbprint = $signature.SignerCertificate.Thumbprint
  checks = [ordered]@{ exactBytes = 'passed'; signature = 'passed'; oldInstall = 'pending'; seed = 'pending'
    profileBackup = 'pending'; inPlaceUpgrade = 'pending'; retainedBytesAndSetting = 'pending' }
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
      $record.version -ne $(if ($phase -eq 'seed') { '1.7.0' } else { '2.0.0' }) -or
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
  Copy-Item -LiteralPath $profile -Destination $backup -Recurse
  if (-not (Test-Path -LiteralPath (Join-Path $backup 'user-data') -PathType Container)) { throw 'Original profile backup is incomplete.' }
  $evidence.profileBackup = $backup
  $evidence.checks.profileBackup = 'passed'
  Invoke-Installer $candidateFile 'Candidate 2.0.0'
  $evidence.checks.inPlaceUpgrade = 'passed'
  Invoke-Phase 'verify' $verifyFile
  $verification = Get-Content -LiteralPath $verifyFile -Raw | ConvertFrom-Json
  if ($verification.checkpointSha256 -ne $evidence.checkpointSha256) { throw 'Graph Project bytes changed across upgrade.' }
  $evidence.verifySha256 = (Get-FileHash -LiteralPath $verifyFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $evidence.checks.retainedBytesAndSetting = 'passed'
  $evidence.status = 'passed'
} catch {
  $evidence.status = 'failed'; $evidence.failure = $_.Exception.Message
  throw
} finally {
  New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  Write-Host "M3D20-13c evidence: $EvidencePath"
}
