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
$target = Join-Path $repoRoot $BuildDirectory
& $cmake -S (Join-Path $repoRoot "native/cgal-worker") -B $target "-DCMAKE_TOOLCHAIN_FILE=$toolchain" "-DVCPKG_TARGET_TRIPLET=$Triplet"
if ($LASTEXITCODE -ne 0) { throw "Native CGAL configure failed." }
& $cmake --build $target --config Release --parallel 2
if ($LASTEXITCODE -ne 0) { throw "Native CGAL build failed." }
Write-Host "Native CGAL worker built. Run npm run test:cgal-native-worker to verify it."
