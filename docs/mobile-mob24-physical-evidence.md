# MOB24 Samsung physical-device evidence

Date: September 18, 2026. **Status: partial; release signoff pending.** The canonical gate is [mobile-device-signoff.json](mobile-device-signoff.json).

## Why the candidate changed

The exact `150002` internal APK (SHA-256 `7484f071c9cb1eea0a5f342c580bdf227bfd91df12576fd554a6e27c2042ea02`) updated build `150001` on Samsung `SM-A566B`, Android 16. It launched and showed the saved Enneper scene, but the phone's three-button system navigation overlaid Math3D's bottom tabs. A tap in Explore's center landed in the system navigation area. This candidate failed the physical navigation gate. Screenshot: local ignored `output/mobile-mob24-150002/launch.png`.

Commit `150671d9d09d4ac79cac2f22b89e402d08345d08` replaces React Native's `SafeAreaView` with `react-native-safe-area-context` and wraps the app in `SafeAreaProvider`. Build `150003` is the new candidate. Its bottom tabs are visibly above the Android system bar on the same phone.

## Candidate identity

| Field | Verified value |
| --- | --- |
| Source commit | `150671d9d09d4ac79cac2f22b89e402d08345d08` |
| Application ID | `com.math3d.mobile.internal` |
| Version / build | `1.5.0-internal` / `150003` |
| APK | `artifacts/mobile/Math3D-mobile-1.5.0-internal.apk` |
| APK SHA-256 | `89ea4c9e4885ec01b131fe4c19cc334258cb3d57f85294c69f84646822d1f28a` |
| Signing certificate SHA-256 | `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82` |
| Device | Samsung `SM-A566B`, Android 16, ADB serial `RZCY71087BY` |

`npm run mobile:android:internal` succeeded from the clean source commit. `apksigner verify --print-certs` reported the certificate above; `adb install -r` succeeded, and Android reported `versionCode=150003`. The APK itself is ignored by Git; use its hash, not its filename alone, when distributing it.

Local tester archive: `artifacts/mobile/internal-1.5.0-150003-150671d.zip` (SHA-256 `7c04818752081e776c1b1aaa55dce7c0e834f3b8840a4ae6f061d19d0275f779`). It contains the exact APK, `build-info.json`, `SHA256SUMS`, and a pending-signoff README; no signing secret is included.

## Connected-device checks

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

## Remaining before approval

- First owner-observed **USB-free** relaunch opened Implicit Sphere, although Helicoid was the last scene restored during the connected ADB check. The owner reported not opening Implicit Sphere before closing. This result needs a controlled repeat: confirm Helicoid is present in Files, open it, close from recent apps, relaunch, and inspect Workspace and Files. `standaloneRelaunch` remains false until the scene identity is explained and restore is verified.
- A phone-reachable worker health/compute check over Wi-Fi, or an explicit decision to defer it from this internal baseline.
- Complete the fuller repeated physical-device stability matrix. Record tester and date in the signoff file only when the required checks are genuinely complete.
- Shared CI internal signing identity and separately production-signed AAB remain part of the M0 release foundation; they do not follow from this local physical smoke.

The signoff JSON stays `pending` until every required physical check passes.
