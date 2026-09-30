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

## Exact 1.6.0 candidate evidence

The exact `1.6.0`/`150008` internal candidate is now available from
[shared-key CI run 36720069303](https://github.com/expert10000/Math3D/actions/runs/36720069303).
Its APK SHA-256 is
`e4716cf04b54609d8239199ccc31ac9e702be96fafb4445dc6063f2d41fe9ffd`,
and its source is `354d06db90d71fa21000afd1a80263623f847c6c` with a clean
tracked build. The downloaded bytes match the CI checksum. Local `apksigner`
verification confirms the established internal certificate listed above;
the APK contains its embedded Hermes bundle. CI Android 16 smoke passed.

The exact APK updated the Samsung SM-A566B to `1.6.0-internal`/`150008`
without clearing app data. A forced relaunch restored “Two slopes import 2”;
all 17 saved projects remained listed and that Graph reopened from Projects.
Gallery/My Graphs, presentation/exit, Graph Functions, Home featured
Previous/Next, Explore search, Settings and the offline Catenoid viewport
were reached. Scoped AndroidRuntime/ReactNativeJS error logs were empty.
Screenshots/XML and signature evidence are in
`output/mobile-160-samsung/`; the downloaded APK and CI reports are in
`output/mobile-160-candidate-36720069303/`. The physical inspector also
changed Catenoid opacity to 50% and restored it to 100%.

This APK is **not approved**: switching from the saved Graph to the unsaved
Catenoid example and force-stopping the app restored the earlier Graph.
Startup treated the first saved project as current before considering the
last-viewed Surface snapshot. The fix preserves explicitly selected saved
Graphs while prioritizing a valid Surface snapshot over the library fallback.
Two unit regressions and a mixed Graph/Surface emulator restart check cover
this path; all 327 mobile unit tests and the mobile typecheck passed locally.
That failure required the rebuilt APK and fresh physical checks below. The owner reported
Catenoid reopen/zoom/pan working, but the debug and internal apps have identical
launcher labels, so that observation is not assigned to an exact candidate.
The existing `150007` signoff is preserved in
[its historical record](mobile-device-signoff-150007.json).

### Rebuilt restart-fix candidate

[Shared-key CI run 36743132389](https://github.com/expert10000/Math3D/actions/runs/36743132389)
passed on clean source `15f945fcd07cc64b2fd3de511904e6c428521d39`.
The APK SHA-256 is
`cdfd15ee9a9229c3bf4b97fe7142c34c9b7fd5184c18473b68272848ad7e3f8c`.
Downloaded bytes match build metadata; local signature verification confirms
the established internal certificate. The embedded Hermes bundle is 3,649,172
bytes, with all four Android ABIs. The Android 16 smoke explicitly passes
the mixed saved-Graph → unsaved-Catenoid process restart regression.

This exact APK updated the Samsung without clearing data (the app data inode
remained unchanged). The saved Graph still reopens after process restart,
and switching from it to Catenoid now restores Catenoid after force-stop;
the rendered Surface was visually inspected. All 17 projects remain listed.
Graph Gallery/My Graphs, Functions with the saved `y=5*x` definition,
presentation/exit, Home Previous/Next, Explore and Settings were reached.
Inspector opacity changed to 50% and back to 100%. Scoped
AndroidRuntime/ReactNativeJS logs since installation are empty.
Evidence uses `fixed-*` captures in `output/mobile-160-samsung/`, and the CI
artifact is in `output/mobile-160-candidate-36743132389/`.
The initial human zoom/pan report was ambiguous because the two launcher
labels were identical; it was not transferred to this APK.

The owner subsequently reported reopening a three-petal Graph from one of
two identically named launcher icons. Reconnection identified the most recent
Math3D task as `com.math3d.mobile`, the older `1.5.1` debuggable build.
Explicitly relaunching `com.math3d.mobile.internal` again restored Catenoid.
The debug package was temporarily disabled with `pm disable-user --user 0`
to make the remaining launcher icon unambiguous; its data was preserved.
It can be restored with `adb shell pm enable com.math3d.mobile`.
With only the internal app enabled, the owner confirmed the requested
cable-free close/reopen check: “ok, catenoid after reload.” The exact APK's
Samsung baseline [device signoff](mobile-device-signoff.json) is now approved.
This confirms standalone workspace restoration; it does not claim the wider
Graph gesture/undo, accessibility or performance matrix was performed.

## Production AAB verification

[Verification-only run 36747275965](https://github.com/expert10000/Math3D/actions/runs/36747275965)
passed on clean source `9b7dae5914e47063c2fdbe3b0c9c7e42bcb706fb`.
Only documentation/signoff changed since the approved internal build; the
runtime source is unchanged. The run passed the exact-APK device-signoff
gate and built `com.math3d.mobile`, version `1.6.0`, build `150008`.

- AAB SHA-256: `50688ab4078a236c0e088f8067b2e6c72860851c4af2e7ef8a1d34e9470910d7`.
- Certificate SHA-256: `66a86e95eaf60f8d2224dd06ad5ef4eec6c856ca2b5e32dc954384bc6ad41be3`, matching the existing production upload key.
- Downloaded bytes match both `SHA256SUMS` and clean build metadata. Local
  `jarsigner` verification and `keytool` certificate comparison also passed.
- AAB, CI reports and local verification are in
  `output/mobile-160-production-36747275965/`.

The workflow was dispatched with no `release_tag`; its publish job was skipped.
This artifact is a verified candidate, not a public release or a replacement
for the wider physical-device/Graph-specific acceptance matrix.

## Remaining gates

1. Complete the full [MOB-G13 physical matrix](mobile-graphs-g11-g13-acceptance.md)
   and professional feature cases in [G2D40](graph2d-g40-professional-acceptance.md),
   including the missing device classes and screen-reader/rotation/performance
   evidence. Focused Samsung TalkBack and capture/share checks are documented
   in [GGL14–17 evidence](graph2d-gallery-ggl14-ggl17-showcase.md); they do not
   close that matrix.
2. After those physical acceptance gates pass, review release scope and
   artifacts, then create/publish a `v1.6.0` release
   and invoke that workflow with the matching existing tag. A verification-only
   AAB or internal APK is not a public release. Do not waive the signoff gate
   or attach an unverified AAB.
