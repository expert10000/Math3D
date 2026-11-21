param(
  [Parameter(Mandatory = $true)][string]$InstallDirectory,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExpectedAppSha256,
  [string]$InstallRegistryKey = '',
  [string]$UninstallRegistryKey = ''
)

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows is required.' }
$install = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\', '/')
$app = Join-Path $install 'Math3D.exe'
$uninstaller = Join-Path $install 'Uninstall Math3D.exe'
if (-not (Test-Path -LiteralPath $app -PathType Leaf) -or
    -not (Test-Path -LiteralPath $uninstaller -PathType Leaf) -or
    (Get-FileHash -LiteralPath $app -Algorithm SHA256).Hash -ne $ExpectedAppSha256) {
  throw 'Previous application and uninstaller bytes are not intact at the requested directory.'
}
if ([bool]$InstallRegistryKey -ne [bool]$UninstallRegistryKey) {
  throw 'Supply both registry keys or neither.'
}
if ($InstallRegistryKey) {
  $installEntries = @(Get-ItemProperty -LiteralPath $InstallRegistryKey)
  $uninstallEntries = @(Get-ItemProperty -LiteralPath $UninstallRegistryKey)
} else {
  $installEntries = @(Get-ChildItem -LiteralPath 'HKCU:\Software' | ForEach-Object {
    Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
  } | Where-Object { $_.Math3DUpgradeFrom -in @('1.6.0', '1.7.0') })
  $uninstallEntries = @(Get-ChildItem -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | ForEach-Object {
    Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
  } | Where-Object { $_.DisplayName -eq 'Math3D' -and $_.Math3DPreviousUninstallString })
}
$installEntries = @($installEntries | Where-Object {
  $_.Math3DUpgradeFrom -in @('1.6.0', '1.7.0') -and
  $_.InstallLocation -and [IO.Path]::GetFullPath($_.InstallLocation).TrimEnd('\', '/') -eq $install
})
if ($installEntries.Count -ne 1) { throw 'Interrupted upgrade install marker is not unique and intact.' }
$uninstallEntries = @($uninstallEntries | Where-Object {
  $_.DisplayName -eq 'Math3D' -and $_.DisplayVersion -in @('1.6.0', '1.7.0') -and
  $_.DisplayVersion -eq $installEntries[0].Math3DUpgradeFrom -and
  -not $_.UninstallString -and $_.Math3DPreviousUninstallString
})
if ($uninstallEntries.Count -ne 1) { throw 'Prior uninstall registration is not unique and intact.' }
$previous = [string]$uninstallEntries[0].Math3DPreviousUninstallString
if ($previous -notmatch '^"([^"]+)"') { throw 'Saved uninstall command is malformed.' }
if ([IO.Path]::GetFullPath($matches[1]) -ne [IO.Path]::GetFullPath($uninstaller)) {
  throw 'Saved uninstall command points outside the previous installation.'
}
Set-ItemProperty -LiteralPath $uninstallEntries[0].PSPath -Name UninstallString -Value $previous
Remove-ItemProperty -LiteralPath $uninstallEntries[0].PSPath -Name Math3DPreviousUninstallString
Remove-ItemProperty -LiteralPath $installEntries[0].PSPath -Name Math3DUpgradeFrom
Write-Host "Restored the Math3D $($uninstallEntries[0].DisplayVersion) uninstall registration at $install."
