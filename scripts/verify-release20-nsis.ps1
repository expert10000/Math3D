param([Parameter(Mandatory = $true)][string]$InstallerPath)

$ErrorActionPreference = 'Stop'
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
$sevenZip = (Get-Command 7z.exe -ErrorAction Stop).Source
$temporaryBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { $env:TEMP }
$tempRoot = [IO.Path]::GetFullPath($temporaryBase).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$scratch = [IO.Path]::GetFullPath((Join-Path $tempRoot ("math3d-release20-nsis-" + [guid]::NewGuid().ToString('N'))))
if (-not $scratch.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'NSIS scratch path escaped the temporary directory.' }
New-Item -ItemType Directory -Path $scratch | Out-Null
try {
  $rows = & $sevenZip l -slt $installer
  if ($LASTEXITCODE -ne 0) { throw '7-Zip could not list candidate installer components.' }
  $matches = @($rows | ForEach-Object { if ($_ -match '^Path = (.+[\/])?System\.dll$') { $Matches[0].Substring(7) } })
  if ($matches.Count -ne 1) { throw "Expected one installer System.dll; found $($matches.Count)." }
  & $sevenZip e -y "-o$scratch" $installer $matches[0] | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '7-Zip could not extract installer System.dll.' }
  $system = Join-Path $scratch 'System.dll'
  $bytes = (Get-Item -LiteralPath $system).Length
  $hash = (Get-FileHash -LiteralPath $system -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($bytes -ne 30208 -or $hash -ne '1556ee1bf1cb477124e1269b534ed81653ba71994dab7903ee3782b75acc2810') {
    throw "Installer NSIS component differs from the pinned 3.13 System.dll: $bytes bytes, $hash"
  }
  [ordered]@{ schema = 'math3d/release20-nsis/v1'; installerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
    systemDllSha256 = $hash; systemDllBytes = $bytes; archivePath = $matches[0] } | ConvertTo-Json -Depth 4
} finally {
  if ($scratch.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $scratch)) {
    Remove-Item -LiteralPath $scratch -Recurse -Force
  }
}
