# Mobile Phase 5 Stability Matrix And Release Checklist

Last updated: September 19, 2026

The active Android candidate is [version 1.5.1, build 150007](mobile-1.5.1-release-readiness.md).
Its signed APK and AAB, emulator smoke, and exact-build Samsung signoff pass.
The owner-controlled encrypted USB key backup is verified. Publication remains
pending. The `150006` evidence below is historical.

MOB24 physical-device update (September 18, 2026): build `150002` failed
Samsung `SM-A566B` navigation because its bottom tabs overlapped the system
bar. Build `150003` corrected the safe area but reopened an older project when
an unsaved Explore example was the last view. Commit
`2ed879a534ca1e5c396280484c2d02971857ba48` preserves the last viewed
scene; internal build `150004` has APK SHA-256
`b2e798e7a14585b53c3786ee74b175169c3922da0f31e83e6813c448f9eee10b`
and signing certificate
`39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82`.
The emulator restart regression, USB-free Samsung Helicoid restore, Files
persistence, and final fatal-log review passed for `150004`. Its focused
exact-build device signoff was approved. Internal build `150006`
adds phone-to-worker Wi-Fi support: ten repeated Samsung cycles, live implicit
preview, Files persistence, and shared-key CI passed. Its owner-observed
USB-free [device signoff](mobile-device-signoff-150006.json) is approved; see
the [historical matrix evidence](mobile-150006-release-matrix.md).

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

Physical-device P0 smoke (September 18, 2026): the same APK hash installed with
ADB on a Samsung `SM-A566B` running Android 16. It launched, displayed a native
3D surface in Viewer, and remained running. The user confirmed the tabs work.
The app process had no fatal crash in the inspected logs. The user accepted this
as the internal tester install path at that point. The later `150004` device
signoff covered USB-free relaunch; later `150006` covered phone-to-worker Wi-Fi
and a ten-cycle subset. The first production AAB is locally signed and
verified; remaining physical and iOS matrix rows are pending.

Workspace UI emulator smoke (September 18, 2026): build `150002` from commit
`e2ed838c7461ddf0edcc85438611289f2517b435` (APK SHA-256
`7484f071c9cb1eea0a5f342c580bdf227bfd91df12576fd554a6e27c2042ea02`)
clean-installed on Android 16. Catenoid loaded in Workspace, inspector swipes
opened/closed the sheet, 50% opacity updated, and no app fatal crash appeared
in filtered logs. The later Samsung test found its bottom navigation overlapped
the phone's system bar; this build failed physical-device signoff.

CI gate (September 18, 2026): `.github/workflows/mobile-android.yml` now runs
mobile version/typecheck, an internal APK build, checksum and signature checks,
and a focused Android 16 emulator smoke, then captures the APK and evidence.
The desktop release workflow waits for this gate. A tagged release additionally
requires an approved `docs/mobile-device-signoff.json` record for the tested
mobile source and signing certificate. The Samsung record is approved for build
`150004`; the local emulator pass alone does not count as physical-device signoff.
For `150006`, shared CI internal signing and its certificate comparison pass.
The first production/upload key is recorded in
[mobile-release-signing.json](mobile-release-signing.json), and the local AAB
passed checksum and embedded certificate verification. The
[production AAB CI run](https://github.com/expert10000/Math3D/actions/runs/35405368898)
also passed; its downloaded AAB matched the release certificate. Owner-controlled
off-device key backup is verified for `1.5.1`.

## 1. Scope
This checklist is the Phase 5 gate for `apps/mobile` before external release.

## 2. Device Matrix

| Platform | Device Tier | OS | Build Type | Status |
| --- | --- | --- | --- | --- |
| Android | Mid-range physical (primary) | Android 16 | Release APK | Pending |
| Android | Emulator sanity | API 36 | Debug/Release | Pending |
| Android | Emulator P0 smoke | API 36 | Signed internal APK | Passed once on September 17, 2026; repeat matrix pending |
| Android | Emulator Workspace UI smoke | API 36 | Signed internal APK, build `150002` | Clean install, native Catenoid, inspector gesture and opacity passed once on September 18, 2026 |
| Android | Samsung `SM-A566B` physical P0 smoke | Android 16 | Signed internal APK | Install, launch, tabs, and native surface passed once on September 18, 2026; repeat matrix pending |
| Android | Samsung `SM-A566B` MOB24 candidate | Android 16 | Signed internal APK, build `150004` | Focused device signoff approved: USB-free Helicoid restore, Files save/reopen across restart, navigation, inspector, fatal-log review; full matrix pending |
| Android | Samsung `SM-A566B` network candidate | Android 16 | Signed internal APK, build `150006` | 10/10 repeated launch/Gallery/orbit/quality/health/background cycles, implicit preview, Files persistence; USB-free Catenoid restore approved; full matrix pending |
| iOS | Current iPhone physical | iOS latest supported by SDK 54 | Release | Pending |
| iOS | Simulator sanity | iOS 18.5 on hosted iPhone 16 Pro | Unsigned Release | App shell and tabs visible; 3D viewport blank at 15s and 45s, and the screenshot gate fails |

## 3. Stability Smoke Matrix
Run each row 10 times unless stated otherwise.

| Test Case | Android | iOS | Pass Criteria |
| --- | --- | --- | --- |
| Cold launch -> Workspace and Catenoid visible | Samsung `150006`: 10/10 visible; first interactive frame timing pending | Pending | No crash, app interactive in < 3s on test hardware |
| Explore -> Gallery -> Catenoid -> Workspace | Samsung `150006`: 10/10; final screenshot rendered | Pending | GL viewer renders surface, no fallback unless explicitly enabled |
| Orbit/pan/zoom for 30 seconds | Pending | Pending | No frame stall > 2s, no crash |
| Open implicit preset -> preview mesh generation | Samsung `150006`: 10/10 fresh remote previews ready, no cached fallback | Pending | Preview completes or actionable error with retry |
| Background app for 30 seconds -> resume | Samsung `150006`: 10/10 | Pending | Viewer recovers, no black screen/crash |
| Kill app -> relaunch -> reopen recent scene | Samsung `150006`: 10/10 Catenoid; Files save/reopen checked once | Pending | Scene list and open flow preserved |
| Toggle quality presets (`performance`, `balanced`, `sharp`) | Samsung `150006`: 10/10 taps with app alive; visual refresh timing pending | Pending | Mesh refreshes, no crash |
| Backend URL health check with valid endpoint | Samsung `150006`: 10/10 warmed checks, plus initial health | Pending | Health = ok |
| Backend URL health check with invalid endpoint | Samsung `150006`: 10/10 error with actionable message; valid URL restored | Pending | Health = error with clear message |

## 4. Performance Budgets

| Metric | Target |
| --- | --- |
| Cold start to first interactive screen | <= 3.0s |
| Gallery -> viewer first render | <= 2.5s |
| Implicit preview request roundtrip (local worker-proxy network) | <= 4.0s typical |
| Peak memory during viewer interaction (mid-range Android) | No OOM, no repeated crash loop |

## 5. Regression Gates
- [x] `npm --prefix apps/mobile run dev` launches.
- [x] `npm run mobile:android:release` succeeds with the production signing key
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
- [x] Approve the historical build `150004` physical-device record after USB-free relaunch,
  Workspace, Explore, inspector, Files persistence, and crash-log checks.
- [x] Approve the exact `150006` record after owner-observed USB-free Catenoid
  restore. The earlier worker health and implicit preview used Wi-Fi without
  ADB reverse while USB remained connected for diagnostics.
- [x] Confirm off-device encrypted backup of both signing keys and credential files.
- [x] Approve exact `150007` physical-device signoff before publishing 1.5.1.
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
