# Mobile Phase 5 Stability Matrix And Release Checklist

Last updated: September 17, 2026

Release foundation update (September 17, 2026): `apps/mobile/android` is now the
canonical project. Internal and release builds require non-debug signing
credentials, so the prior May release-build result is historical. Run the new
`npm run mobile:android:*` commands and repeat the device matrix before release.

Internal tester evidence (September 17, 2026): commit
`b93e9b813373fadfb34cccf7b882bd64f2a33e48` produced the signed
`Math3D-mobile-1.5.0-internal.apk` (SHA-256
`0b2d9b5bee1f5babe273c2f95ac43effeae2eed1033ec56dfc4cdca9b12e23ab`).
`apksigner` verified the internal certificate; Android 16 emulator installation,
Home launch, Catenoid gallery open, and touch orbit succeeded. The local tester
archive is `artifacts/mobile/Math3D-mobile-1.5.0-internal-b93e9b8.zip`.
Physical-device and production-release-signing validation remain pending.

## 1. Scope
This checklist is the Phase 5 gate for `apps/mobile` before external release.

## 2. Device Matrix

| Platform | Device Tier | OS | Build Type | Status |
| --- | --- | --- | --- | --- |
| Android | Mid-range physical (primary) | Android 16 | Release APK | Pending |
| Android | Emulator sanity | API 36 | Debug/Release | Pending |
| Android | Emulator P0 smoke | API 36 | Signed internal APK | Passed once on September 17, 2026; repeat matrix pending |
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
- [x] `npm --prefix apps/mobile run dev` launches.
- [ ] `npm run mobile:android:release` succeeds with the production signing key
  and its AAB is verified. The May 15 `assembleRelease` result predates the
  current signing policy.
- [x] No new TypeScript errors in `apps/mobile` and `packages/api-client`.
- [x] `packages/api-client` HTTP backend is used by mobile service layer.
- [x] Web/desktop builds are not broken by shared client changes.

## 6. Crash And Diagnostics Gate
- [ ] No blocker crashes in launch/viewer flow across matrix devices.
- [ ] Backend failures show actionable messages and retry path.
- [ ] Android GL fallback is only used when explicitly configured.

## 7. Release Checklist
- [x] Lock mobile dependency versions used in final QA build.
- [x] Capture final tested commit SHA and build artifact hashes.
- [ ] Archive logcat/iOS crash logs from full matrix run.
- [x] Update `docs/mobile-migration-implementation-plan.md` status notes.
- [ ] Sign off from engineering + QA before external distribution.

Automation note:
- Generate/update Phase 5 metadata report with `npm run phase5:mobile:release-metadata` (writes `output/mobile-phase5-release-metadata.md`).
- Generate/update device execution runbook with `npm run phase5:mobile:device-runbook` (writes `output/mobile-phase5-device-runbook.md`).

Execution note (May 15, 2026):
- `npm --prefix apps/mobile run dev` launched (`output/logs/mobile-dev-launch.log`).
- `npm --prefix apps/mobile run typecheck` succeeded.
- `./gradlew :app:assembleRelease` succeeded (Android build).
- `packages/api-client` TypeScript compile check succeeded via temporary isolated tsconfig in `output/`.
- `npm --prefix apps/web run build` and `npm --prefix apps/desktop run build` succeeded.
