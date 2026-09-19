# Mobile 1.5.1 Android release readiness

Updated September 19, 2026. This is the completed release record for Android
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

The [normal Android PR gate](https://github.com/expert10000/Math3D/actions/runs/35447603606)
and [shared-key Android gate](https://github.com/expert10000/Math3D/actions/runs/35447640901)
passed for `1.5.1`. The downloaded shared-key CI APK has SHA-256
`54b43ae628785bfc0ea6edabdd4811e0e1015c71c7170cd509c06fedcf6477ab`
and the same internal certificate as the local candidate. Its CI artifact ZIP
has SHA-256 `ac231d311d2bb19794b0ec84674019ccbc9f1bc8a5f8d01f5775531f19f17547`.
The CI APK bytes differ from the locally tested candidate, so they require
separate hashes and do not share physical-device approval.

## Release gates

- [x] Back up `mobile-release.jks` and `release.json`, plus the internal key and
  credential file, to an AES-256-GCM encrypted archive on the owner's removable
  USB drive. The archive was decrypted and compared with all four source files;
  the restore procedure passed with a synthetic archive, and the owner confirmed
  the recovery code is stored separately. Its SHA-256 is
  `14a36e8bd069db8f84af5c0782fe6ca19121a1a512108a9d0e2940ff9d57c8da`.
  The [public signing record](mobile-release-signing.json) records verification
  without exposing the recovery code.
- [x] Install the exact `150007` APK on the Samsung and complete the current
  [device signoff](mobile-device-signoff.json), including USB-free relaunch,
  Catenoid restore, Files, inspector, worker health over Wi-Fi, a 30-second
  two-finger pan/zoom check, first visible 3D frame timing, and logs.
- [x] Run the shared-key Android CI gate for `1.5.1` and compare its certificate
  with the local candidate. The APK bytes differ, so their hashes stay separate.
- [x] Run the [production AAB workflow](https://github.com/expert10000/Math3D/actions/runs/35451199120)
  from the final release tag. It published the verified AAB, checksum,
  metadata, and verification report to the GitHub release.
- [x] Create and publish [`v1.5.1`](https://github.com/expert10000/Math3D/releases/tag/v1.5.1)
  only after exact-build signoff and key backup. The tag resolves to merge
  commit `3aad812cd4d5d19a3cdf260be26accba8fed92f9`. The existing
  `v1.5.0` tag remains unchanged. The [release workflow](https://github.com/expert10000/Math3D/actions/runs/35450068115)
  passed its mobile gate and Windows and Linux packaging jobs.

## Published Android artifact

The public release asset `Math3D-mobile-1.5.1-release.aab` has SHA-256
`07fcad1bbe315569d2aed744c35e1b30e44bcc7cfaf7bef219c9e9ea3db3cf67`.
The downloaded asset matched the published `SHA256SUMS`. Its metadata records
application ID `com.math3d.mobile`, version `1.5.1`, build `150007`, clean tag
commit `3aad812cd4d5d19a3cdf260be26accba8fed92f9`, and production
certificate SHA-256
`66a86e95eaf60f8d2224dd06ad5ef4eec6c856ca2b5e32dc954384bc6ad41be3`.
This tagged CI AAB has a different byte hash from the earlier local and
branch-CI AABs; the certificate and release identity match. The
[verification-only branch CI run](https://github.com/expert10000/Math3D/actions/runs/35449219698)
produced AAB SHA-256
`129dc45d2f5be253f8aedc7c839d1de7f64b192d401503807e0bcb231ec3a216`.

The iOS simulator still launches a shell with a blank 3D viewport. An iOS
release requires a separate rendering fix and physical-device validation.

## Samsung build 150007 signoff

The exact APK above installed on the SM-A566B running Android 16. Catenoid
rendered in Workspace, reopened from Files, and survived a 32-second background
resume. Explore showed Gallery, Functions, and Learn. The Object sheet showed
visibility, opacity, fit, reset camera, and hide controls. The owner panned and
pinch-zoomed for about 30 seconds without a crash. Three unlocked cold launches
reached a visible 3D frame within 1301, 1160, and 1206 ms respectively; these
are screenshot-sampling upper bounds. Android and React fatal-log review found
no crash. With USB unplugged, the owner closed and reopened the app, confirmed
Catenoid restored, and received `Health: ok` from the saved Wi-Fi worker URL.
ADB had no reverse tunnel configured; the phone's route to the worker used
`wlan0`.
