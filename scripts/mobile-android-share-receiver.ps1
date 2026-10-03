param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$javaRoot = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:/Program Files/Java/jdk-17' }
$toolsRoot = Join-Path $sdkRoot 'build-tools/36.0.0'
$androidJar = Join-Path $sdkRoot 'platforms/android-36/android.jar'
$fixture = Join-Path $repoRoot 'tests/fixtures/android-share-receiver'
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$classes = Join-Path $outputRoot 'classes'
$dex = Join-Path $outputRoot 'dex'
New-Item -ItemType Directory -Path $classes, $dex -Force | Out-Null

function Invoke-FixtureTool([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Share receiver build tool failed: $Executable ($LASTEXITCODE)" }
}
Invoke-FixtureTool (Join-Path $javaRoot 'bin/javac.exe') @('--release', '8', '-cp', $androidJar, '-d', $classes,
    (Join-Path $fixture 'LocalShareReceiverActivity.java'))
Invoke-FixtureTool (Join-Path $toolsRoot 'd8.bat') @('--min-api', '28', '--lib', $androidJar, '--output', $dex,
    (Join-Path $classes 'com/math3d/acceptance/sharereceiver/LocalShareReceiverActivity.class'))
$unsigned = Join-Path $outputRoot 'receiver-unsigned.apk'
$aligned = Join-Path $outputRoot 'receiver-aligned.apk'
$apk = Join-Path $outputRoot 'Math3D-local-share-receiver.apk'
Invoke-FixtureTool (Join-Path $toolsRoot 'aapt2.exe') @('link', '-I', $androidJar, '--manifest',
    (Join-Path $fixture 'AndroidManifest.xml'), '-o', $unsigned)
Invoke-FixtureTool (Join-Path $javaRoot 'bin/jar.exe') @('uf', $unsigned, '-C', $dex, 'classes.dex')
Invoke-FixtureTool (Join-Path $toolsRoot 'zipalign.exe') @('-f', '-p', '4', $unsigned, $aligned)
$keystore = Join-Path $outputRoot 'receiver-debug.jks'
if (!(Test-Path -LiteralPath $keystore)) {
    # Public fixture password, unrelated to all Math3D internal/release signing keys.
    Invoke-FixtureTool (Join-Path $javaRoot 'bin/keytool.exe') @('-genkeypair', '-keystore', $keystore,
        '-storepass', 'android', '-keypass', 'android', '-alias', 'share-receiver', '-keyalg', 'RSA',
        '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Math3D Local Share Test', '-storetype', 'JKS')
}
Invoke-FixtureTool (Join-Path $toolsRoot 'apksigner.bat') @('sign', '--ks', $keystore,
    '--ks-key-alias', 'share-receiver', '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $apk, $aligned)
function Get-CanonicalSourceHash([string]$Path) {
    $text = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return [System.BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
[ordered]@{
    format = 'math3d.local-share-receiver-build.v1'
    applicationId = 'com.math3d.acceptance.sharereceiver'
    debugTestFixture = $true
    apkSha256 = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    sourceHashEncoding = 'UTF-8 LF'
    javaSourceSha256 = Get-CanonicalSourceHash (Join-Path $fixture 'LocalShareReceiverActivity.java')
    manifestSha256 = Get-CanonicalSourceHash (Join-Path $fixture 'AndroidManifest.xml')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputRoot 'receiver-build-info.json')
Write-Output "Built local acceptance receiver: $apk"
