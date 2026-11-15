# TOP05 E8: fail-closed installed Windows qualification (run ONLY on disposable GitHub Windows runner).
# Requires real previous and current NSIS installers and externally verified SHA256 values.
# Never performs an install on a developer's normal machine; never signs off release.
param(
  [Parameter(Mandatory=$true)][string]$PriorInstallerPath,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$PriorInstallerSha256,
  [Parameter(Mandatory=$true)][string]$CurrentInstallerPath,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$CurrentInstallerSha256,
  [Parameter(Mandatory=$true)][string]$ExistingProfileFixture,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{40}
  [switch]$AllowUnsignedDiagnostic
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
  throw 'Refusing NSIS installation outside a disposable GitHub Actions Windows runner. Do not run on your primary Windows profile.'
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
if ([string]::IsNullOrWhiteSpace($EvidenceDir)) { $EvidenceDir = Join-Path $env:RUNNER_TEMP 'top05-installed-evidence' }
New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
$recordFile = Join-Path $EvidenceDir 'qualification.json'
$record = [ordered]@{
  schema = 'math3d.top05.installed-qualification.v1'
  qualificationHarnessCommit = (& git rev-parse HEAD).Trim()
  priorInstallerSourceCommit = $PriorSourceCommit.ToLowerInvariant()
  currentInstallerSourceCommit = $CurrentSourceCommit.ToLowerInvariant()
  startedUtc = [DateTime]::UtcNow.ToString('o')
  mode = 'ephemeral-windows-nsis-install-and-upgrade'
  status = 'INCOMPLETE'
  priorInstaller = $null
  currentInstaller = $null
  priorInstalledExe = $null
  currentInstalledExe = $null
  tests = [ordered]@{ workerCli='MISSING'; installedColdReopen='MISSING'; runtimeLossRecovery='MISSING'; preservedProfileFiles='MISSING'; oldAppProjectUi='MISSING'; portableProject='MISSING'; installedUpgrade='MISSING' }
  releaseApproval = 'WITHHELD'
}
function Write-Evidence { $record | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $recordFile -Encoding UTF8 }
function Test-Hash([string]$file,[string]$expected) {
  $path = (Resolve-Path -LiteralPath $file).Path
  $sha = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sha -ne $expected.ToLowerInvariant()) { throw "Unverified installer SHA-256: $path" }
  return @{ path=$path; sha256=$sha; bytes=(Get-Item -LiteralPath $path).Length }
}
function Get-BinaryIdentity([string]$file) {
  $path = (Resolve-Path -LiteralPath $file).Path
  $sig = Get-AuthenticodeSignature -LiteralPath $path
  if (-not $AllowUnsignedDiagnostic -and $sig.Status -ne 'Valid') {
    throw "Release-scope binary requires a valid Authenticode signature: $path ($($sig.Status))"
  }
  return @{ path=$path; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant(); version=(Get-Item $path).VersionInfo.ProductVersion; signatureStatus=[string]$sig.Status; signer=$sig.SignerCertificate.Subject }
}
function Invoke-InstalledNsis([string]$installer,[string]$root) {
  # '/D=' must be final NSIS argument. Never remove a pre-existing installation.
  $args = @('/S', '/CURRENTUSER', "/D=$root")
  $p = Start-Process -FilePath $installer -ArgumentList $args -PassThru -Wait
  if ($p.ExitCode -ne 0) { throw "NSIS installer failed: $installer (exit $($p.ExitCode))" }
  $exe = Join-Path $root 'Math3D.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw "Installed Math3D.exe missing at $exe" }
  return $exe
}
function Get-ProfileHashes([string]$root) {
  $base = (Resolve-Path -LiteralPath $root).Path
  $items = @(Get-ChildItem -LiteralPath $base -File -Recurse | Sort-Object FullName)
  if ($items.Count -eq 0) { throw 'Existing profile fixture has no files, cannot qualify upgrade retention' }
  return @($items | ForEach-Object { [ordered]@{ relative=$_.FullName.Substring($base.Length).TrimStart([char]'\'); sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } })
}
function Invoke-Test([string]$name,[string[]]$specs,[string]$grep='') {
  $args = @('playwright','test') + $specs + @('--workers=1','--retries=0','--reporter=list,json')
  if ($grep) { $args += @('--grep', $grep) }
  & npx @args
  if ($LASTEXITCODE -ne 0) { $record.tests[$name]='FAIL'; Write-Evidence; throw "Installed app test failed: $name (exit $LASTEXITCODE)" }
  $record.tests[$name]='PASS'
  Write-Evidence
}
try {
  $record.priorInstaller = Test-Hash $PriorInstallerPath $PriorInstallerSha256
  $record.currentInstaller = Test-Hash $CurrentInstallerPath $CurrentInstallerSha256
  if ($record.priorInstaller.sha256 -eq $record.currentInstaller.sha256) { throw 'Upgrade requires two distinct installer payloads' }
  $oldSignature = Get-BinaryIdentity $record.priorInstaller.path
  $newSignature = Get-BinaryIdentity $record.currentInstaller.path
  $record.priorInstaller.signature = $oldSignature.signatureStatus
  $record.currentInstaller.signature = $newSignature.signatureStatus

  $installRoot = Join-Path $env:RUNNER_TEMP 'Math3D-top05-isolated-install'
  if (Test-Path $installRoot) { throw "Refusing to overwrite existing installation directory $installRoot" }
  $profileRoot = Join-Path $env:RUNNER_TEMP 'Math3D-top05-preserved-profile'
  if (Test-Path $profileRoot) { throw "Refusing to overwrite existing profile $profileRoot" }
  $fixtureRoot = (Resolve-Path -LiteralPath $ExistingProfileFixture).Path
  Copy-Item -LiteralPath $fixtureRoot -Destination $profileRoot -Recurse
  $before = @(Get-ProfileHashes $profileRoot)
  $record.profileFixtureSource = $fixtureRoot
  $record.profileFiles = $before.Count
  $record.installRoot = $installRoot
  Write-Evidence

  $priorExe = Invoke-InstalledNsis $record.priorInstaller.path $installRoot
  $record.priorInstalledExe = Get-BinaryIdentity $priorExe
  $record.tests.installedUpgrade = 'PRIOR_INSTALLED'
  Write-Evidence

  # Upgrade in place. User profile stays outside the install directory.
  $currentExe = Invoke-InstalledNsis $record.currentInstaller.path $installRoot
  $record.currentInstalledExe = Get-BinaryIdentity $currentExe
  if (-not $record.priorInstalledExe.version -or -not $record.currentInstalledExe.version -or
      $record.priorInstalledExe.version -eq $record.currentInstalledExe.version) {
    throw 'Upgrade requires independently identifiable, different installed ProductVersion values'
  }
  if ($record.priorInstalledExe.sha256 -eq $record.currentInstalledExe.sha256) {
    throw 'Upgrade did not replace installed executable bytes'
  }
  $record.tests.installedUpgrade='PASS'
  $after = @(Get-ProfileHashes $profileRoot)
  if (($before | ConvertTo-Json -Depth 6 -Compress) -ne ($after | ConvertTo-Json -Depth 6 -Compress)) {
    throw 'Profile files changed unexpectedly during installer upgrade'
  }
  $record.tests.preservedProfileFiles='PASS'
  Write-Evidence

  $worker = Join-Path $installRoot 'resources\python-worker\worker.exe'
  if (-not (Test-Path $worker)) { throw 'Installed frozen worker is unavailable' }
  $record.installedWorker = Get-BinaryIdentity $worker
  foreach ($flag in @('--ping','--version','--health')) {
    $payload = & $worker $flag | Select-Object -Last 1 | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $payload.ok) { throw "Installed worker $flag failed" }
    if ($flag -eq '--version' -and $payload.protocol -ne '2026-03-15') { throw 'Installed worker protocol mismatch' }
  }
  $record.tests.workerCli='PASS'
  Write-Evidence

  $env:MATH3D_PACKAGED_APP_EXE = $currentExe
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $EvidenceDir 'playwright-native.json'
  Invoke-Test 'installedColdReopen' @('tests/e2e/topology-functional-acceptance.spec.ts') 'TOP-05 native cold reopen'
  Invoke-Test 'runtimeLossRecovery' @('tests/e2e/topology-installed-runtime-recovery.spec.ts')
  $record.status = 'SCOPED_INSTALLED_PASS_WITH_RELEASE_GAPS'
  if ($AllowUnsignedDiagnostic) { $record.status = 'UNSIGNED_DIAGNOSTIC_ONLY' }
  # Prior app Project UI replay, portable export/import and signing approval require
  # separately observed evidence. Never silently promote them from file-level retention.
  Write-Evidence
} catch {
  $record.status='FAIL_OR_INCOMPLETE'
  $record.error=[string]$_
  Write-Evidence
  throw
} finally {
  Remove-Item Env:MATH3D_PACKAGED_APP_EXE -ErrorAction SilentlyContinue
  Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue
}
Write-Host "TOP-05 evidence: $recordFile"
Write-Host 'Release approval is WITHHELD pending complete Integration Lab gates.'
)][string]$PriorSourceCommit,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{40}
  [switch]$AllowUnsignedDiagnostic
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
  throw 'Refusing NSIS installation outside a disposable GitHub Actions Windows runner. Do not run on your primary Windows profile.'
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
if ([string]::IsNullOrWhiteSpace($EvidenceDir)) { $EvidenceDir = Join-Path $env:RUNNER_TEMP 'top05-installed-evidence' }
New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
$recordFile = Join-Path $EvidenceDir 'qualification.json'
$record = [ordered]@{
  schema = 'math3d.top05.installed-qualification.v1'
  sourceCommit = (& git rev-parse HEAD).Trim()
  startedUtc = [DateTime]::UtcNow.ToString('o')
  mode = 'ephemeral-windows-nsis-install-and-upgrade'
  status = 'INCOMPLETE'
  priorInstaller = $null
  currentInstaller = $null
  priorInstalledExe = $null
  currentInstalledExe = $null
  tests = [ordered]@{ workerCli='MISSING'; installedColdReopen='MISSING'; runtimeLossRecovery='MISSING'; preservedProfileFiles='MISSING'; oldAppProjectUi='MISSING'; portableProject='MISSING'; installedUpgrade='MISSING' }
  releaseApproval = 'WITHHELD'
}
function Write-Evidence { $record | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $recordFile -Encoding UTF8 }
function Test-Hash([string]$file,[string]$expected) {
  $path = (Resolve-Path -LiteralPath $file).Path
  $sha = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sha -ne $expected.ToLowerInvariant()) { throw "Unverified installer SHA-256: $path" }
  return @{ path=$path; sha256=$sha; bytes=(Get-Item -LiteralPath $path).Length }
}
function Get-BinaryIdentity([string]$file) {
  $path = (Resolve-Path -LiteralPath $file).Path
  $sig = Get-AuthenticodeSignature -LiteralPath $path
  if (-not $AllowUnsignedDiagnostic -and $sig.Status -ne 'Valid') {
    throw "Release-scope binary requires a valid Authenticode signature: $path ($($sig.Status))"
  }
  return @{ path=$path; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant(); version=(Get-Item $path).VersionInfo.ProductVersion; signatureStatus=[string]$sig.Status; signer=$sig.SignerCertificate.Subject }
}
function Invoke-InstalledNsis([string]$installer,[string]$root) {
  # '/D=' must be final NSIS argument. Never remove a pre-existing installation.
  $args = @('/S', '/CURRENTUSER', "/D=$root")
  $p = Start-Process -FilePath $installer -ArgumentList $args -PassThru -Wait
  if ($p.ExitCode -ne 0) { throw "NSIS installer failed: $installer (exit $($p.ExitCode))" }
  $exe = Join-Path $root 'Math3D.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw "Installed Math3D.exe missing at $exe" }
  return $exe
}
function Get-ProfileHashes([string]$root) {
  $base = (Resolve-Path -LiteralPath $root).Path
  $items = @(Get-ChildItem -LiteralPath $base -File -Recurse | Sort-Object FullName)
  if ($items.Count -eq 0) { throw 'Existing profile fixture has no files, cannot qualify upgrade retention' }
  return @($items | ForEach-Object { [ordered]@{ relative=$_.FullName.Substring($base.Length).TrimStart([char]'\'); sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } })
}
function Invoke-Test([string]$name,[string[]]$specs,[string]$grep='') {
  $args = @('playwright','test') + $specs + @('--workers=1','--retries=0','--reporter=list,json')
  if ($grep) { $args += @('--grep', $grep) }
  & npx @args
  if ($LASTEXITCODE -ne 0) { $record.tests[$name]='FAIL'; Write-Evidence; throw "Installed app test failed: $name (exit $LASTEXITCODE)" }
  $record.tests[$name]='PASS'
  Write-Evidence
}
try {
  $record.priorInstaller = Test-Hash $PriorInstallerPath $PriorInstallerSha256
  $record.currentInstaller = Test-Hash $CurrentInstallerPath $CurrentInstallerSha256
  if ($record.priorInstaller.sha256 -eq $record.currentInstaller.sha256) { throw 'Upgrade requires two distinct installer payloads' }
  $oldSignature = Get-BinaryIdentity $record.priorInstaller.path
  $newSignature = Get-BinaryIdentity $record.currentInstaller.path
  $record.priorInstaller.signature = $oldSignature.signatureStatus
  $record.currentInstaller.signature = $newSignature.signatureStatus

  $installRoot = Join-Path $env:RUNNER_TEMP 'Math3D-top05-isolated-install'
  if (Test-Path $installRoot) { throw "Refusing to overwrite existing installation directory $installRoot" }
  $profileRoot = Join-Path $env:RUNNER_TEMP 'Math3D-top05-preserved-profile'
  if (Test-Path $profileRoot) { throw "Refusing to overwrite existing profile $profileRoot" }
  $fixtureRoot = (Resolve-Path -LiteralPath $ExistingProfileFixture).Path
  Copy-Item -LiteralPath $fixtureRoot -Destination $profileRoot -Recurse
  $before = @(Get-ProfileHashes $profileRoot)
  $record.profileFixtureSource = $fixtureRoot
  $record.profileFiles = $before.Count
  $record.installRoot = $installRoot
  Write-Evidence

  $priorExe = Invoke-InstalledNsis $record.priorInstaller.path $installRoot
  $record.priorInstalledExe = Get-BinaryIdentity $priorExe
  $record.tests.installedUpgrade = 'PRIOR_INSTALLED'
  Write-Evidence

  # Upgrade in place. User profile stays outside the install directory.
  $currentExe = Invoke-InstalledNsis $record.currentInstaller.path $installRoot
  $record.currentInstalledExe = Get-BinaryIdentity $currentExe
  if (-not $record.priorInstalledExe.version -or -not $record.currentInstalledExe.version -or
      $record.priorInstalledExe.version -eq $record.currentInstalledExe.version) {
    throw 'Upgrade requires independently identifiable, different installed ProductVersion values'
  }
  if ($record.priorInstalledExe.sha256 -eq $record.currentInstalledExe.sha256) {
    throw 'Upgrade did not replace installed executable bytes'
  }
  $record.tests.installedUpgrade='PASS'
  $after = @(Get-ProfileHashes $profileRoot)
  if (($before | ConvertTo-Json -Depth 6 -Compress) -ne ($after | ConvertTo-Json -Depth 6 -Compress)) {
    throw 'Profile files changed unexpectedly during installer upgrade'
  }
  $record.tests.preservedProfileFiles='PASS'
  Write-Evidence

  $worker = Join-Path $installRoot 'resources\python-worker\worker.exe'
  if (-not (Test-Path $worker)) { throw 'Installed frozen worker is unavailable' }
  $record.installedWorker = Get-BinaryIdentity $worker
  foreach ($flag in @('--ping','--version','--health')) {
    $payload = & $worker $flag | Select-Object -Last 1 | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $payload.ok) { throw "Installed worker $flag failed" }
    if ($flag -eq '--version' -and $payload.protocol -ne '2026-03-15') { throw 'Installed worker protocol mismatch' }
  }
  $record.tests.workerCli='PASS'
  Write-Evidence

  $env:MATH3D_PACKAGED_APP_EXE = $currentExe
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $EvidenceDir 'playwright-native.json'
  Invoke-Test 'installedColdReopen' @('tests/e2e/topology-functional-acceptance.spec.ts') 'TOP-05 native cold reopen'
  Invoke-Test 'runtimeLossRecovery' @('tests/e2e/topology-installed-runtime-recovery.spec.ts')
  $record.status = 'SCOPED_INSTALLED_PASS_WITH_RELEASE_GAPS'
  if ($AllowUnsignedDiagnostic) { $record.status = 'UNSIGNED_DIAGNOSTIC_ONLY' }
  # Prior app Project UI replay, portable export/import and signing approval require
  # separately observed evidence. Never silently promote them from file-level retention.
  Write-Evidence
} catch {
  $record.status='FAIL_OR_INCOMPLETE'
  $record.error=[string]$_
  Write-Evidence
  throw
} finally {
  Remove-Item Env:MATH3D_PACKAGED_APP_EXE -ErrorAction SilentlyContinue
  Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue
}
Write-Host "TOP-05 evidence: $recordFile"
Write-Host 'Release approval is WITHHELD pending complete Integration Lab gates.'
)][string]$CurrentSourceCommit,
  [string]$EvidenceDir = "",
  [switch]$AllowUnsignedDiagnostic
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:RUNNER_TEMP) {
  throw 'Refusing NSIS installation outside a disposable GitHub Actions Windows runner. Do not run on your primary Windows profile.'
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
if ([string]::IsNullOrWhiteSpace($EvidenceDir)) { $EvidenceDir = Join-Path $env:RUNNER_TEMP 'top05-installed-evidence' }
New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null
$recordFile = Join-Path $EvidenceDir 'qualification.json'
$record = [ordered]@{
  schema = 'math3d.top05.installed-qualification.v1'
  sourceCommit = (& git rev-parse HEAD).Trim()
  startedUtc = [DateTime]::UtcNow.ToString('o')
  mode = 'ephemeral-windows-nsis-install-and-upgrade'
  status = 'INCOMPLETE'
  priorInstaller = $null
  currentInstaller = $null
  priorInstalledExe = $null
  currentInstalledExe = $null
  tests = [ordered]@{ workerCli='MISSING'; installedColdReopen='MISSING'; runtimeLossRecovery='MISSING'; preservedProfileFiles='MISSING'; oldAppProjectUi='MISSING'; portableProject='MISSING'; installedUpgrade='MISSING' }
  releaseApproval = 'WITHHELD'
}
function Write-Evidence { $record | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $recordFile -Encoding UTF8 }
function Test-Hash([string]$file,[string]$expected) {
  $path = (Resolve-Path -LiteralPath $file).Path
  $sha = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($sha -ne $expected.ToLowerInvariant()) { throw "Unverified installer SHA-256: $path" }
  return @{ path=$path; sha256=$sha; bytes=(Get-Item -LiteralPath $path).Length }
}
function Get-BinaryIdentity([string]$file) {
  $path = (Resolve-Path -LiteralPath $file).Path
  $sig = Get-AuthenticodeSignature -LiteralPath $path
  if (-not $AllowUnsignedDiagnostic -and $sig.Status -ne 'Valid') {
    throw "Release-scope binary requires a valid Authenticode signature: $path ($($sig.Status))"
  }
  return @{ path=$path; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant(); version=(Get-Item $path).VersionInfo.ProductVersion; signatureStatus=[string]$sig.Status; signer=$sig.SignerCertificate.Subject }
}
function Invoke-InstalledNsis([string]$installer,[string]$root) {
  # '/D=' must be final NSIS argument. Never remove a pre-existing installation.
  $args = @('/S', '/CURRENTUSER', "/D=$root")
  $p = Start-Process -FilePath $installer -ArgumentList $args -PassThru -Wait
  if ($p.ExitCode -ne 0) { throw "NSIS installer failed: $installer (exit $($p.ExitCode))" }
  $exe = Join-Path $root 'Math3D.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw "Installed Math3D.exe missing at $exe" }
  return $exe
}
function Get-ProfileHashes([string]$root) {
  $base = (Resolve-Path -LiteralPath $root).Path
  $items = @(Get-ChildItem -LiteralPath $base -File -Recurse | Sort-Object FullName)
  if ($items.Count -eq 0) { throw 'Existing profile fixture has no files, cannot qualify upgrade retention' }
  return @($items | ForEach-Object { [ordered]@{ relative=$_.FullName.Substring($base.Length).TrimStart([char]'\'); sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() } })
}
function Invoke-Test([string]$name,[string[]]$specs,[string]$grep='') {
  $args = @('playwright','test') + $specs + @('--workers=1','--retries=0','--reporter=list,json')
  if ($grep) { $args += @('--grep', $grep) }
  & npx @args
  if ($LASTEXITCODE -ne 0) { $record.tests[$name]='FAIL'; Write-Evidence; throw "Installed app test failed: $name (exit $LASTEXITCODE)" }
  $record.tests[$name]='PASS'
  Write-Evidence
}
try {
  $record.priorInstaller = Test-Hash $PriorInstallerPath $PriorInstallerSha256
  $record.currentInstaller = Test-Hash $CurrentInstallerPath $CurrentInstallerSha256
  if ($record.priorInstaller.sha256 -eq $record.currentInstaller.sha256) { throw 'Upgrade requires two distinct installer payloads' }
  $oldSignature = Get-BinaryIdentity $record.priorInstaller.path
  $newSignature = Get-BinaryIdentity $record.currentInstaller.path
  $record.priorInstaller.signature = $oldSignature.signatureStatus
  $record.currentInstaller.signature = $newSignature.signatureStatus

  $installRoot = Join-Path $env:RUNNER_TEMP 'Math3D-top05-isolated-install'
  if (Test-Path $installRoot) { throw "Refusing to overwrite existing installation directory $installRoot" }
  $profileRoot = Join-Path $env:RUNNER_TEMP 'Math3D-top05-preserved-profile'
  if (Test-Path $profileRoot) { throw "Refusing to overwrite existing profile $profileRoot" }
  $fixtureRoot = (Resolve-Path -LiteralPath $ExistingProfileFixture).Path
  Copy-Item -LiteralPath $fixtureRoot -Destination $profileRoot -Recurse
  $before = @(Get-ProfileHashes $profileRoot)
  $record.profileFixtureSource = $fixtureRoot
  $record.profileFiles = $before.Count
  $record.installRoot = $installRoot
  Write-Evidence

  $priorExe = Invoke-InstalledNsis $record.priorInstaller.path $installRoot
  $record.priorInstalledExe = Get-BinaryIdentity $priorExe
  $record.tests.installedUpgrade = 'PRIOR_INSTALLED'
  Write-Evidence

  # Upgrade in place. User profile stays outside the install directory.
  $currentExe = Invoke-InstalledNsis $record.currentInstaller.path $installRoot
  $record.currentInstalledExe = Get-BinaryIdentity $currentExe
  if (-not $record.priorInstalledExe.version -or -not $record.currentInstalledExe.version -or
      $record.priorInstalledExe.version -eq $record.currentInstalledExe.version) {
    throw 'Upgrade requires independently identifiable, different installed ProductVersion values'
  }
  if ($record.priorInstalledExe.sha256 -eq $record.currentInstalledExe.sha256) {
    throw 'Upgrade did not replace installed executable bytes'
  }
  $record.tests.installedUpgrade='PASS'
  $after = @(Get-ProfileHashes $profileRoot)
  if (($before | ConvertTo-Json -Depth 6 -Compress) -ne ($after | ConvertTo-Json -Depth 6 -Compress)) {
    throw 'Profile files changed unexpectedly during installer upgrade'
  }
  $record.tests.preservedProfileFiles='PASS'
  Write-Evidence

  $worker = Join-Path $installRoot 'resources\python-worker\worker.exe'
  if (-not (Test-Path $worker)) { throw 'Installed frozen worker is unavailable' }
  $record.installedWorker = Get-BinaryIdentity $worker
  foreach ($flag in @('--ping','--version','--health')) {
    $payload = & $worker $flag | Select-Object -Last 1 | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $payload.ok) { throw "Installed worker $flag failed" }
    if ($flag -eq '--version' -and $payload.protocol -ne '2026-03-15') { throw 'Installed worker protocol mismatch' }
  }
  $record.tests.workerCli='PASS'
  Write-Evidence

  $env:MATH3D_PACKAGED_APP_EXE = $currentExe
  $env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $EvidenceDir 'playwright-native.json'
  Invoke-Test 'installedColdReopen' @('tests/e2e/topology-functional-acceptance.spec.ts') 'TOP-05 native cold reopen'
  Invoke-Test 'runtimeLossRecovery' @('tests/e2e/topology-installed-runtime-recovery.spec.ts')
  $record.status = 'SCOPED_INSTALLED_PASS_WITH_RELEASE_GAPS'
  if ($AllowUnsignedDiagnostic) { $record.status = 'UNSIGNED_DIAGNOSTIC_ONLY' }
  # Prior app Project UI replay, portable export/import and signing approval require
  # separately observed evidence. Never silently promote them from file-level retention.
  Write-Evidence
} catch {
  $record.status='FAIL_OR_INCOMPLETE'
  $record.error=[string]$_
  Write-Evidence
  throw
} finally {
  Remove-Item Env:MATH3D_PACKAGED_APP_EXE -ErrorAction SilentlyContinue
  Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue
}
Write-Host "TOP-05 evidence: $recordFile"
Write-Host 'Release approval is WITHHELD pending complete Integration Lab gates.'
