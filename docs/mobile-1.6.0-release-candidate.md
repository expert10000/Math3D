# Mobile 1.6.0 release candidate

Updated September 30, 2026. This is a candidate record, **not** a public
release or an approval of MOB-G13. The published `v1.5.1`/build `150007`
record remains in [its own release evidence](mobile-1.5.1-release-readiness.md).

## Signing and update identity

- The next Android version is `1.6.0`, build `150008`, application ID
  `com.math3d.mobile`. The higher build number is required for an update to
  the published `150007` build.
- Reuse the existing production upload-key certificate recorded in
  [mobile-release-signing.json](mobile-release-signing.json), SHA-256
  `66a86e95eaf60f8d2224dd06ad5ef4eec6c856ca2b5e32dc954384bc6ad41be3`.
  Do not create a replacement production key. The previously verified
  owner-controlled encrypted backup and four GitHub Actions production-key
  secrets are the recovery/build path; the removable backup is not currently
  mounted on this workstation. Never commit a keystore or recovery code.
- Internal physical-test APKs use the separate established internal
  certificate, SHA-256
  `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82`.
  They update `com.math3d.mobile.internal`, not the public package.

## Checks completed before the version bump

The [existing-key CI run](https://github.com/expert10000/Math3D/actions/runs/36717684984)
passed version/type checks, a clean internal APK build, SHA-256 and signing
verification, and Android 16 emulator smoke. Its exact `1.5.1-internal` APK
is SHA-256 `3d171b317213a0783b3a4868cc8b03c0e3217ad70459b0843e056c365385945c`.
It was installed over the existing app on the Samsung SM-A566B, reopened the
saved “Two slopes import 2” Graph after force-stop, and opened/closed Graph
Gallery. This validates the signing/update route, but it is **not** the
`1.6.0` candidate or a transfer of device approval.

The first CI attempt exposed a stale Explore search assumption in the emulator
smoke script. Commit `4bd677c` made that test scroll to the control; the
rerun passed. No app feature was changed to hide the failure.

## Remaining gates

1. Build a clean `1.6.0` internal APK with the shared internal key; verify its
   artifact hash/certificate and Android emulator smoke. Install that **exact
   APK** over the Samsung internal app and record the physical checks, crash
   logs, and owner-observed standalone relaunch before updating
   [mobile-device-signoff.json](mobile-device-signoff.json). The older `150007`
   approval must not be copied to the new candidate.
2. Complete the full [MOB-G13 physical matrix](mobile-graphs-g11-g13-acceptance.md)
   and professional feature cases in [G2D40](graph2d-g40-professional-acceptance.md),
   including the missing device classes and screen-reader/rotation/performance
   evidence. Focused Samsung TalkBack and capture/share checks are documented
   in [GGL14–17 evidence](graph2d-gallery-ggl14-ggl17-showcase.md); they do not
   close that matrix.
3. Only after exact-build signoff, run the
   [production AAB workflow](../.github/workflows/mobile-android-production-aab.yml)
   **without** `release_tag` first. It retrieves the existing production key
   from GitHub Actions secrets, compares the AAB certificate with the public
   record and uploads a verification-only artifact. The local workstation
   has no production keystore configured.
4. Review release scope and artifacts, then create/publish a `v1.6.0` release
   and invoke that workflow with the matching existing tag. A verification-only
   AAB or internal APK is not a public release. Do not waive the signoff gate
   or attach an unverified AAB.
