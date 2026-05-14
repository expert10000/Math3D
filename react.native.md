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

