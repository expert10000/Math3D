# React Native / Expo Commands (Math3D)

## 1) Go to mobile app folder

```powershell
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile
```

## 2) Install dependencies

From repo root:

```powershell
cd G:\Function-viewer-2026-02-05\Math3D
npm install
```

Optional SDK-compatible package pinning (run in `apps/mobile`):

```powershell
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile
npm install expo@^54.0.0
npx expo install --fix --npm
```

If `expo install` still tries Yarn:

```powershell
$env:EXPO_NO_YARN="1"
npx expo install --fix --npm
```

## 3) Start Expo (preferred attempts)

Tunnel mode:

```powershell
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile
npx expo start --tunnel --clear
```

LAN mode fallback:

```powershell
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile
npx expo start --lan --clear
```

Localhost (USB + adb reverse) fallback:

```powershell
adb reverse tcp:8081 tcp:8081
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile
npx expo start --localhost --clear
```

## 4) Windows Firewall rules (run as Administrator)

```powershell
$node = (Get-Command node).Source
New-NetFirewallRule -DisplayName "Math3D Expo Node (Private)" -Direction Inbound -Program $node -Action Allow -Profile Private -Protocol TCP
New-NetFirewallRule -DisplayName "Math3D Expo 8081 (Private)" -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort 8081
New-NetFirewallRule -DisplayName "Math3D Expo 19000-19002 (Private)" -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort 19000-19002
```

## 5) Optional cleanup/reset

```powershell
cd G:\Function-viewer-2026-02-05\Math3D
Remove-Item -Recurse -Force .\apps\mobile\.expo -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\apps\mobile\.expo-shared -ErrorAction SilentlyContinue
```

## 6) Second path (direct mobile folder)

```powershell
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile
```

## 7) USB run (second path, full commands)

```powershell
# 0) device check
adb devices

# 1) map Metro port over USB
adb reverse tcp:8081 tcp:8081

# 2) go direct to mobile app
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile

# 3) start clean localhost session
npx expo start --localhost --clear --port 8081
```

If app still shows old bundle, close stale Expo processes and restart:

```powershell
Get-CimInstance Win32_Process -Filter "name='node.exe'" `
| Where-Object { $_.CommandLine -match 'expo start' } `
| ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

adb reverse tcp:8081 tcp:8081
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile
npx expo start --localhost --clear --port 8081
```

## 8) Android debug build (Gradle) - correct project directory

If you run `gradlew.bat` from repo root without `-p`, Gradle fails with:

`Directory ... does not contain a Gradle build.`

Use one of these:

```powershell
# Option A (recommended): cd into android folder first
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile\android
.\gradlew.bat app:assembleDebug -x lint -x test --stacktrace
```

```powershell
# Option B: run from repo root with explicit project dir
cd G:\Function-viewer-2026-02-05\Math3D
.\apps\mobile\android\gradlew.bat -p .\apps\mobile\android app:assembleDebug -x lint -x test --stacktrace
```

## 9) Fix: SDK location not found

If Gradle reports:

`SDK location not found... define ANDROID_HOME or sdk.dir...`

Create `apps/mobile/android/local.properties`:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk" -replace '\\','/'
"sdk.dir=$sdk" | Set-Content -Path "G:\Function-viewer-2026-02-05\Math3D\apps\mobile\android\local.properties"
```

Expected file content example:

```text
sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
```

## 10) PowerShell `>>` prompt (continuation mode) fix

If prompt changes to `>>`, current command is incomplete or paste got corrupted.

```powershell
# cancel current broken input
Ctrl + C
```

Then run the command again as a clean single line.

## 11) USB native run (after build is healthy)

```powershell
# 1) device
adb devices

# 2) metro over USB
adb reverse tcp:8081 tcp:8081

# 3) run android build/install via expo
cd G:\Function-viewer-2026-02-05\Math3D\apps\mobile
npx expo run:android
```
