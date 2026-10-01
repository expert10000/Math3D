# Math3D 1.6.0 release evidence

Updated October 1, 2026. [Public release v1.6.0](https://github.com/expert10000/Math3D/releases/tag/v1.6.0)
is published within the owner-approved scope below; MOB-G13 remains pending.
Earlier candidate attempts are retained as history. The published `v1.5.1`/build `150007`
record remains in [its own release evidence](mobile-1.5.1-release-readiness.md).

## Signing and update identity

- The released Android version is `1.6.0`, build `150008`, application ID
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

## Owner-approved 1.6.0 release scope

On September 30 the owner chose to add the reusable test pack, check the
current software/Samsung baseline and release 1.6.0; broader device coverage
is deferred to later releases. The [pack](test-packs/1.6.0/README.md) contains
fixed importable examples, expected results, blank per-device records and
integrity checks. The release notes explicitly state the limited physical
coverage. MOB-G13/G2D40's strict full-device gate remains unchanged and pending;
this scoped release is not an attestation that it passed.

Publication required pack validation, the automated professional
acceptance suite, existing exact-APK Samsung/signing-backup gates, the
tagged internal build/emulator gate, desktop packaging checks and verified
production AAB. No runtime mobile change is needed for the test pack, so
the approved internal APK's source remains applicable.

### Test-pack and software check-up completed

Commit `91bdbec5e7d1c36636113696abdadb82789e300e` adds the pack and scoped
release notes. [Professional acceptance run 36751442767](https://github.com/expert10000/Math3D/actions/runs/36751442767)
passed the complete unit/type/parity/preview/build suite, **33 Electron** and
**50 browser** cases, pack validation and Android Hermes compilation.
The same commit also passed Android gate `36751442728`, Windows installer
smoke `36751442894`, Linux package smoke `36751442777`, build/worker smoke
`36751442674` and docs `36751442781`.

Pack validation covers nine Graphs/all seven kinds, two CSV sidecars,
independent linear-fit/SSE references, canonical parse/serialization and
unsupported-version rejection. All 16 committed pack files passed integrity
after extraction from a Git archive; a deliberately modified CSV was rejected.
LF checkout attributes keep the hashes identical on Windows/Linux. Blank
physical result records remain pending. Local reports are under
`output/release-test-pack/`; completed CI, rather than the interrupted local
end-to-end session, is the full automated-acceptance evidence.

## Tagged build and desktop packaging repair

Tag `v1.6.0` fixes app source at
`8e30e85190599467e3839e1b1e4b5b9bc708916f`. The tagged internal Android
build, signing checks and Android 16 emulator gate passed in
[run 36776893717](https://github.com/expert10000/Math3D/actions/runs/36776893717).
Windows packaging in that run failed while compiling pygalmesh because
the Eigen/CGAL development dependencies were absent; Linux packaging did
not run. This failure does not invalidate the completed app acceptance.

[Tagged production AAB run 36777024290](https://github.com/expert10000/Math3D/actions/runs/36777024290)
passed on the same clean tag source, with the existing production certificate.
Its `Math3D-mobile-1.6.0-release.aab` SHA-256 is
`5edfb36a85b87b788233e5504e68ca88154dbcddf5b0d800bdf82b90defdf928`.
Downloaded bytes match metadata and checksums; local jarsigner/keytool
verification passed. Evidence is in `output/mobile-160-tagged-aab-36777024290/`.
This is the tagged bundle selected for publication, superseding the earlier
verification-only AAB above.

Build recipe `a4115173ac5dbaa37447d388a2c9b6e18b3bfb8d` uses the existing
Windows CGAL bootstrap, pins vcpkg and frozen Python requirements, and retains
the required CGAL/pygalmesh release checks. A dispatched workflow applies
only an explicit list of build/compliance files to the app tag. Corresponding
source includes their complete patch, the exact build-recipe commit and
verified CGAL 6.2/Eigen/vcpkg source archives. A local tag checkout confirmed
the patch is reversible and app runtime files are unchanged.
[Packaging retry 36779845625](https://github.com/expert10000/Math3D/actions/runs/36779845625)
passed the repeated Android gate, pinned native setup (sphere generation,
three native CGAL booleans and geodesic verification), Windows installer build
and packaged worker protocol. Publication then stopped because `gmplib.org`
timed out while downloading corresponding source; Linux packaging was skipped.
Build logs are in `output/release-test-pack/windows-build-before-source-timeout.log`.

Recipe `fd0cef362250a63214df709200dc171a3aafe425` reuses build-source archives
only after SHA-256 verification, retries downloads and supplies official GNU
GMP/MPFR mirrors. A simulated unreachable primary URL successfully fell back
to GNU with the expected checksum. Windows and Linux source-bundle checks and
the reversible tag recipe patch passed locally. The workflow also saves its
native dependency cache and built packages before source downloads, preserving
work if an external source host fails again.
[Packaging retry 36786623422](https://github.com/expert10000/Math3D/actions/runs/36786623422)
passed the Android gate, Windows installer/worker checks and Linux startup,
geometry and package builds. Windows/Linux packages, web/docs, test pack and
corresponding source assets are published. The verified tagged production AAB
above was attached unchanged, together with its build/signature reports and
`SHA256SUMS`; this is GitHub distribution, not a Play Store rollout.

### Published-download check-up — October 1

- The downloaded test-pack ZIP passed its standalone checker for all 16 files.
  Its 15 manual case records remain blank/pending.
- All **40 entries** across the published Windows, Linux and Android checksum
  lists match GitHub's uploaded-asset SHA-256 digests. Linux replaced three
  shared Windows source/license assets with platform-generated equivalents;
  the Windows checksum list was reconciled after both jobs completed. The
  affected source ZIP and license files were also downloaded and hashed locally.
- Both source manifests identify app commit `8e30e85190599467e3839e1b1e4b5b9bc708916f`
  and build recipe `fd0cef362250a63214df709200dc171a3aafe425`.
  The published recipe patch passes `git apply --check` against the extracted
  published source archive. The app tag was not moved.
- The downloaded Windows portable ZIP matches SHA-256
  `f1560a0bf3206515a4cb3a54e2a011bba7a5c121fe34e736f65baf8b8bc27bd3`.
  Extracted outside the checkout, with system-only PATH and no external Python
  or Math3D paths, its frozen worker loaded all six bundled dependencies,
  generated a sphere (209 vertices/414 triangles), and used `native-cgal` for
  union/difference/intersection with independently checked volumes
  `1.35`/`0.35`/`0.65` (tolerance `1e-5`). Its bundled geodesic helper returned
  `sqrt(2)` on the flat-square reference (tolerance `1e-9`). Packaged desktop
  `package.json` reports `1.6.0`.
- Downloaded AAB metadata confirms clean tag source, package
  `com.math3d.mobile`, version `1.6.0`/build `150008` and the existing production
  certificate. No new mobile runtime change or Samsung retest was required.

Local downloaded assets, checksum comparison and portable-worker report are
under `output/release-test-pack/`. The prior automated acceptance and exact-APK
Samsung baseline above remain the scoped acceptance evidence. The full physical
matrix below is deferred, not marked passed.

## Deferred validation for subsequent releases

1. Complete the full [MOB-G13 physical matrix](mobile-graphs-g11-g13-acceptance.md)
   and professional feature cases in [G2D40](graph2d-g40-professional-acceptance.md),
   including the missing device classes and screen-reader/rotation/performance
   evidence. Focused Samsung TalkBack and capture/share checks are documented
   in [GGL14–17 evidence](graph2d-gallery-ggl14-ggl17-showcase.md); they do not
   close that matrix.
2. Expand independent user/device feedback and calibrate workload tiers from
   recorded measurements. Keep exact artifacts and reviewed runtime source
   linked to each future signoff. GGL18 remains conditional on measured need.
