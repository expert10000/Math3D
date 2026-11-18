param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [Parameter(Mandatory = $true)][string]$TheoryLabRepo,
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$OutputRoot,
  [ValidateSet('stable', 'dev')][string]$Math3DChannel = 'stable'
)

$ErrorActionPreference = 'Stop'
$candidate = (Resolve-Path -LiteralPath $CandidateDirectory).Path
$labRepo = (Resolve-Path -LiteralPath $TheoryLabRepo).Path
$install = [IO.Path]::GetFullPath($InstallRoot)
$output = [IO.Path]::GetFullPath($OutputRoot)
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$temporaryPrefix = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (-not $install.StartsWith($temporaryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'InstallRoot must be a fresh child of RUNNER_TEMP'
}
if (Test-Path -LiteralPath $install) { throw "InstallRoot already exists: $install" }
if (Test-Path -LiteralPath $output) { throw "OutputRoot already exists: $output" }
New-Item -ItemType Directory -Path $output | Out-Null
$manifestPath = Join-Path $candidate 'candidate-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$record = [ordered]@{
  schema = 'math3d/qi40-installed-pair/v1'
  status = 'started'
  candidateManifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  candidateBuildRunId = $manifest.buildRunId
  math3d = $null
  theoryLab = $null
  checks = [ordered]@{ candidate = 'pending'; install = 'pending'; freshProducer = 'pending';
    directLaunch = 'pending'; twoViews = 'pending' }
  failure = $null
}
$mathInstaller = Join-Path $candidate $manifest.math3d.installerName
$labInstaller = Join-Path $candidate $manifest.theoryLab.installerName
$mathInstall = Join-Path $install 'Math3D'
$labInstall = Join-Path $install 'TheoryLab'
$mathExeName = if ($Math3DChannel -eq 'dev') { 'Math3D Dev.exe' } else { 'Math3D.exe' }
$mathExe = Join-Path $mathInstall $mathExeName
$labExe = Join-Path $labInstall 'Quantum Hamiltonian Lab.exe'
$extracted = Join-Path $temporaryBase ('qi40-extracted-' + [guid]::NewGuid().ToString('N'))
try {
  if ($manifest.schema -ne 'math3d/two-app-candidate/v1' -or
      $manifest.math3d.commit -notmatch '^[a-f0-9]{40}$' -or
      $manifest.theoryLab.commit -notmatch '^[a-f0-9]{40}$' -or
      $manifest.math3d.channel -ne $Math3DChannel -or
      $manifest.math3d.installerName -notmatch "^Math3D$(if ($Math3DChannel -eq 'dev') { ' Dev' }) Setup [A-Za-z0-9._-]+\.exe$" -or
      $manifest.theoryLab.installerName -notmatch '^Quantum-Hamiltonian-Lab-Setup-[A-Za-z0-9._-]+\.exe$') {
    throw 'Candidate manifest identity is invalid'
  }
  $labCommit = (& git -C $labRepo rev-parse HEAD).Trim()
  if ($labCommit -ne $manifest.theoryLab.commit) { throw 'Theory Lab checkout differs from candidate source' }
  foreach ($entry in @(@($mathInstaller, $manifest.math3d.installerSha256), @($labInstaller, $manifest.theoryLab.installerSha256))) {
    $actual = (Get-FileHash -LiteralPath $entry[0] -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $entry[1]) { throw "Candidate installer hash mismatch: $($entry[0])" }
    if ($Math3DChannel -eq 'stable' -or $entry[0] -eq $labInstaller) {
      $component = & (Join-Path $labRepo 'scripts/verify-qi40-installer-nsis.ps1') -Installer $entry[0] | ConvertFrom-Json
      if ($component.installerSha256 -ne $actual) { throw 'NSIS component report installer identity mismatch' }
    }
  }
  & (Join-Path $PSScriptRoot 'inspect-quantum-installer-components.ps1') -CandidateDirectory $candidate `
    -EvidencePath (Join-Path $output 'installer-components.json')
  $components = Get-Content -LiteralPath (Join-Path $output 'installer-components.json') -Raw | ConvertFrom-Json
  $record.math3d = [ordered]@{ commit = $manifest.math3d.commit; channel = $Math3DChannel;
    installerSha256 = $manifest.math3d.installerSha256; nsisSystemDllSha256 = $components.components[0].systemDllSha256 }
  $record.theoryLab = [ordered]@{ commit = $manifest.theoryLab.commit;
    installerSha256 = $manifest.theoryLab.installerSha256; nsisSystemDllSha256 = $components.components[1].systemDllSha256 }
  $record.checks.candidate = 'passed'
  if ($Math3DChannel -eq 'stable') {
    Push-Location $labRepo
    try {
      node scripts/extract-qi40-candidate.mjs $manifestPath $extracted | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Candidate extraction failed' }
    } finally { Pop-Location }
    $extraction = Get-Content -LiteralPath (Join-Path $extracted 'extraction.json') -Raw | ConvertFrom-Json
  } else {
    $sevenZip = (Get-Command 7z.exe -ErrorAction Stop).Source
    $applications = [ordered]@{}
    foreach ($entry in @(@('math3d', $mathInstaller, $mathExeName), @('theoryLab', $labInstaller, 'Quantum Hamiltonian Lab.exe'))) {
      $outer = Join-Path $extracted "$($entry[0])/nsis"
      $app = Join-Path $extracted "$($entry[0])/app"
      New-Item -ItemType Directory -Path $outer, $app -Force | Out-Null
      & $sevenZip x $entry[1] "-o$outer" -y '$PLUGINSDIR/app-64.7z' | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Candidate archive extraction failed: $($entry[1])" }
      $archive = Join-Path $outer '$PLUGINSDIR/app-64.7z'
      & $sevenZip x $archive "-o$app" -y | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Candidate payload extraction failed: $archive" }
      $applications[$entry[0]] = [ordered]@{
        executableSha256 = (Get-FileHash -LiteralPath (Join-Path $app $entry[2]) -Algorithm SHA256).Hash.ToLowerInvariant()
        appAsarSha256 = (Get-FileHash -LiteralPath (Join-Path $app 'resources/app.asar') -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    }
    $extraction = [ordered]@{ manifestSha256 = $record.candidateManifestSha256; applications = $applications }
    $extraction | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $extracted 'extraction.json') -Encoding utf8
  }
  if ($extraction.manifestSha256 -ne $record.candidateManifestSha256) { throw 'Extraction manifest identity mismatch' }
  New-Item -ItemType Directory -Path $install | Out-Null
  foreach ($entry in @(@($mathInstaller, $mathInstall), @($labInstaller, $labInstall))) {
    $started = Get-Date
    $process = Start-Process -FilePath $entry[0] -ArgumentList @('/S', '/CURRENTUSER', "/D=$($entry[1])") -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(180000)) {
      try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch { }
      throw "Installer exceeded 180 seconds: $($entry[0])"
    }
    if ($process.ExitCode -ne 0) {
      $record.installerFailure = [ordered]@{
        name = [IO.Path]::GetFileName($entry[0]); exitCode = $process.ExitCode
        applicationErrors = @(Get-WinEvent -FilterHashtable @{
          LogName = 'Application'; Id = 1000; StartTime = $started.AddSeconds(-5)
        } -ErrorAction SilentlyContinue | Where-Object {
          $_.Properties.Count -gt 6 -and $_.Properties[0].Value -eq [IO.Path]::GetFileName($entry[0])
        } | Select-Object -First 3 | ForEach-Object {
          [ordered]@{ faultingModule = $_.Properties[3].Value; exceptionCode = $_.Properties[6].Value }
        })
      }
      throw "Installer exited $($process.ExitCode): $($entry[0])"
    }
  }
  foreach ($entry in @(
    @($mathExe, $extraction.applications.math3d.executableSha256),
    @($labExe, $extraction.applications.theoryLab.executableSha256),
    @((Join-Path $mathInstall 'resources/app.asar'), $extraction.applications.math3d.appAsarSha256),
    @((Join-Path $labInstall 'resources/app.asar'), $extraction.applications.theoryLab.appAsarSha256),
    @((Join-Path $mathInstall 'resources/python-worker/worker.exe'),
      (Get-FileHash -LiteralPath (Join-Path $extracted 'math3d/app/resources/python-worker/worker.exe') -Algorithm SHA256).Hash.ToLowerInvariant()),
    @((Join-Path $labInstall 'resources/quantum-worker/quantum-worker.exe'),
      (Get-FileHash -LiteralPath (Join-Path $extracted 'theoryLab/app/resources/quantum-worker/quantum-worker.exe') -Algorithm SHA256).Hash.ToLowerInvariant())
  )) {
    $actual = (Get-FileHash -LiteralPath $entry[0] -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $entry[1]) { throw "Installed payload differs from installer archive: $($entry[0])" }
  }
  $record.math3d.installedExecutableSha256 = $extraction.applications.math3d.executableSha256
  $record.theoryLab.installedExecutableSha256 = $extraction.applications.theoryLab.executableSha256
  $record.checks.install = 'passed'
  $retained = Join-Path $output 'retained'
  Push-Location $labRepo
  try {
    node scripts/accept-packaged-qwz.mjs $labExe $record.theoryLab.installedExecutableSha256 --retain $retained | Set-Content -LiteralPath (Join-Path $output 'producer.json') -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'Installed Theory Lab producer acceptance failed' }
    node scripts/verify-qi40-retained.mjs $retained | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Retained QWZ study verification failed' }
    $record.checks.freshProducer = 'passed'
    node scripts/accept-qi40-math3d.mjs $mathExe $record.math3d.installedExecutableSha256 $retained --candidate $manifestPath --evidence (Join-Path $output 'consumer') *> (Join-Path $output 'consumer-process.log')
    if ($LASTEXITCODE -ne 0) { throw "Installed Math3D QWZ two-view acceptance failed: $((Get-Content -LiteralPath (Join-Path $output 'consumer-process.log') -Tail 18) | Out-String)" }
    $record.checks.twoViews = 'passed'
    node scripts/accept-qi40-direct-launch.mjs $labExe $record.theoryLab.installedExecutableSha256 $mathExe $record.math3d.installedExecutableSha256 $retained (Join-Path $output 'direct') *> (Join-Path $output 'direct-process.log')
    if ($LASTEXITCODE -ne 0) { throw "Installed direct Theory Lab-to-Math3D launch failed: $((Get-Content -LiteralPath (Join-Path $output 'direct-process.log') -Tail 18) | Out-String)" }
    $record.checks.directLaunch = 'passed'
  } finally { Pop-Location }
  $producer = Get-Content -LiteralPath (Join-Path $retained 'acceptance.json') -Raw | ConvertFrom-Json
  $direct = Get-Content -LiteralPath (Join-Path $output 'direct/acceptance.json') -Raw | ConvertFrom-Json
  $consumer = Get-Content -LiteralPath (Join-Path $output 'consumer/acceptance.json') -Raw | ConvertFrom-Json
  if ($direct.runId -ne $producer.freshRun.runId -or
      $consumer.runId -ne $producer.freshRun.runId -or
      $direct.resultSha256 -ne $producer.freshRun.resultSha256 -or
      $consumer.resultSha256 -ne $producer.freshRun.resultSha256) {
    throw 'Installed producer, direct launch, and two-view identities differ'
  }
  $record.freshRun = $producer.freshRun
  $record.directAcceptanceSha256 = (Get-FileHash -LiteralPath (Join-Path $output 'direct/acceptance.json') -Algorithm SHA256).Hash.ToLowerInvariant()
  $record.consumerAcceptanceSha256 = (Get-FileHash -LiteralPath (Join-Path $output 'consumer/acceptance.json') -Algorithm SHA256).Hash.ToLowerInvariant()
  $record.status = 'passed'
} catch {
  $record.status = 'failed'
  $record.failure = $_.Exception.Message
  throw
} finally {
  $record | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath (Join-Path $output 'installed-pair.json') -Encoding utf8
  Write-Host "QI-40 installed pair evidence: $output"
}
