# Mobile Phase 5 Device Runbook

Generated: 2026-05-15T17:41:41.959Z
Tester: pb
Commit SHA under test: 44bff9778ab17b6dae6ed1da56b9403bef7e8f29

## 1. Preflight

- [ ] `npm run phase5:mobile:gate`
- [ ] `npm run phase5:mobile:release-metadata`
- [ ] `npm --prefix apps/mobile run dev` launches locally
- [ ] Android release build command executed: `./gradlew :app:assembleRelease` (from `apps/mobile/android`)

## 2. Device Matrix Results

| Platform | Device Tier | OS | Build Type | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Android | Mid-range physical (primary) | Android 16 | Release APK | Pending |  |
| Android | Emulator sanity | API 36 | Debug/Release | Pending |  |
| iOS | Current iPhone physical | iOS latest supported by SDK 54 | Release | Pending |  |
| iOS | Simulator sanity | iOS latest supported by SDK 54 | Debug/Release | Pending |  |

## 3. Stability Smoke Runs

Run each row 10 times unless stated otherwise.

| Test Case | Android Result | iOS Result | Notes |
| --- | --- | --- | --- |
| Cold launch -> Home tab visible | Pending | Pending |  |
| Open Gallery -> Catenoid -> Viewer | Pending | Pending |  |
| Orbit/pan/zoom for 30 seconds | Pending | Pending |  |
| Open implicit preset -> preview mesh generation | Pending | Pending |  |
| Background app for 30 seconds -> resume | Pending | Pending |  |
| Kill app -> relaunch -> reopen recent scene | Pending | Pending |  |
| Toggle quality presets (`performance`, `balanced`, `sharp`) | Pending | Pending |  |
| Backend URL health check with valid endpoint | Pending | Pending |  |
| Backend URL health check with invalid endpoint | Pending | Pending |  |

## 4. Performance Measurements

| Metric | Target | Android Actual | iOS Actual |
| --- | --- | --- | --- |
| Cold start to first interactive screen | <= 3.0s | Pending | Pending |
| Gallery -> viewer first render | <= 2.5s | Pending | Pending |
| Implicit preview request roundtrip | <= 4.0s typical | Pending | Pending |
| Peak memory during viewer interaction | No OOM/crash loop | Pending | Pending |

## 5. Evidence Capture

- [ ] Archive Android `logcat` output from full matrix run.
- [ ] Archive iOS simulator/device crash logs from full matrix run.
- [ ] Attach output paths and hashes below.

Recommended capture commands:

```powershell
adb logcat -d > output/logs/mobile-android-logcat.txt
```

```bash
xcrun simctl spawn booted log stream --style compact > output/logs/mobile-ios-sim.log
```

## 6. Signoff

- [ ] Engineering signoff complete.
- [ ] QA signoff complete.
- [ ] `docs/mobile-phase5-stability-checklist.md` updated after this run.

## Artifact Hashes

| Path | SHA256 | Status |
| --- | --- | --- |
| output\logs\mobile-dev-launch.err.log | d7a87d0e7d93bac82ee5ec4a055def22cf5710c088c15f5cedf89c0431804ef7 | OK |
| output\logs\mobile-dev-launch.log | 51a18d3fba35f3e98650e82011ca8bb4ef15bf89f6216dd6573e2c5c9467d189 | OK |
| output\logs\web-worker-proxy.log | 686cbfa0360373e5bbd65de865ae1b39bd43fcc3dbfbe864b405ed67dc3895cd | OK |

