param(
  [string]$Python = "",
  [string]$VcpkgRoot = "",
  [string]$Triplet = "x64-windows",
  [string]$PygalmeshVersion = "0.10.7",
  [switch]$SkipVcpkgInstall,
  [switch]$SkipPythonDeps,
  [switch]$ForceReinstall,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$depsRoot = Join-Path $repo ".deps"
if (!$VcpkgRoot) {
  $VcpkgRoot = Join-Path $depsRoot "vcpkg"
}
$venvDir = Join-Path $repo ".venv-worker"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$vcpkgExe = Join-Path $VcpkgRoot "vcpkg.exe"
$vcpkgInstalled = Join-Path $VcpkgRoot "installed\$Triplet"
$vcpkgInclude = Join-Path $vcpkgInstalled "include"
$eigenInclude = Join-Path $vcpkgInclude "eigen3"
$vcpkgLib = Join-Path $vcpkgInstalled "lib"
$vcpkgBin = Join-Path $vcpkgInstalled "bin"
$buildRoot = Join-Path $depsRoot "pygalmesh-build"

function Write-Step([string]$Message) {
  Write-Host "[setup-cgal] $Message"
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $repo
  )
  Write-Step "$FilePath $($Arguments -join ' ')"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
  }
}

function Resolve-BasePython {
  if ($Python) {
    return $Python
  }
  if ($env:MATH3D_PYTHON) {
    return $env:MATH3D_PYTHON
  }
  if (Test-Path $venvPython) {
    return $venvPython
  }
  $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    return "py"
  }
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCommand) {
    return $pythonCommand.Source
  }
  throw "No Python found. Install Python 3.11+ or pass -Python C:\Path\python.exe."
}

function Invoke-Python {
  param([string[]]$Arguments)
  if ($script:BasePython -eq "py") {
    Invoke-Checked -FilePath "py" -Arguments (@("-3.11") + $Arguments)
  } else {
    Invoke-Checked -FilePath $script:BasePython -Arguments $Arguments
  }
}

function Find-VcVars64 {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $vswhere) {
    $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($installPath) {
      $candidate = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
      if (Test-Path $candidate) {
        return $candidate
      }
    }
  }
  $fallbacks = @(
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat"
  )
  foreach ($candidate in $fallbacks) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  throw "Visual Studio C++ tools not found. Install VS 2022 Build Tools with the C++ workload."
}

function Replace-Text {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Old,
    [Parameter(Mandatory = $true)][string]$New
  )
  $text = Get-Content -LiteralPath $Path -Raw
  if ($text.Contains($New)) {
    return
  }
  if (!$text.Contains($Old)) {
    throw "Patch anchor not found in $Path"
  }
  Set-Content -LiteralPath $Path -Value $text.Replace($Old, $New) -NoNewline
}

function Ensure-TextAfter {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Anchor,
    [Parameter(Mandatory = $true)][string]$Insert
  )
  $text = Get-Content -LiteralPath $Path -Raw
  if ($text.Contains($Insert)) {
    return
  }
  if (!$text.Contains($Anchor)) {
    throw "Patch anchor not found in $Path"
  }
  Set-Content -LiteralPath $Path -Value $text.Replace($Anchor, "$Anchor`r`n$Insert") -NoNewline
}

function Apply-PygalmeshPatch {
  param([Parameter(Mandatory = $true)][string]$SourceDir)
  $generateCpp = Join-Path $SourceDir "src\generate.cpp"
  $generateInr = Join-Path $SourceDir "src\generate_from_inr.cpp"
  $domainHpp = Join-Path $SourceDir "src\domain.hpp"
  $generateOff = Join-Path $SourceDir "src\generate_from_off.cpp"

  Ensure-TextAfter -Path $generateCpp -Anchor '#include "generate.hpp"' -Insert "#include <cassert>"
  Replace-Text -Path $generateCpp `
    -Old "#include <CGAL/Implicit_mesh_domain_3.h>" `
    -New "#include <CGAL/Mesh_3/Labeled_mesh_domain_3_implicit_function.h>"

  Replace-Text -Path $generateInr `
    -Old "#include <CGAL/Implicit_mesh_domain_3.h>" `
    -New "#include <CGAL/Mesh_3/Labeled_mesh_domain_3_implicit_function.h>"
  Ensure-TextAfter -Path $generateInr `
    -Anchor "#include <CGAL/Mesh_3/Labeled_mesh_domain_3_implicit_function.h>" `
    -Insert "#include <CGAL/Mesh_3/Labeled_mesh_domain_3_image.h>"

  Ensure-TextAfter -Path $domainHpp -Anchor "#include <Eigen/Dense>" -Insert "#include <cassert>"
  Ensure-TextAfter -Path $generateOff -Anchor "#include <CGAL/IO/OFF_reader.h>" -Insert "#include <CGAL/IO/OFF.h>"
  Replace-Text -Path $generateOff `
    -Old "#if CGAL_VERSION_MAJOR >= 5 && CGAL_VERSION_MINOR < 3" `
    -New "#if CGAL_VERSION_MAJOR == 5 && CGAL_VERSION_MINOR < 3"
  Replace-Text -Path $generateOff `
    -Old "#if CGAL_VERSION_MAJOR >= 5 && CGAL_VERSION_MINOR >= 3" `
    -New "#if CGAL_VERSION_MAJOR > 5 || (CGAL_VERSION_MAJOR == 5 && CGAL_VERSION_MINOR >= 3)"
}

function Invoke-WithVcVars {
  param([Parameter(Mandatory = $true)][string]$Command)
  $vcvars = Find-VcVars64
  $cmd = "call `"$vcvars`" >nul && set EIGEN_INCLUDE_DIR=$eigenInclude && set INCLUDE=$vcpkgInclude;$eigenInclude;%INCLUDE% && set LIB=$vcpkgLib;%LIB% && set PATH=$vcpkgBin;%PATH% && $Command"
  Invoke-Checked -FilePath "cmd.exe" -Arguments @("/d", "/s", "/c", $cmd)
}

New-Item -ItemType Directory -Force -Path $depsRoot | Out-Null
Set-Location $repo

if (!(Test-Path $vcpkgExe)) {
  Write-Step "vcpkg not found; cloning into $VcpkgRoot"
  Invoke-Checked -FilePath "git" -Arguments @("clone", "https://github.com/microsoft/vcpkg.git", $VcpkgRoot)
  Invoke-Checked -FilePath (Join-Path $VcpkgRoot "bootstrap-vcpkg.bat")
}

if (!$SkipVcpkgInstall) {
  Invoke-Checked -FilePath $vcpkgExe -Arguments @("install", "cgal:$Triplet", "eigen3:$Triplet")
}

foreach ($requiredPath in @($vcpkgInclude, $eigenInclude, $vcpkgLib, $vcpkgBin)) {
  if (!(Test-Path $requiredPath)) {
    throw "Required vcpkg path missing: $requiredPath"
  }
}

$script:BasePython = Resolve-BasePython
if (!(Test-Path $venvPython)) {
  Write-Step "creating worker venv at $venvDir"
  Invoke-Python -Arguments @("-m", "venv", $venvDir)
}
$script:BasePython = $venvPython

Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel")
Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "pybind11")
if (!$SkipPythonDeps) {
  Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "numpy", "scipy", "sympy", "vtk", "CGAL")
}

Remove-Item -LiteralPath $buildRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
Invoke-Checked -FilePath $venvPython -Arguments @(
  "-m", "pip", "download",
  "pygalmesh==$PygalmeshVersion",
  "--no-binary", "pygalmesh",
  "--no-deps",
  "-d", $buildRoot
)

$sdist = Get-ChildItem -LiteralPath $buildRoot -Filter "pygalmesh-$PygalmeshVersion*.tar.gz" | Select-Object -First 1
if (!$sdist) {
  throw "Downloaded pygalmesh source archive not found in $buildRoot"
}
Invoke-Checked -FilePath $venvPython -Arguments @(
  "-c",
  "import sys, tarfile; tarfile.open(sys.argv[1], 'r:gz').extractall(sys.argv[2])",
  $sdist.FullName,
  $buildRoot
)

$sourceDir = Get-ChildItem -LiteralPath $buildRoot -Directory |
  Where-Object { $_.Name -like "pygalmesh-$PygalmeshVersion*" } |
  Select-Object -First 1
if (!$sourceDir) {
  throw "Extracted pygalmesh source directory not found."
}
Apply-PygalmeshPatch -SourceDir $sourceDir.FullName

$installArgs = @("-m", "pip", "install", "--no-build-isolation")
if ($ForceReinstall) {
  $installArgs += "--force-reinstall"
}
$installArgs += $sourceDir.FullName
$quotedPython = "`"$venvPython`""
$quotedArgs = ($installArgs | ForEach-Object { "`"$_`"" }) -join " "
Invoke-WithVcVars -Command "$quotedPython $quotedArgs"

if (!$SkipSmoke) {
  Invoke-Checked -FilePath $venvPython -Arguments @(
    "-c",
    "from python.worker.runtime import dependency_probe; p=dependency_probe(); assert p['dependencies']['pygalmesh']['ok'], p; assert p['dependencies']['CGAL']['ok'], p; print('dependency_probe ok: pygalmesh + CGAL')"
  )
  $smokeJson = '{"type":"mesh.generate","jobId":"setup-cgal-smoke","expr":"x*x+y*y+z*z-1","iso":0,"bbox":{"min":[-1.5,-1.5,-1.5],"max":[1.5,1.5,1.5]},"quality":{"minFacetAngle":20,"radiusBound":0.5,"distanceBound":0.2},"verbose":false}'
  $smokeOutput = $smokeJson | & $venvPython -m python.worker.main
  if ($LASTEXITCODE -ne 0) {
    throw "worker mesh.generate smoke failed"
  }
  $resultLine = $smokeOutput | Where-Object { $_ -like '*"type": "result"*' } | Select-Object -Last 1
  if (!$resultLine) {
    throw "worker mesh.generate smoke did not emit a result"
  }
  $result = $resultLine | ConvertFrom-Json
  if (!$result.ok) {
    throw "worker mesh.generate smoke returned failure: $($result.error)"
  }
  Write-Host "mesh.generate smoke ok: $($result.vertexCount) vertices / $($result.triCount) triangles"
}

Write-Step "complete"
Write-Host "Worker Python: $venvPython"
Write-Host "vcpkg DLL dir: $vcpkgBin"
