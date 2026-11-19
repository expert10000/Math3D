param(
  [Parameter(Mandatory = $true)][ValidateSet('Fresh', 'Upgrade')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$ArtifactRoot,
  [Parameter(Mandatory = $true)][string]$EvidenceRoot,
  [string]$OldInstaller = ''
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$sourceCommit = '300493c92c42a1f3b611bf09fef0d70f529a333e'
$installerHash = '3c749ca2a75f173536e4a94df0a4afe0bcb1d9c07c269c2b343f694e24654396'
$oldHash = 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db'
$thumbprint = '38F403CE0B42720EE5AFD61422D6A2C22EB733D9'
$sageServiceUrl = [Environment]::GetEnvironmentVariable('MATH3D_RELEASE20_SAGE_SERVICE_URL', 'Process')
$artifactRoot = (Resolve-Path -LiteralPath $ArtifactRoot).Path
$evidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)
$temp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if ($env:OS -ne 'Windows_NT' -or $evidenceRoot.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -eq $false) {
  throw 'Run in a clean Windows VM with a new EvidenceRoot below TEMP.'
}
if (Test-Path -LiteralPath $evidenceRoot) { throw 'EvidenceRoot must be new.' }
$uninstallRoots = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
)
$registered = @(foreach ($root in $uninstallRoots) {
  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue |
    ForEach-Object { Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue } |
    Where-Object { $_.DisplayName -eq 'Math3D' }
})
if ($registered.Count) { throw 'Math3D is registered in an HKCU or HKLM uninstall hive; use a clean VM or runner.' }
$installer = Join-Path $artifactRoot 'Math3D-Setup-2.0.0-selfsigned-prerelease.exe'
$manifestPath = Join-Path $artifactRoot 'prerelease-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne 'math3d/release20-selfsigned-prerelease/v1' -or
    $manifest.sourceCommit -ne $sourceCommit -or $manifest.installerSha256 -ne $installerHash -or
    $manifest.signerThumbprint -ne $thumbprint -or $manifest.publiclyTrustedPublisher -ne $false -or
    $manifest.trust -ne 'self-signed-untrusted-by-default' -or
    (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $installerHash -or
    (Get-FileHash -LiteralPath (Join-Path $artifactRoot 'freeze-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.freezeSha256) {
  throw 'Prerelease identity or file hashes differ from pinned signed bytes.'
}
$signature = & (Join-Path $repo 'scripts/verify-release20-selfsigned-prerelease.ps1') -Paths @($installer) -ExpectedThumbprint $thumbprint | ConvertFrom-Json
if ($signature.files.Count -ne 1 -or $signature.files[0].sha256 -ne $installerHash) { throw 'Self-signed Authenticode verification failed.' }
$nsis = & (Join-Path $repo 'scripts/verify-release20-nsis.ps1') -InstallerPath $installer | ConvertFrom-Json
if ($nsis.installerSha256 -ne $installerHash) { throw 'Embedded NSIS verification failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules/.bin/playwright.cmd'))) {
  throw 'Install exact test dependencies with npm ci in this checkout before the VM run.'
}
$harnessCommit = (& git -C $repo rev-parse HEAD).Trim()
& git -C $repo merge-base --is-ancestor $sourceCommit HEAD
if ($LASTEXITCODE -ne 0) { throw 'Harness checkout does not descend from the exact candidate source.' }
$receipt = [ordered]@{
  schema = 'math3d/release20-selfsigned-installed/v1'; status = 'started'; mode = $Mode
  sourceCommit = $sourceCommit; harnessCommit = $harnessCommit; installerSha256 = $installerHash
  signerThumbprint = $thumbprint; trust = 'self-signed-untrusted-by-default'; publiclyTrustedPublisher = $false
  signedPrereleaseOnly = $true; gaApproved = $false; installedJourneysQualified = $false
  liveSageJourneys = [ordered]@{ status = 'blocked'; reason = 'No stable reachable SageMath 10.10 service endpoint was supplied for the four advertised live journeys.' }
  host = [ordered]@{ machine = $env:COMPUTERNAME; os = [Environment]::OSVersion.VersionString; powershell = $PSVersionTable.PSVersion.ToString() }
  checks = [ordered]@{}; failure = $null
}
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$receiptPath = Join-Path $evidenceRoot "$($Mode.ToLowerInvariant())-receipt.json"
function Save-Receipt { $receipt | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $receiptPath -Encoding utf8 }
function Restore-Env([string]$name, $value) {
  if ($null -eq $value) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
  else { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
}
function Check-Installed([string]$root) {
  $app = Join-Path $root 'Math3D.exe'
  $worker = Join-Path $root 'resources/python-worker/worker.exe'
  $web = Join-Path $root 'resources/web-app/index.html'
  foreach ($file in @($app, $worker, $web)) { if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Installed resource missing: $file" } }
  if ((Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.appSha256 -or
      (Get-FileHash -LiteralPath $worker -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.workerSha256) {
    throw 'Installed application or worker differs from the prerelease manifest.'
  }
  $installedSignatures = & (Join-Path $repo 'scripts/verify-release20-selfsigned-prerelease.ps1') -Paths @($app, $worker) -ExpectedThumbprint $thumbprint | ConvertFrom-Json
  if ($installedSignatures.files.Count -ne 2) { throw 'Installed Authenticode verification failed.' }
  return @{ app = $app; worker = $worker; web = $web }
}
function Install([string]$file, [string]$destination) {
  $process = Start-Process -FilePath $file -ArgumentList @('/S', '/CURRENTUSER', "/D=$destination") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id -Force; throw 'Installer timed out.' }
  if ($process.ExitCode -ne 0) { throw "Installer exit $($process.ExitCode)." }
}
function Playwright([string[]]$arguments) {
  Push-Location $repo
  try {
    & (Join-Path $repo 'node_modules/.bin/playwright.cmd') @arguments --reporter=list
    if ($LASTEXITCODE -ne 0) { throw "Installed Playwright check failed: $($arguments -join ' ')" }
  } finally { Pop-Location }
}
function Upgrade-Phase([string]$phase, [string]$exe, [string]$profile, [string]$seed, [string]$output) {
  $env:MATH3D_PACKAGED_APP_EXE = $exe
  $env:MATH3D_RELEASE20_UPGRADE_PHASE = $phase
  $env:MATH3D_RELEASE20_UPGRADE_PROFILE = $profile
  $env:MATH3D_RELEASE20_UPGRADE_SEED = $seed
  $env:MATH3D_RELEASE20_UPGRADE_RESULT = $output
  try { Playwright -arguments @('test', 'tests/e2e/release20-upgrade-project-settings.spec.ts') }
  finally {
    foreach ($name in @('MATH3D_PACKAGED_APP_EXE', 'MATH3D_RELEASE20_UPGRADE_PHASE', 'MATH3D_RELEASE20_UPGRADE_PROFILE',
        'MATH3D_RELEASE20_UPGRADE_SEED', 'MATH3D_RELEASE20_UPGRADE_RESULT')) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
  }
  if (-not (Test-Path -LiteralPath $output -PathType Leaf)) { throw "Upgrade phase $phase wrote no evidence." }
  $result = Get-Content -LiteralPath $output -Raw | ConvertFrom-Json
  if ($result.schema -ne 'math3d/release20-upgrade-phase/v1' -or $result.phase -ne $phase -or
      $result.version -ne $(if ($phase -eq 'verify') { '2.0.0' } else { '1.7.0' }) -or
      -not $result.settingOff -or $result.checkpointSha256 -notmatch '^[0-9a-f]{64}$') {
    throw "Upgrade phase $phase receipt is incomplete."
  }
  return $result
}
Save-Receipt
$originalPath = $null
$pythonEnvironment = @{}
try {
  $run = Join-Path $evidenceRoot 'run'
  New-Item -ItemType Directory -Path $run | Out-Null
  $install = Join-Path $run 'Math3D'
  if ($Mode -eq 'Fresh') {
    $receipt.checks.fourLiveSageJourneys = 'blocked'
    Install $installer $install
    $installed = Check-Installed $install
    $receipt.checks.cleanInstall = 'passed'; $receipt.checks.installedBytesAndSignatures = 'passed'; Save-Receipt
    $originalPath = $env:PATH
    $env:PATH = ($originalPath -split ';' | Where-Object { $_ -and $_ -notmatch '(?i)python|conda' }) -join ';'
    foreach ($name in @('PYTHONHOME', 'PYTHONPATH', 'MATH3D_PYTHON')) {
      $pythonEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    & node (Join-Path $repo 'scripts/smoke-python-worker.mjs') --exe $installed.worker
    if ($LASTEXITCODE -ne 0) { throw 'Frozen installed worker failed without Python on PATH.' }
    $receipt.checks.workerWithoutPython = 'passed'; Save-Receipt
    $env:MATH3D_PACKAGED_APP_EXE = $installed.app
    $env:MATH3D_RELEASE20_EXPECTED_VERSION = '2.0.0'
    try {
      Playwright -arguments @('test', 'tests/e2e/release20-first-use-study.spec.ts')
      $receipt.checks.firstUseAndProjectColdReopen = 'passed'; Save-Receipt
      Playwright -arguments @('test', 'tests/e2e/project-hard-exit-recovery.spec.ts')
      $receipt.checks.hardExitRecovery = 'passed'; Save-Receipt
      & node (Join-Path $repo 'scripts/extract-installed-build-identity.mjs') `
        (Join-Path $install 'resources/app.asar') (Join-Path $repo 'dist/build-identity.json') $sourceCommit
      if ($LASTEXITCODE -ne 0) { throw 'Installed asar build identity could not be verified.' }
      Playwright -arguments @('test', 'tests/e2e/release20-resilience.spec.ts', '--grep', 'Volume survives context loss|four-pane Study reopens')
      $receipt.checks.nonmemoryCancellationAndStudyReopen = 'passed'; Save-Receipt
    } finally {
      Remove-Item Env:MATH3D_PACKAGED_APP_EXE -ErrorAction SilentlyContinue
      Remove-Item Env:MATH3D_RELEASE20_EXPECTED_VERSION -ErrorAction SilentlyContinue
    }
    $driver = Join-Path $repo 'scripts/windows-qualification/installed-driver.mjs'
    $fixture = Join-Path $repo 'tests/windows-qualification/fixture/recovery.json'
    $args = @($driver, '--package', $installer, '--app', $installed.app, '--worker', $installed.worker,
      '--source-sha', $sourceCommit, '--harness-sha', $harnessCommit, '--fixture', $fixture,
      '--expected-version', '2.0.0')
    foreach ($phase in @('fresh-profile', 'journey')) {
      $profile = Join-Path $run "profile-$phase"
      $phaseReceipt = Join-Path $evidenceRoot "$phase.json"
      & node @args --phase $phase --profile $profile --receipt $phaseReceipt
      if ($LASTEXITCODE -ne 0 -or (Get-Content -LiteralPath $phaseReceipt -Raw | ConvertFrom-Json).status -ne 'passed') {
        throw "Installed $phase driver failed."
      }
      $receipt.checks[$phase] = 'passed'; Save-Receipt
    }
    if ($sageServiceUrl) {
      $previousSageUrl = [Environment]::GetEnvironmentVariable('MATH3D_RELEASE20_SAGE_SERVICE_URL', 'Process')
      $previousReport = [Environment]::GetEnvironmentVariable('MATH3D_RELEASE20_JOURNEY_REPORT', 'Process')
      $previousApp = [Environment]::GetEnvironmentVariable('MATH3D_PACKAGED_APP_EXE', 'Process')
      $previousVersion = [Environment]::GetEnvironmentVariable('MATH3D_RELEASE20_EXPECTED_VERSION', 'Process')
      $oracle = Join-Path $evidenceRoot 'sage-oracle.json'
      $report = Join-Path $evidenceRoot 'four-journeys-playwright.json'
      $journeys = Join-Path $evidenceRoot 'four-journeys.json'
      try {
        $env:MATH3D_RELEASE20_SAGE_SERVICE_URL = $sageServiceUrl
        $env:MATH3D_RELEASE20_JOURNEY_REPORT = $report
        $env:MATH3D_PACKAGED_APP_EXE = $installed.app
        $env:MATH3D_RELEASE20_EXPECTED_VERSION = '2.0.0'
        & node (Join-Path $repo 'scripts/release20-sage-oracle.mjs') $oracle
        if ($LASTEXITCODE -ne 0) { throw 'Live SageMath 10.10 oracle failed.' }
        Playwright -arguments @('test', '--config', 'playwright.release20-journeys.config.ts')
        & node (Join-Path $repo 'scripts/check-release20-journeys.mjs') $report $oracle $sourceCommit $installerHash $journeys
        if ($LASTEXITCODE -ne 0) { throw 'Exact installed four-journey receipt failed.' }
        $receipt.liveSageJourneys = [ordered]@{ status = 'passed'; receipt = $journeys; oracle = $oracle }
        $receipt.installedJourneysQualified = $true
        $receipt.checks.fourLiveSageJourneys = 'passed'; Save-Receipt
      } catch {
        $receipt.liveSageJourneys = [ordered]@{ status = 'failed'; reason = $_.Exception.Message }
        throw
      } finally {
        Restore-Env 'MATH3D_RELEASE20_SAGE_SERVICE_URL' $previousSageUrl
        Restore-Env 'MATH3D_RELEASE20_JOURNEY_REPORT' $previousReport
        Restore-Env 'MATH3D_PACKAGED_APP_EXE' $previousApp
        Restore-Env 'MATH3D_RELEASE20_EXPECTED_VERSION' $previousVersion
      }
    }
    Check-Installed $install | Out-Null
    $receipt.checks.finalInstalledBytesAndSignatures = 'passed'
  } else {
    if (-not $OldInstaller) { throw 'Upgrade mode requires the published 1.7 installer.' }
    $old = (Resolve-Path -LiteralPath $OldInstaller).Path
    if ([IO.Path]::GetFileName($old) -ne 'Math3D-Setup-1.7.0.exe' -or
        (Get-FileHash -LiteralPath $old -Algorithm SHA256).Hash.ToLowerInvariant() -ne $oldHash) {
      throw 'Published 1.7 installer differs from pinned release bytes.'
    }
    $oldFolder = Split-Path -Parent $old
    $oldManifestPath = Join-Path $oldFolder 'candidate-manifest.json'
    $checksumsPath = Join-Path $oldFolder 'SHA256SUMS.txt'
    $oldManifest = Get-Content -LiteralPath $oldManifestPath -Raw | ConvertFrom-Json
    $published = @(Get-Content -LiteralPath $checksumsPath | Where-Object {
      $_ -match '^[0-9a-fA-F]{64}\s+\*?Math3D-Setup-1\.7\.0\.exe\s*$'
    })
    if ($oldManifest.schema -ne 'math3d/two-app-candidate/v1' -or
        $oldManifest.math3d.version -ne '1.7.0' -or
        $oldManifest.math3d.installerName -ne 'Math3D-Setup-1.7.0.exe' -or
        $oldManifest.math3d.installerSha256 -ne $oldHash -or
        $published.Count -ne 1 -or ($published[0] -split '\s+')[0].ToLowerInvariant() -ne $oldHash) {
      throw 'Published 1.7 release manifest or SHA256SUMS.txt differs from pinned installer.'
    }
    $receipt.oldInstallerSha256 = $oldHash
    $receipt.oldManifestSha256 = (Get-FileHash -LiteralPath $oldManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $receipt.oldChecksumsSha256 = (Get-FileHash -LiteralPath $checksumsPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Install $old $install
    $profile = Join-Path $run 'profile'
    $seedPath = Join-Path $evidenceRoot 'seed.json'
    $seed = Upgrade-Phase 'seed' (Join-Path $install 'Math3D.exe') $profile $seedPath $seedPath
    $inventoryScript = Join-Path $repo 'scripts/release20-profile-inventory.mjs'
    $inventory = & node $inventoryScript $profile | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw '1.7 profile inventory failed.' }
    $backup = Join-Path $run 'profile-before-2.0'
    Copy-Item -LiteralPath $profile -Destination $backup -Recurse
    $backupInventory = & node $inventoryScript $backup | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $backupInventory.digest -ne $inventory.digest) { throw '1.7 profile backup differs.' }
    $receipt.checks.published17SeedAndBackup = 'passed'; Save-Receipt
    Install $installer $install
    $installed = Check-Installed $install
    $verify = Upgrade-Phase 'verify' $installed.app $profile $seedPath (Join-Path $evidenceRoot 'verify.json')
    if ($verify.checkpointSha256 -ne $seed.checkpointSha256 -or $verify.checkpointBytes -cne $seed.checkpointBytes) {
      throw 'Upgrade changed saved Graph Project bytes.'
    }
    $receipt.checks.sameDirectoryUpgradeAndProfile = 'passed'; Save-Receipt
    $rollbackProfile = Join-Path $run 'rollback-profile'
    Copy-Item -LiteralPath $backup -Destination $rollbackProfile -Recurse
    $rollbackInventory = & node $inventoryScript $rollbackProfile | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $rollbackInventory.digest -ne $inventory.digest) { throw 'Rollback profile differs from 1.7 backup.' }
    Install $old $install
    $rollback = Upgrade-Phase 'rollback' (Join-Path $install 'Math3D.exe') $rollbackProfile $seedPath (Join-Path $evidenceRoot 'rollback.json')
    if ($rollback.checkpointSha256 -ne $seed.checkpointSha256 -or $rollback.checkpointBytes -cne $seed.checkpointBytes) {
      throw 'Rollback did not reopen the exact original Graph Project.'
    }
    $backupAfter = & node $inventoryScript $backup | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $backupAfter.digest -ne $inventory.digest) { throw 'Pristine 1.7 profile backup changed.' }
    $receipt.checks.published17Rollback = 'passed'
  }
  $receipt.status = if ($Mode -eq 'Fresh' -and -not $sageServiceUrl) { 'partial' } else { 'passed' }
} catch {
  $receipt.status = 'failed'; $receipt.failure = $_.Exception.Message
  throw
} finally {
  if ($null -ne $originalPath) { $env:PATH = $originalPath }
  foreach ($name in $pythonEnvironment.Keys) {
    if ($null -ne $pythonEnvironment[$name]) { [Environment]::SetEnvironmentVariable($name, $pythonEnvironment[$name], 'Process') }
    else { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
  }
  $receipt.finishedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  Save-Receipt
  Write-Host "Self-signed installed receipt: $receiptPath"
}
