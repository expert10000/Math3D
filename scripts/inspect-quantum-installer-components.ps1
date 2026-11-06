param(
  [Parameter(Mandatory = $true)][string]$CandidateDirectory,
  [Parameter(Mandatory = $true)][string]$EvidencePath
)

$ErrorActionPreference = 'Stop'
$candidate = (Resolve-Path -LiteralPath $CandidateDirectory).Path
$manifest = Get-Content -LiteralPath (Join-Path $candidate 'candidate-manifest.json') -Raw | ConvertFrom-Json
$sevenZip = (Get-Command 7z.exe -ErrorAction Stop).Source
$scratch = Join-Path $env:RUNNER_TEMP 'qi40-installer-components'
if (Test-Path -LiteralPath $scratch) { throw "Scratch path already exists: $scratch" }
New-Item -ItemType Directory -Path $scratch | Out-Null

$rows = @()
foreach ($app in @('math3d', 'theoryLab')) {
  $name = $manifest.$app.installerName
  $installer = (Resolve-Path -LiteralPath (Join-Path $candidate $name)).Path
  $archiveRows = & $sevenZip l -slt $installer
  if ($LASTEXITCODE -ne 0) { throw "7-Zip could not inspect $name" }
  $matches = @($archiveRows | ForEach-Object {
    if ($_ -match '^Path = (.+[\\/])?System\.dll$') { $Matches[0].Substring(7) }
  })
  if ($matches.Count -ne 1) { throw "Expected one System.dll in $name; found $($matches.Count)" }
  $folder = Join-Path $scratch $app
  New-Item -ItemType Directory -Path $folder | Out-Null
  & $sevenZip e -y "-o$folder" $installer $matches[0] | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "7-Zip could not extract System.dll from $name" }
  $plugin = Join-Path $folder 'System.dll'
  if (-not (Test-Path -LiteralPath $plugin -PathType Leaf)) { throw "Extracted System.dll missing from $name" }
  $file = Get-Item -LiteralPath $plugin
  $rows += [ordered]@{
    app = $app
    installerName = $name
    installerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
    archivePath = $matches[0]
    systemDllSha256 = (Get-FileHash -LiteralPath $plugin -Algorithm SHA256).Hash.ToLowerInvariant()
    systemDllBytes = $file.Length
    systemDllVersion = $file.VersionInfo.FileVersion
  }
}
$result = [ordered]@{
  schema = 'math3d/qi40-installer-components/v1'
  manifestCommit = $manifest.math3d.commit
  components = $rows
  sameSystemDllBytes = $rows[0].systemDllSha256 -eq $rows[1].systemDllSha256
  limitation = 'Archive component identity does not identify the access-violation root cause; no crash dump was inspected.'
}
New-Item -ItemType Directory -Path (Split-Path -Parent $EvidencePath) -Force | Out-Null
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
Write-Host "Installer component evidence: $EvidencePath"
