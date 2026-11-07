param([Parameter(Mandatory = $true)][string]$OutputRoot)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($OutputRoot)
$temporaryBase = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (-not $root.StartsWith($temporaryBase, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'OutputRoot must be a child of RUNNER_TEMP'
}
if (Test-Path -LiteralPath $root) { throw "OutputRoot already exists: $root" }
New-Item -ItemType Directory -Path $root | Out-Null

$archive = Join-Path $root 'nsis-bundle-3.13.tar.gz'
$url = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis%402.0.4/nsis-bundle-3.13.tar.gz'
Invoke-WebRequest -Uri $url -OutFile $archive
$expectedSha256 = 'c18e9ad9684cf4c5bbd7b768cbf1b056d40771d7bd9ae1b513346452decf89d2'
$actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha256 -ne $expectedSha256) { throw "NSIS bundle hash mismatch: $actualSha256" }

& tar -xzf $archive -C $root
if ($LASTEXITCODE -ne 0) { throw 'NSIS bundle extraction failed' }
$bundle = Join-Path $root 'nsis-bundle'
$windows = Join-Path $bundle 'windows'
$compilerSource = Join-Path $windows 'makensis.exe'
$compiler = Join-Path $windows 'Bin/makensis.exe'
$system = Join-Path $windows 'Plugins/x86-unicode/System.dll'
$elevate = Join-Path $bundle 'elevate.exe'
foreach ($required in @($compilerSource, $system, $elevate)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "NSIS bundle file missing: $required" }
}
Copy-Item -LiteralPath $compilerSource -Destination $compiler
Copy-Item -LiteralPath $elevate -Destination (Join-Path $windows 'elevate.exe')
$env:ELECTRON_BUILDER_NSIS_DIR = $windows
"ELECTRON_BUILDER_NSIS_DIR=$windows" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
[ordered]@{
  schema = 'math3d/qi40-nsis-toolchain/v1'
  source = $url
  archiveSha256 = $actualSha256
  compilerSha256 = (Get-FileHash -LiteralPath $compiler -Algorithm SHA256).Hash.ToLowerInvariant()
  systemDllSha256 = (Get-FileHash -LiteralPath $system -Algorithm SHA256).Hash.ToLowerInvariant()
  toolchainDirectory = $windows
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'toolchain.json') -Encoding UTF8
Write-Host "Prepared pinned NSIS 3.13 toolchain: $windows"
