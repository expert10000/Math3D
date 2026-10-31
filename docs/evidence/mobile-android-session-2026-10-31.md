# Samsung Android acceptance session — 2026-10-31

The short-landscape layout failure documented below was addressed and retested
in the [follow-up Samsung session](mobile-android-followup-2026-10-31.md).

This is a focused physical-device run, not a release or MOB-G13 signoff. The
Samsung SM-A566B ran Android 16. ADB serial was `RZCY71087BY`. The original
internal signing configuration was unavailable, so the installed internal and
release apps were left untouched. The standalone, debug-key-signed
`com.math3d.mobile.notesverification` package was updated in place, preserving
its data. The owner confirmed the internal key is not available for this session.

## Final tested build

- Source HEAD: `3c960e5d3f067a18c5750557a12ff257862b1fcc`, plus the two mobile
  source changes in this session. The worktree had unrelated pre-existing tracked
  changes; this is not a clean-source attestation.
- Package: `com.math3d.mobile.notesverification`, version `1.6.0-notescheck`,
  build `150008`; embedded JS bundle present.
- Final APK: `output/mobile-android-session-20261031/Math3D-1.6.0-notescheck-final.apk`,
  SHA-256 `59530a26ce9e12cb375c03ba8b410d6c33b8c08215bd8c85410b3051ca0e4dff`.
- Android APK signature verification passed with one debug signer, certificate
  SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
  `adb install -r` succeeded. See the local `final-build.log` and APK.

## On-device results

| Area | Observation |
| --- | --- |
| Launch and navigation | Standalone launch rendered the saved Enneper surface. Home, Explore, Workspace, Projects and Settings opened. The original imported Notes project remained present. A 30-second Home/background interval resumed the Circular flow Graph with a visible plot. |
| Graph authoring | Created Line graph, probed `f` at `(2.99034, 2.99034)`, edited `y=x` to `y=x*x`, undid and redid the edit, saved, force-stopped and reopened; `y=x*x` persisted. An invalid `x+` draft reported a parse error, and Cancel retained the saved `y=x*x`. |
| Graph Gallery and analysis | Opened Circular flow from Gallery as an editable copy. The Analyze panel showed one initial point and explicit backward/forward numerical stop reasons. Its equilibrium scan reported no equilibrium resolved at the sampled grid resolution; this is a bounded result, not proof of absence. |
| Gallery native return | Opened Two slopes from Gallery, changed Unit slope to `4*x`, saved, and exported a 2,756-byte mobile handoff. The desktop/mobile return test passed with checked project ancestry. SHA-256 of the physical export: `6396a6e3b74a0bcf1e9e6ae3012fa1cb3da2cc809383f2c498c58733018c349e`. |
| Native transport | Saved an 8,182-byte Circular flow capture recipe through Android's folder picker, then pulled and parsed the JSON. SHA-256: `9b81ea9be0c75538ef209813535b373feb62aecf2c4f204a91cf20f08c883b12`. The Android share sheet opened with Gmail, Quick Share and Bluetooth targets; no external delivery was attempted. |
| Expression 3D field | Imported a single-document Project. Verified/rendered 512 of 512 arrows. The first frame readout was 137 ms on the earlier build; camera button, reset and drag changed the reported orbit. |
| Scientific 3D field | Imported a Project pinned to the five-file `vortex-volume.sscene` fixture. The original folder rendered 125 of 125 arrows with one stationary sample. The final build measured 1,364 ms from folder selection through verification and first frame; this is one observation, not a percentile. A one-byte change in `up.f64` withheld all arrows with a changed-resource message. Reselecting the original folder restored them. |
| Logs | Final app process logcat had 1,234 lines and no scoped `FATAL EXCEPTION`, `AndroidRuntime`, React Native JS error, ANR or fatal-signal match. |

The scientific bundle initially failed on this device because the reader joined
`bundle.json` to a SAF tree URI. It now lists the selected folder and opens the
provider's child URI. The first-frame timer now begins after folder selection
for scientific bundles, so human picker time is excluded. Earlier warm source
verification/render reads were 2,049 and 2,031 ms; the final build's first
read was 1,364 ms.

## Acceptance still open

- **Short landscape phone layout failed usability review.** With Circular flow
  and Analyze open, the plot was squeezed to 234 physical pixels and its arrows
  overlapped heavily; the Analyze panel was clipped. See local
  `output/mobile-android-session-20261031/graph-landscape.png`. Rotation was
  restored to auto-rotate (`accelerometer_rotation=1`, `user_rotation=0`).
- The mobile and named-Project software gates now pass after resolving Expo's
  duplicate package instances in Vite and bounding Project test workers and
  timeout: 416 mobile tests in 70 files, 234 Project tests in 45 files, 102
  native storage/transfer tests in 18 files, and fixture TypeScript. The new SAF
  folder-reader regression has two passing tests. Mobile and root TypeScript,
  version checks, the canonical 1.6.0 Graph fixture pack (nine Graphs, two CSV
  tables, seven kinds), the renderer production build, the 26 Gallery SVG/PNG
  preview check, and the physical Gallery native-return test passed. The pinned
  Playwright headless browser was installed and 18 stale PNG assets plus their
  manifest were regenerated for the current renderer. Earlier failed runs and
  final logs are retained locally. The combined
  `test:graph2d:gallery:mobile:acceptance` gate then passed end to end, including
  seven desktop Gallery tests and the physical-handoff return test.
- The original internal key is unavailable, so this build cannot update or
  certify `com.math3d.mobile.internal`. The full MOB-G13/G2D40 physical matrix
  also requires other Android tiers/tablet, iPhone/iPad, human pinch and spoken
  accessibility, native receiving, and measured workload recovery. This run
  does not mark any of those cases passed.

Local APKs, screenshots, fixtures, build logs, export and scoped logcat are in
`output/mobile-android-session-20261031/` and are not committed. The
`results.samsung.json` copy of the 1.6.0 test-pack template records TP07 as
failed, TP15 as passed for the scoped log, and all incomplete manual cases as
pending with partial observations where available.
