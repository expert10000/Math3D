# Mobile Phase 5 Stability Matrix And Release Checklist

Last updated: May 15, 2026

## 1. Scope
This checklist is the Phase 5 gate for `apps/mobile` before external release.

## 2. Device Matrix

| Platform | Device Tier | OS | Build Type | Status |
| --- | --- | --- | --- | --- |
| Android | Mid-range physical (primary) | Android 16 | Release APK | Pending |
| Android | Emulator sanity | API 36 | Debug/Release | Pending |
| iOS | Current iPhone physical | iOS latest supported by SDK 54 | Release | Pending |
| iOS | Simulator sanity | iOS latest supported by SDK 54 | Debug/Release | Pending |

## 3. Stability Smoke Matrix
Run each row 10 times unless stated otherwise.

| Test Case | Android | iOS | Pass Criteria |
| --- | --- | --- | --- |
| Cold launch -> Home tab visible | Pending | Pending | No crash, app interactive in < 3s on test hardware |
| Open Gallery -> Catenoid -> Viewer | Pending | Pending | GL viewer renders surface, no fallback unless explicitly enabled |
| Orbit/pan/zoom for 30 seconds | Pending | Pending | No frame stall > 2s, no crash |
| Open implicit preset -> preview mesh generation | Pending | Pending | Preview completes or actionable error with retry |
| Background app for 30 seconds -> resume | Pending | Pending | Viewer recovers, no black screen/crash |
| Kill app -> relaunch -> reopen recent scene | Pending | Pending | Scene list and open flow preserved |
| Toggle quality presets (`performance`, `balanced`, `sharp`) | Pending | Pending | Mesh refreshes, no crash |
| Backend URL health check with valid endpoint | Pending | Pending | Health = ok |
| Backend URL health check with invalid endpoint | Pending | Pending | Health = error with clear message |

## 4. Performance Budgets

| Metric | Target |
| --- | --- |
| Cold start to first interactive screen | <= 3.0s |
| Gallery -> viewer first render | <= 2.5s |
| Implicit preview request roundtrip (local worker-proxy network) | <= 4.0s typical |
| Peak memory during viewer interaction (mid-range Android) | No OOM, no repeated crash loop |

## 5. Regression Gates
- [ ] `npm --prefix apps/mobile run dev` launches.
- [ ] `./gradlew :app:assembleRelease` succeeds for Android.
- [ ] No new TypeScript errors in `apps/mobile` and `packages/api-client`.
- [ ] `packages/api-client` HTTP backend is used by mobile service layer.
- [ ] Web/desktop builds are not broken by shared client changes.

## 6. Crash And Diagnostics Gate
- [ ] No blocker crashes in launch/viewer flow across matrix devices.
- [ ] Backend failures show actionable messages and retry path.
- [ ] Android GL fallback is only used when explicitly configured.

## 7. Release Checklist
- [ ] Lock mobile dependency versions used in final QA build.
- [ ] Capture final tested commit SHA and build artifact hashes.
- [ ] Archive logcat/iOS crash logs from full matrix run.
- [ ] Update `docs/mobile-migration-implementation-plan.md` status notes.
- [ ] Sign off from engineering + QA before external distribution.
