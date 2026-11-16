[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$CandidateManifest,
  [Parameter(Mandatory=$true)][string]$OldManifest,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$SourceCommit,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$OldSourceCommit,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$HarnessCommit,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$MergedPr61Commit,
  [Parameter(Mandatory=$true)][string]$RunRoot
)
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT' -or $env:GITHUB_ACTIONS -ne 'true') { throw 'Use a disposable Windows GitHub Actions runner, not an existing personal installation.' }
if ($SourceCommit -ne $MergedPr61Commit) { throw 'Target must be the verified PR61 merge commit.' }
$RunRoot=[IO.Path]::GetFullPath($RunRoot)
$tempRoot=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
if (-not $RunRoot.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $RunRoot)) { throw 'A fresh RunRoot under RUNNER_TEMP is required.' }
$CandidateManifest=(Resolve-Path -LiteralPath $CandidateManifest).Path
$OldManifest=(Resolve-Path -LiteralPath $OldManifest).Path
node "$PSScriptRoot/preflight.mjs" check $CandidateManifest $OldManifest $SourceCommit $OldSourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Package provenance preflight failed; no installer may run.' }
$candidate=Get-Content -Raw -LiteralPath $CandidateManifest | ConvertFrom-Json
$old=Get-Content -Raw -LiteralPath $OldManifest | ConvertFrom-Json
New-Item -ItemType Directory -Path $RunRoot | Out-Null
$receiptPath=Join-Path $RunRoot 'qualification.json'
$result=[ordered]@{schema='math3d/windows-installed-qualification/v1';platform='win32';repository='expert10000/Math3D';sourceCommit=$SourceCommit;oldSourceCommit=$OldSourceCommit;harnessCommit=$HarnessCommit;mergedPr61Commit=$MergedPr61Commit;runId=$env:GITHUB_RUN_ID;runAttempt=$env:GITHUB_RUN_ATTEMPT;status='incomplete';executedAll=$false;releaseApproved=$false;signingGate='separate; not approved';candidate=$candidate;old=$old;journeys=[ordered]@{'fresh-install'=@{status='missing'};upgrade=@{status='missing'};'runtime-recovery'=@{status='missing'}}}
function Save-Receipt { $result | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $receiptPath -Encoding utf8 }
function Get-Identity([string]$File) { @{path=$File;sha256=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $File).Length} }
function Install-Package($Manifest,[string]$ManifestFile,[string]$InstallRoot) {
  $installer=Join-Path (Split-Path -Parent $ManifestFile) $Manifest.installer.path
  $p=Start-Process -FilePath $installer -ArgumentList @('/S','/CURRENTUSER',"/D=$InstallRoot") -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "NSIS exited $($p.ExitCode)" }
  # The manifest executable/worker paths are both artifact paths and install-relative paths.
  $exe=Join-Path $InstallRoot $Manifest.executable.installPath
  $worker=Join-Path $InstallRoot $Manifest.worker.installPath
  foreach ($item in @(@($exe,$Manifest.executable),@($worker,$Manifest.worker))) {
    $actual=Get-Identity $item[0]
    if ($actual.sha256 -ne $item[1].sha256 -or $actual.bytes -ne $item[1].bytes) { throw "Installed bytes mismatch: $($item[0])" }
  }
  return @{app=$exe;worker=$worker;installedExe=(Get-Identity $exe);installedWorker=(Get-Identity $worker);installer=(Get-Identity $installer)}
}
function Probe([string]$Phase,$Manifest,[string]$ManifestFile,$Installed,[string]$Profile,[string]$Receipt,[string]$Source,[string]$Seed='') {
  $installer=Join-Path (Split-Path -Parent $ManifestFile) $Manifest.installer.path
  $fixture=Join-Path $PSScriptRoot '../../tests/windows-qualification/fixture/recovery.json'
  $arguments=@("$PSScriptRoot/installed-driver.mjs",'--phase',$Phase,'--package',$installer,'--app',$Installed.app,'--worker',$Installed.worker,'--profile',$Profile,'--receipt',$Receipt,'--source-sha',$Source,'--harness-sha',$HarnessCommit,'--fixture',$fixture,'--expected-version',$Manifest.version)
  if ($Seed) { $arguments+=@('--seed',$Seed) }
  node @arguments
  if ($LASTEXITCODE -ne 0) { throw "Installed phase $Phase failed; preserve $Receipt" }
  $phaseResult=Get-Content -Raw -LiteralPath $Receipt | ConvertFrom-Json
  if ($phaseResult.status -ne 'passed' -or $phaseResult.sourceCommit -ne $Source) { throw 'Missing/failed/mismatched phase receipt.' }
  return $phaseResult
}
Save-Receipt
try {
  # Real same-product upgrade: old installed app authors Graph+setting in its own isolated profile.
  $upgradeProfile=Join-Path $RunRoot 'upgrade-profile';$upgradeInstall=Join-Path $RunRoot 'upgrade-install'
  $oldInstalled=Install-Package $old $OldManifest $upgradeInstall
  $seedFile=Join-Path $RunRoot 'upgrade-seed.json'
  $seed=Probe 'seed' $old $OldManifest $oldInstalled $upgradeProfile $seedFile $OldSourceCommit
  Copy-Item -LiteralPath $upgradeProfile -Destination (Join-Path $RunRoot 'upgrade-profile-backup') -Recurse
  Get-ChildItem -LiteralPath (Join-Path $RunRoot 'upgrade-profile-backup') -Recurse -File | ForEach-Object {Get-Identity $_.FullName} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $RunRoot 'profile-backup-inventory.json') -Encoding utf8
  $upgraded=Install-Package $candidate $CandidateManifest $upgradeInstall
  $upgrade=Probe 'upgrade' $candidate $CandidateManifest $upgraded $upgradeProfile (Join-Path $RunRoot 'upgrade.json') $SourceCommit $seedFile
  $result.journeys.upgrade=@{status='passed';profileRetentionStatus='passed';old=$oldInstalled;candidate=$upgraded;phase=$upgrade};Save-Receipt
  # New profile is created by the installed app, not by synthesizing LevelDB/localStorage.
  $fresh=Install-Package $candidate $CandidateManifest (Join-Path $RunRoot 'fresh-install')
  $profile=Join-Path $RunRoot 'fresh-profile'
  $seeded=Probe 'fresh-profile' $candidate $CandidateManifest $fresh $profile (Join-Path $RunRoot 'fresh-profile.json') $SourceCommit
  $result.journeys['fresh-install']=@{status='passed';seedFixtureStatus='passed';installed=$fresh;phase=$seeded};Save-Receipt
  $runtime=Probe 'journey' $candidate $CandidateManifest $fresh $profile (Join-Path $RunRoot 'runtime-recovery.json') $SourceCommit
  if ((Get-Identity $fresh.app).sha256 -ne $candidate.executable.sha256 -or (Get-Identity $fresh.worker).sha256 -ne $candidate.worker.sha256) { throw 'Installed bytes changed across cold reopen/recovery.' }
  $result.journeys['runtime-recovery']=@{status='passed';checks=$runtime.checks;phase=$runtime};$result.executedAll=$true;$result.status='passed';Save-Receipt
  node "$PSScriptRoot/preflight.mjs" complete $receiptPath
  if ($LASTEXITCODE -ne 0) { throw 'Qualification remains incomplete.' }
  $result.status='passed'
} catch { $result.status='failed';$result.failure=$_.Exception.Message;throw }
finally { $result.finishedAt=(Get-Date).ToUniversalTime().ToString('o');Save-Receipt }
