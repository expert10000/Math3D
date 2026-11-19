# Android device qualification baseline

## 2.0.0 signed internal candidate — 2026-11-18

**Status:** Android 16 emulator gate passed against integrated main `572e24fd48170482c9c9c67371905713688783dc`; physical-device acceptance and final release freeze remain pending while memory qualification stays open. Checklist #17 remains open. The tested Android branch source commit is `ea606f243291aca2787a2f1f93ca34889ab12055`, which merges that exact main commit; subsequent evidence documentation is not part of the APK.

The [shared-key Android Gate run](https://github.com/expert10000/Math3D/actions/runs/44319048934) produced `Math3D-mobile-2.0.0-internal.apk`, package `com.math3d.mobile.internal`, version name `2.0.0-internal`, and version code `200001`. Downloaded APK SHA-256: `e43ea89e314d9e93c06c5b44441d591817714e0490f1269b38f805ecd99f45f2`. The independent downloaded-byte hash equals [build-info.json](evidence/m3d20-17-android-44319048934/build-info.json) and [SHA256SUMS](evidence/m3d20-17-android-44319048934/SHA256SUMS). Local Android Build Tools 36 `apksigner verify --verbose --print-certs` passed and reported the established internal certificate SHA-256 `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82`; `aapt dump badging` confirmed the package and version. The build metadata reports clean tracked source and `projectRecoveryChecks: true`. Signing credentials stayed in GitHub Actions; none are in this record.

The same APK and source commit passed [clean install, offline Workspace, inspector, five-destination navigation, restart, and fatal-log smoke](evidence/m3d20-17-android-44319048934/smoke-result.json); [four portrait/landscape layout profiles, keyboard, background/foreground, network loss, GL recreation, and process recovery](evidence/m3d20-17-android-44319048934/matrix-result.json); and [11/11 prepare plus 12/12 restart recovery checks](evidence/m3d20-17-android-44319048934/recovery-result.json) on an Android 16 / API 36 emulator. The added native recovery check saves an edited mixed Project with Graph/Curve/Surface checkpoints and a required Graph point-table sidecar, exports it through the production mobile Project package path, reimports it, and compares the exact Project, sidecar list, and re-exported package bytes. The diagnostic leaves the user library unchanged. Local mobile TypeScript and 31 focused Project/storage tests also passed.

### Physical-device acceptance record to complete

No authorized phone appeared in `adb devices -l` on 2026-11-18. This record is **PENDING DEVICE**, not a PASS. The tester must record privately: serial, model, Android version/API, tester, UTC time, source commit above, exact downloaded APK SHA-256 above, internal certificate SHA-256 above, and installed `base.apk` SHA-256. Use the APK attached to run `44319048934`; a rebuilt APK or final frozen-source APK needs its own receipt.

1. Save the downloaded APK and CI metadata together. Recompute `Get-FileHash -Algorithm SHA256` and run Build Tools 36 `apksigner verify --verbose --print-certs` and `aapt dump badging`; stop if any identity differs from this section.
2. Preserve phone data. If `com.math3d.mobile.internal` is present, verify its signer before `adb install -r` and stop on a mismatch or downgrade. Do not uninstall or clear data to force a pass. Install only on the explicitly authorized device, then get its `base.apk` path with `adb shell pm path com.math3d.mobile.internal` and compare `adb shell sha256sum <base.apk path>` with the downloaded APK hash.
3. Record PASS/FAIL, screenshots or hierarchy, and scoped `AndroidRuntime`/`ReactNativeJS` logs for every case below. Restore orientation, font size, network, and keyboard settings after the run. The emulator smoke and quality-matrix scripts must not be pointed at a physical phone because they change device state.

| Case | Required phone observation | Status |
| --- | --- | --- |
| Install and first launch | Installed bytes and signer match; standalone launch opens Workspace with no fatal Android/JS error. | Pending device |
| Named Graph/Project and exact package | Create or edit a Graph, save in a named Project, force-stop/reopen it, export the Project package, and reimport those exact bytes as a copy. Record exported SHA-256; confirm the Graph edit, Project relationship, and required source sidecar survive. | Pending device |
| Missing required resource | Import a Project package lacking a required source sidecar. Preview remains inspectable; full edit/open is refused with the named missing resource. Existing Project stays intact. | Pending device |
| Portrait, landscape, keyboard | Exercise both orientations and an editable Graph/Project field while the keyboard is shown. Controls remain reachable, focus and saved work survive return to portrait. | Pending device |
| Restart and recovery | Force-stop and relaunch without clearing app data; reopen the exact Project. If running `mobile-android-storage-recovery.mjs`, supply this run's `build-info.json` and require the installed APK hash check before the isolated diagnostic. | Pending device |
| Evidence and restoration | Retain a result per case, Project export hash, screenshots/hierarchy, scoped crash logs, and confirmation of restored device settings. | Pending device |

The checked-in `docs/mobile-device-signoff.json` is the older 1.6.0 Samsung record. `npm run mobile:device:signoff:check` correctly rejects it for 2.0.0 because version/build and mobile source differ. Do not change it to approved without the phone observations above. The production AAB workflow remains gated by current physical signoff, and a final frozen 2.0 source commit must be rebuilt and qualified separately.

### Earlier 2.0 candidate

The first [2.0 internal candidate run](https://github.com/expert10000/Math3D/actions/runs/44297711200) passed the same emulator matrix at source `d33e0df54365e2df4cf71019ae1c199b93ad9aae`, APK SHA-256 `3b9dc41aa928e41ac28f9abc3d1009dcda8acbcec955ec52e688aeced01ce258`. Its [build metadata](evidence/m3d20-17-android-44297711200/build-info.json) and [smoke](evidence/m3d20-17-android-44297711200/smoke-result.json), [layout](evidence/m3d20-17-android-44297711200/matrix-result.json), and [recovery](evidence/m3d20-17-android-44297711200/recovery-result.json) receipts remain historical. It predates integrated Mesh and gallery main and is not the current phone acceptance artifact.

## Prior 1.6.0 preflight

**Prepared:** 2026-11-14 for source commit `02c42bb3776dd6143f403ad9780ec11eff4e599c`.
**Historical status:** Signed internal APK and Android 16 emulator preflight passed; no phone pass was recorded for that build.

## Artifact and signing route

The [shared-key Android Gate run](https://github.com/expert10000/Math3D/actions/runs/43606595286) passed from the exact source commit above on a separate ref. It produced the installable `Math3D-mobile-1.6.0-internal.apk` for `com.math3d.mobile.internal`, build `150008`. Its SHA-256 is `9ec3512224155d51d2fc4b4de130f44c2bd726d43e0a0317b6d2d2be7b019aba`. The downloaded bytes match [CI build metadata](evidence/m3d20-17-android-43606595286/build-info.json) and [SHA256SUMS](evidence/m3d20-17-android-43606595286/SHA256SUMS). Local `apksigner` verified its v2 APK signature and the established internal certificate SHA-256 `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82`. This package does not update the public app.

The run passed [clean-install and navigation smoke](evidence/m3d20-17-android-43606595286/smoke-result.json), [layout, keyboard, and lifecycle checks](evidence/m3d20-17-android-43606595286/matrix-result.json), and [10/10 prepare plus 11/11 restart recovery checks](evidence/m3d20-17-android-43606595286/recovery-result.json) on an Android 16 emulator. These receipts identify the same commit and APK hash. They are emulator evidence, not a physical-device pass.

The four internal signing secrets and four production upload-key secrets are configured in GitHub Actions. No local signing keystore is available on this workstation. The production AAB workflow requires a current physical-device signoff before packaging; the checked-in signoff covers an older 1.6.0 source commit and APK. `node scripts/mobile-device-signoff.mjs` fails on this source because the mobile contents changed and the historical signoff commit is not an ancestor. The mobile version file still identifies `1.6.0`/build `150008`. An internal APK from the current source can establish a device baseline, but final 2.0 qualification requires the frozen source, release identity, and matching signed artifact.

## Device acceptance record

At preflight and after CI completion, `adb devices -l` listed no authorized device. Record the device serial privately, model, Android version, tester, date, source commit, exact APK hash, signing certificate SHA-256, and installed APK hash before testing. Preserve existing app data: use an update install for the internal package if its signing identity matches; stop on a signing mismatch rather than uninstalling or clearing data. Do not run the emulator smoke or quality-matrix scripts on a physical phone; those runners are emulator-only and change device state.

| Case | Required observation | Status |
| --- | --- | --- |
| Install and first launch | The exact signed APK installs, launches standalone, and reports no fatal AndroidRuntime or ReactNativeJS error. Installed APK bytes and signing identity match the reviewed artifact. | Pending device |
| Graph and Project round trip | Create or edit a Graph, save it in a named Project, close and reopen the Project, export it, and reimport the same bytes. Confirm the source relationship and edited Graph survive. | Pending device |
| Missing resource refusal | Import a Project with a missing required source sidecar and confirm preview remains inspectable while full edit/open is refused with a named reason. | Pending device |
| Rotation and keyboard | Exercise portrait and landscape, then open an editable Graph or Project field with the keyboard visible. Check controls, focus, and saved state after returning to the original orientation. | Pending device |
| Restart and recovery | Force-stop and relaunch without clearing data, then reopen the exact Project. Run the non-destructive `mobile-android-storage-recovery.mjs` probe only after matching its `build-info.json` and installed APK hash. | Pending device |
| Evidence review | Save screenshots/UI hierarchy, scoped crash logs, before/after Project bytes or export hash, device settings restored, and one result per case. | Pending device |

The [platform matrix](PLATFORM_CAPABILITIES.md) remains limited for Android. An emulator pass, historical Samsung receipt, or configured signing secret cannot replace this device record.
