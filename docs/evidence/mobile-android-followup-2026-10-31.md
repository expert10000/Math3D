# Samsung Android follow-up — 2026-10-31

This run follows the [initial Samsung session](mobile-android-session-2026-10-31.md).
The physical device was Samsung SM-A566B, Android 16, ADB serial
`RZCY71087BY`. The original internal signing key was still unavailable, so
only the independent `com.math3d.mobile.notesverification` app was updated.
The existing internal and release apps were not changed.

## Tested artifact and software gates

- HEAD: `3c960e5d3f067a18c5750557a12ff257862b1fcc` plus local worktree
  changes. The worktree is not a clean-source attestation.
- Comprehensive-device-test APK: `output/mobile-android-followup-20261031/Math3D-1.6.0-notescheck-compact-final.apk`.
  SHA-256: `332a61f961fe17e334da5e8725dd1439d6b924b72c25f7c7ead7e963fecfcd94`.
  Package version `1.6.0-notescheck`, code `150008`.
- Latest installed APK: `output/mobile-android-followup-20261031/Math3D-1.6.0-notescheck-keyboard-guard.apk`.
  SHA-256: `1989384909fb1008282e773abb8cfa875deebc80a605976d80f547df5d06d3c8`.
  It adds a physical-screen-orientation guard so an open portrait keyboard cannot
  trigger the short-landscape layout. It was installed with `adb install -r` and
  smoke-checked by cold starting the saved Beating waves Graph, opening Beating
  waves from Home, and rotating to landscape. The broader device readings below
  were collected on the preceding APK.
- `adb install -r` succeeded and kept the isolated app's saved data. Android
  APK Signature Scheme v2 verification passed with one existing debug signer,
  certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Mobile TypeScript and 417 mobile unit tests in 70 files passed. The new
  breakpoint test checks short landscape, portrait, tablet and enlarged text.
  `git diff --check` passed (Git only warned about an existing line-ending
  conversion in the Gallery preview manifest).

## Physical-device results

| Area | Observation |
| --- | --- |
| Short landscape Graph | The compact Graph view removed the extra toolbar row and reserved less status height. Two slopes had a 529-physical-pixel plot rather than the previous 234-pixel Circular flow plot. Circular flow also settled to a 529-pixel plot with its orbit and arrows visible. The fixed title row keeps Gallery, Display and More; Fit actions remain under More. |
| Landscape tools | Analyze and Functions occupied the full graph workspace as scrollable panels rather than overlaying the plot. Circular flow's equilibrium explanation and initial-point controls were reachable by scrolling. The panel uses the Graph tab to return to the plot. |
| Draft and selection during rotation | An unsaved `x+` draft and the selected Unit slope survived portrait-to-landscape rotation. Fit selection remained enabled. Cancel discarded the draft and retained the committed `4*x` source. |
| Large text | At system font scale 1.3, the short-landscape plot remained 512 physical pixels high and Analyze scrolled to its controls. System font scale and auto-rotate were restored to `1.0` and `accelerometer_rotation=1`, `user_rotation=0`. |
| Native transfer | The desktop return handoff was pushed to Android Download and imported through **Graph project file** as editable `Two slopes import 1`; its first expression was `5*x`. The generic **Math3D project** path saved the same file as a mixed-project preview and kept the current editor. The invalid future-version Graph was rejected with `Invalid Graph2D schema version`, preserving the imported `5*x` Graph. Canceling a later picker reported `Graph import cancelled.` |
| Pan and undo on comprehensive-test APK | An ADB single-pointer drag panned the imported graph. More → Undo restored the original viewport; Redo became available. Physical two-finger pinch was not performed on that APK. |
| Owner gesture check on latest APK | On Beating waves, the owner confirmed that two-finger pinch zoomed smoothly and More → Undo restored the prior view. Focal-point stability, interrupted-gesture semantics and a video remain unverified. |
| Sampling workload | Ten repeated **Resume adaptive workload** generations on the saved imported Two slopes fixture at the mid/refine profile gave nearest-rank p95 sampling 9.8 ms and next-frame delivery 11.8 ms. Peak retained serialized artifacts were 6,405 bytes. No point-series source was present, so the point-table cache for this fixture was zero. The low 512-sample profile appeared after **Reduce workload** and the mid 1024-sample profile returned on Resume. A 10-second background interval and force-stop/relaunch both returned to the saved Graph. These are JS sampling/next-frame delivery readings, not GPU frame times or thermal certification. |
| Graph opening | The owner reported one apparent hang while opening a Graph, then reported that Beating waves responded to a single-finger drag after a restart. The latest APK opened that featured Graph from Home on our retry; the first UI check, including a slow UI-tree dump, completed in 7.3 seconds. This does not establish the cause or rule out an intermittent stall. |
| Scoped logs | The comprehensive-test app process log had 582 lines and no filtered fatal exception, AndroidRuntime, React Native JS error, ANR or fatal-signal match. The latest APK process log had 221 lines and no such match after the launch/rotation smoke test. The reported hang was not accompanied by a matching log entry. |

The initial landscape failure is resolved for this Samsung phone at normal and
1.3 font scale. Circular flow still reports `Approximate/incomplete display`
at the current sampling budget; the layout fix does not change that numerical
status. The reported intermittent Graph-opening stall needs a repeatable case
and diagnosis before release signoff. The `results.samsung.json` copy of the
1.6.0 test-pack record refers to the comprehensive-test APK and keeps cases
with unperformed steps pending.

## Still needed for mobile release signoff

- Focal-point stability during pinch, interrupted-gesture semantics and spoken
  TalkBack output on this phone. The owner confirmed pinch zoom and Undo, but
  cannot test TalkBack now. Accessibility labels and scrolling were inspected;
  spoken output was not attested.
- Full Graph fixture/CSV, publication format and long workload matrix. The
  fixed ten-run sampling workload is one fixture and one device profile.
- Another Android class, Android tablet, iPhone and iPad. Only the Samsung was
  attached in this session.
- The original internal signing key/configuration, which the owner said is
  unavailable now; this run cannot certify the internal or release package.

Build, signature, screenshots, ten raw readings, structured results and scoped
logcat are under `output/mobile-android-followup-20261031/` and are not committed.
The structured Samsung results are also copied to
[mobile-android-followup-2026-10-31.results.json](mobile-android-followup-2026-10-31.results.json)
beside this report.

## Resume the mobile acceptance work

The [mobile roadmap](../mobile-roadmap.md), [canonical Graph roadmap](../math3d-graph2d-desktop-mobile-roadmap.md)
and [1.6.0 test pack](../test-packs/1.6.0/README.md) define the wider scope.
This Samsung record has **TP10 and TP15 passed, 13 cases pending**; partial
observations in a pending case are not a complete pass. The comprehensive
record identifies APK SHA-256 `332a61f9…`, while the later installed keyboard
guard APK is `19893849…`. Keep those evidence sets separate when adding results.

1. **Diagnose the Graph-opening stall.** On the installed Notes Check APK,
   repeat Home → featured Beating waves → Open Graph and Projects → saved Graph.
   Record the entry path, elapsed time, CPU, screenshot/video, and scoped logcat
   when a stall occurs. The single reported hang recovered after restart and was
   not reproduced on the later APK; no cause has been established.
2. **Finish Samsung cases.** Record focal-point behavior and an interrupted
   pinch/rotation for TP02; portrait keyboard use for TP07; spoken TalkBack
   focus, controls and an invalid-expression error for TP09 when the owner can
   test it. Complete the remaining fixture, analysis, persistence, import/CSV,
   publication, scale, parameter and regression steps in the test pack. Do not
   infer a full case pass from the focused checks above.
3. **Expand the physical matrix.** Run the same pack on another Android phone
   class and Android tablet, then iPhone/iPad when available. Record exact
   artifact hash, OS, device, tester and evidence in a separate result file for
   each device. Calibrate long workloads on the measured hardware.
4. **Revisit internal signing.** The original internal signing configuration
   was unavailable on this PC. Until it is restored, build and test only the
   independent `com.math3d.mobile.notesverification` package; its debug
   signature cannot certify the internal or release package.

For the current source, the fast software gates are
`npm --prefix apps/mobile run typecheck` and
`npm run test:graph2d:mobile:unit`. The Notes Check Gradle init script is
`scripts/mobile-notes-verification.init.gradle`; the APK, raw logs and
screenshots are local under `output/mobile-android-followup-20261031/`.
Preserve those untracked artifacts before cleaning the worktree. The worktree
contains unrelated pre-existing changes, so inspect the diff before committing
or rebuilding a release artifact.
