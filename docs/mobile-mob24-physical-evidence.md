# MOB24 Samsung physical-device evidence

Date: September 18, 2026. **Status: exact-build Samsung device signoff approved; broader M0 release gates pending.** The canonical device record is [mobile-device-signoff.json](mobile-device-signoff.json).

## Why the candidate changed

The exact `150002` internal APK (SHA-256 `7484f071c9cb1eea0a5f342c580bdf227bfd91df12576fd554a6e27c2042ea02`) updated build `150001` on Samsung `SM-A566B`, Android 16. It launched and showed the saved Enneper scene, but the phone's three-button system navigation overlaid Math3D's bottom tabs. A tap in Explore's center landed in the system navigation area. This candidate failed the physical navigation gate. Screenshot: local ignored `output/mobile-mob24-150002/launch.png`.

Commit `150671d9d09d4ac79cac2f22b89e402d08345d08` replaces React Native's `SafeAreaView` with `react-native-safe-area-context` and wraps the app in `SafeAreaProvider`. Build `150003` moved the bottom tabs above the system bar. Its first USB-free relaunch then opened the older Implicit Sphere project instead of the last viewed Helicoid example. The Explore handler had never persisted that unsaved last-viewed scene. Commit `2ed879a534ca1e5c396280484c2d02971857ba48` stores a validated last-viewed scene snapshot separately from Files; build `150004` is the current candidate.

## Historical candidate: build 150003

| Field | Verified value |
| --- | --- |
| Source commit | `150671d9d09d4ac79cac2f22b89e402d08345d08` |
| Application ID | `com.math3d.mobile.internal` |
| Version / build | `1.5.0-internal` / `150003` |
| APK | `artifacts/mobile/internal-1.5.0-150003-150671d/Math3D-mobile-1.5.0-internal.apk` |
| APK SHA-256 | `89ea4c9e4885ec01b131fe4c19cc334258cb3d57f85294c69f84646822d1f28a` |
| Signing certificate SHA-256 | `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82` |
| Device | Samsung `SM-A566B`, Android 16, ADB serial `RZCY71087BY` |

`npm run mobile:android:internal` succeeded from the clean source commit. `apksigner verify --print-certs` reported the certificate above; `adb install -r` succeeded, and Android reported `versionCode=150003`. The APK itself is ignored by Git; use its hash, not its filename alone, when distributing it.

Local tester archive: `artifacts/mobile/internal-1.5.0-150003-150671d.zip` (SHA-256 `7c04818752081e776c1b1aaa55dce7c0e834f3b8840a4ae6f061d19d0275f779`). It contains the exact APK, `build-info.json`, `SHA256SUMS`, and a pending-signoff README; no signing secret is included.

## Build 150003 connected-device checks

| Check | Observation |
| --- | --- |
| Launch / Workspace | Launched and rendered saved Enneper and then Helicoid locally. No worker was needed for those scenes. |
| Bottom navigation | Tabs moved above the Samsung system controls; Explore and Files accepted taps. |
| Explore | Opened Functions and loaded Helicoid into Workspace. |
| Viewer | A one-finger swipe changed the Helicoid camera view. |
| Inspector | Expanded Object, selected 50% opacity, switched to Scene, and used Save to Files. |
| Persistence | Files listed Helicoid; after `am force-stop` and relaunch, Workspace restored Helicoid and Files still listed it. |
| Background/resume | Home then app relaunch returned to a running Math3D process. This is a short smoke, not the full 30-second matrix. |
| Crash log | After clearing logcat before launch, the captured log had zero matches for `FATAL EXCEPTION`, `Fatal signal`, `ReactNativeJS:.*Error`, or app ANR. |

Local ignored evidence: `output/mobile-mob24-150003/now.png` (SHA-256 `5c898e3932aaf7c0305a02b473c2115b96c80a4a34860610845d051c43cd528b`), `after-orbit.png` (SHA-256 `b91433bbcb0312173bc9ea7de85d302b05857e3cf9de343f678a9d926c934872`), Files/restore UI XML, and `logcat.txt` (SHA-256 `0c01e07a7c6c93135270493979e2a370b65ee6a91ac3fdb5a84bb21f6d29edc9`). The raw log may contain device data and is intentionally not committed.

## Current candidate: build 150004

| Field | Verified value |
| --- | --- |
| Source commit | `2ed879a534ca1e5c396280484c2d02971857ba48` |
| Application ID / version | `com.math3d.mobile.internal` / `1.5.0-internal` |
| APK | `artifacts/mobile/Math3D-mobile-1.5.0-internal.apk` |
| APK SHA-256 | `b2e798e7a14585b53c3786ee74b175169c3922da0f31e83e6813c448f9eee10b` |
| Signing certificate SHA-256 | `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82` |
| Local approved tester archive | `artifacts/mobile/internal-1.5.0-150004-2ed879a-approved.zip` (SHA-256 `638f4f13fcc8c219dd88ee66ed137aed16fba3c7e9db22d3cc75369699c5138f`) |

The APK was built from clean tracked source, signed with the shared local internal key, and updated the Samsung in place. Android reports `versionCode=150004`. The Android emulator smoke passed clean install, Workspace, inspector opacity, all five destinations, and a new regression: Explore → Functions → Helicoid → force-stop → relaunch restores Helicoid **without Save to Files**. On the Samsung, the same connected-device Helicoid sequence restored after force-stop; Object inspector 50% opacity and Scene controls also responded. The device owner then closed and reopened the app with USB unplugged and reported that Helicoid restored correctly. After reconnecting, Save to Files produced a Helicoid card; force-stop/relaunch kept Helicoid in Workspace and Files, and opening the saved card returned to Helicoid in Workspace. The final log capture had zero matches for `FATAL EXCEPTION`, `Fatal signal`, `ReactNativeJS:.*Error`, or app ANR (local `output/mobile-mob24-150004/logcat-final.txt`, SHA-256 `16b0c69887e733bc9557f61ed3ba336cd5cec16ddf839211b2b5818d062c244f`). Local `restore.png` has SHA-256 `440a9844f91a6e1b427b09dbe4ee241b69a36a50509868e9210b73ef04d4580b`. UI XML and raw logs are local ignored evidence; the raw log may contain device data.

## Remaining M0 release work

- A phone-reachable worker health/compute check over Wi-Fi.
- Complete the fuller repeated physical-device stability matrix.
- Shared CI internal signing identity and separately production-signed AAB remain part of the M0 release foundation; they do not follow from this local physical smoke.

The focused seven-check Samsung record is approved for the exact `150004` internal APK. The approved tester archive includes that record, the exact APK, build metadata, and its checksum; it contains no signing key. This does not approve the broader release matrix or production distribution.
