param([Parameter(Mandatory = $true)][string]$MakensisPath)

$ErrorActionPreference = 'Stop'
$compiler = (Resolve-Path -LiteralPath $MakensisPath).Path
$include = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../packaging/nsis-v16-upgrade.nsh')).Path
$tempBase = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$scratch = [IO.Path]::GetFullPath((Join-Path $tempBase ('math3d-nsis-include-' + [guid]::NewGuid().ToString('N'))))
if (-not $scratch.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'NSIS smoke path escaped the temporary directory.' }
New-Item -ItemType Directory -Path $scratch | Out-Null

try {
  foreach ($mode in @('installer', 'uninstaller')) {
    $modeDefine = if ($mode -eq 'uninstaller') { '!define BUILD_UNINSTALLER' } else { '' }
    $body = if ($mode -eq 'installer') { @'
Function .onInit
  !insertmacro customInit
FunctionEnd
Section "smoke"
  !insertmacro customInstall
SectionEnd
'@ } else { @'
Section "smoke"
SectionEnd
'@ }
    $scriptPath = Join-Path $scratch "$mode.nsi"
    $outputPath = Join-Path $scratch "$mode.exe"
    @"
$modeDefine
!define APP_GUID "04569709-f841-5d53-81a9-9e9132fd0377"
!define UNINSTALL_APP_KEY "04569709-f841-5d53-81a9-9e9132fd0377"
!include "$include"
!define /ifndef INSTALL_REGISTRY_KEY "Software\`${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\`${UNINSTALL_APP_KEY}"
!include "LogicLib.nsh"
Name "Math3D NSIS include smoke"
OutFile "$outputPath"
!insertmacro customHeader
$body
"@ | Set-Content -LiteralPath $scriptPath -Encoding utf8
    & $compiler /WX /V2 $scriptPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "NSIS $mode include smoke failed." }
  }
  Write-Host 'NSIS custom include compiles in installer and uninstaller modes.'
} finally {
  if ($scratch.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $scratch)) {
    Remove-Item -LiteralPath $scratch -Recurse -Force
  }
}
