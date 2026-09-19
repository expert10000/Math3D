# Mobile 1.5.1 Android release readiness

Updated September 19, 2026. This is the active release record for Android
version `1.5.1`, build `150007`. The [build 150006 matrix](mobile-150006-release-matrix.md)
and its [approved signoff](mobile-device-signoff-150006.json) remain historical
evidence; approval does not transfer to a new APK.

## Built candidate

| Evidence | Value |
| --- | --- |
| Mobile source commit | `0022cf59ffe3622822d95cb9506bcb332f9d3388` |
| Internal package | `com.math3d.mobile.internal`, `1.5.1-internal`, build `150007` |
| Internal APK SHA-256 | `326a0e679a5ed37ff30377ecafa7abc3c0112ddb663e7de14435eb8d1a04631d` |
| Internal certificate SHA-256 | `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82` |
| Local tester candidate archive SHA-256 | `5b441ae7c3926736acef6c814ab16b049d45c53bfe0ada7fa042be0046f32620` |
| Release package | `com.math3d.mobile`, `1.5.1`, build `150007` |
| Local signed AAB SHA-256 | `e044611db80396cb9a5272cf201d9767c929241ef1ea41a3ca131257176655bd` |
| Release certificate SHA-256 | `66a86e95eaf60f8d2224dd06ad5ef4eec6c856ca2b5e32dc954384bc6ad41be3` |
| Local AAB archive SHA-256 | `7527655d39323dd895326b6a723c9740706298927516fcabfc729027e11c0c01` |

The local archives are ignored by Git. Both archives were extracted and their
binary hashes compared with their own `SHA256SUMS`. The AAB passed `jarsigner`
and embedded-certificate verification. The Android 16 emulator clean install
passed offline Catenoid launch, inspector swipe/opacity, five destinations,
Explore sections, last-example process restore, and fatal-log review. The
emulator was left running.

## Gates before publication

- [ ] Back up `mobile-release.jks` and `release.json`, plus the internal key and
  credential file, to owner-controlled encrypted storage off this laptop.
  Verify the copied files and restore procedure. CI secrets do not replace a
  recoverable backup; [public signing status](mobile-release-signing.json)
  remains `ownerBackupVerified: false`.
- [ ] Install the exact `150007` APK on the Samsung and complete the current
  [device signoff](mobile-device-signoff.json), including USB-free relaunch,
  Catenoid restore, Files, inspector, worker health over Wi-Fi, a 30-second
  two-finger pan/zoom check, first interactive 3D frame timing, and logs.
- [ ] Run the shared-key Android CI gate for `1.5.1` and compare its certificate
  with the phone-tested APK. The APK bytes will differ, so their hashes stay
  separate.
- [ ] Run the production AAB workflow from the final release tag. Its publish
  option attaches the verified AAB, checksum, metadata, and verification report
  to the existing GitHub release; the temporary CI artifact expires after 14
  days.
- [ ] Create and publish `v1.5.1` only after the exact-build signoff and key
  backup. The existing `v1.5.0` tag points to earlier source and must remain
  unchanged.

The iOS simulator still launches a shell with a blank 3D viewport. An iOS
release requires a separate rendering fix and physical-device validation.
