# Android device qualification baseline

**Prepared:** 2026-11-14 for source commit `02c42bb3776dd6143f403ad9780ec11eff4e599c`.
**Status:** Signed internal APK and Android 16 emulator preflight passed; physical-device and final 2.0 artifact qualification remain open. Checklist #17 is not closed.

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
