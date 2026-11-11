param(
  [string]$BuildDirectory = "build/native/cgal-worker",
  [string]$Triplet = "x64-windows"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$bundledCmake = Join-Path $repoRoot ".deps/vcpkg/downloads/tools/cmake-4.4.2-windows/cmake-4.4.2-windows-x86_64/bin/cmake.exe"
$cmake = if (Test-Path -LiteralPath $bundledCmake) { $bundledCmake } else {
  $installed = Get-Command cmake -ErrorAction SilentlyContinue
  if (-not $installed) { throw "CMake is required to build the native CGAL worker." }
  $installed.Source
}
$toolchain = Join-Path $repoRoot ".deps/vcpkg/scripts/buildsystems/vcpkg.cmake"
if (-not (Test-Path -LiteralPath $toolchain)) {
  throw "CGAL vcpkg toolchain not found at $toolchain. Install the pinned native dependencies first."
}
$vcpkgRoot = Join-Path $repoRoot ".deps/vcpkg"
$actualRecipe = (& git -C $vcpkgRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualRecipe -ne "52fd90f2b7798d9fe6fef18fc1787db44574d704") {
  throw "Native CGAL build requires the pinned public vcpkg recipe commit."
}
$target = Join-Path $repoRoot $BuildDirectory
& $cmake -S (Join-Path $repoRoot "native/cgal-worker") -B $target "-DCMAKE_TOOLCHAIN_FILE=$toolchain" "-DVCPKG_TARGET_TRIPLET=$Triplet"
if ($LASTEXITCODE -ne 0) { throw "Native CGAL configure failed." }
& $cmake --build $target --config Release --parallel 2
if ($LASTEXITCODE -ne 0) { throw "Native CGAL build failed." }
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot "native/cgal-worker/dependency-manifest.json") -Raw | ConvertFrom-Json
if ($Triplet -ne $manifest.windowsReferenceBuild.triplet) { throw "Native CGAL release triplet differs from the pinned manifest." }
$releaseDir = Join-Path $target "Release"
foreach ($dll in $manifest.windowsReferenceBuild.runtimeDlls) {
  $source = Join-Path $repoRoot ".deps/vcpkg/installed/$Triplet/bin/$dll"
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Pinned native CGAL runtime dependency missing: $dll" }
  Copy-Item -LiteralPath $source -Destination (Join-Path $releaseDir $dll) -Force
}
Write-Host "Native CGAL worker built. Run npm run test:cgal-native-worker to verify it."
