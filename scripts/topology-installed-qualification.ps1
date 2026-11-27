# TOP-05 source-to-installed-app qualification. Execute on the Windows machine with
# the genuine installed application (not an electron-builder unpacked directory).
# This script does NOT install or upgrade software and does not approve a release.
param(
  [Parameter(Mandatory = $true)][string]$InstalledExe,
  [Parameter(Mandatory = $true)][string]$InstallerPath,
  [string]$EvidenceDir = "docs/ui/2.0/evidence/top05-installed-local",
  [string]$ExpectedInstallerSha256 = "",
  [string]$ExpectedExeSha256 = ""
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repo
$exe = (Resolve-Path -LiteralPath $InstalledExe).Path
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
if ([IO.Path]::GetExtension($exe) -ne ".exe") { throw "InstalledExe must point to a Windows executable" }
if (-not ($exe.StartsWith($env:ProgramFiles, [StringComparison]::OrdinalIgnoreCase) -or
          ($env:LOCALAPPDATA -and $exe.StartsWith($env:LOCALAPPDATA, [StringComparison]::OrdinalIgnoreCase)))) {
  throw "Expected a genuine Program Files/LocalAppData installed executable, not an unpacked build"
}
$installerHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$exeHash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ExpectedInstallerSha256 -and $installerHash -ne $ExpectedInstallerSha256.ToLowerInvariant()) { throw "Installer hash mismatch" }
if ($ExpectedExeSha256 -and $exeHash -ne $ExpectedExeSha256.ToLowerInvariant()) { throw "Executable hash mismatch" }
$evidence = Join-Path $repo $EvidenceDir
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$sourceSha = (git rev-parse HEAD).Trim()
$record = [ordered]@{
  evidence = "TOP05-installed-source-app-check"
  checkedUtc = [DateTime]::UtcNow.ToString("o")
  sourceCommit = $sourceSha
  installerPath = $installer
  installerSha256 = $installerHash
  installedExePath = $exe
  installedExeSha256 = $exeHash
  mode = "existing-installed-app; no install/upgrade executed"
  result = "pending"
}
$record | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $evidence "identity.json") -Encoding utf8
$env:MATH3D_PACKAGED_APP_EXE = $exe
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = Join-Path $evidence "native.json"
try {
  & npx playwright test tests/e2e/topology-functional-acceptance.spec.ts --grep "TOP-05 native cold reopen" --workers=1 --retries=0 --reporter=list,json
  $exitCode = $LASTEXITCODE
  $record.result = if ($exitCode -eq 0) { "scoped-pass" } else { "failed" }
  $record | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $evidence "identity.json") -Encoding utf8
  if ($exitCode -ne 0) { throw "Installed-app native cold-reopen failed, exit $exitCode" }
} finally {
  Remove-Item Env:MATH3D_PACKAGED_APP_EXE -ErrorAction SilentlyContinue
  Remove-Item Env:PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue
}
Write-Host "Installed-app scoped evidence: $evidence"
Write-Host "Installer SHA256: $installerHash"
Write-Host "Executable SHA256: $exeHash"
Write-Host "Source commit: $sourceSha"
