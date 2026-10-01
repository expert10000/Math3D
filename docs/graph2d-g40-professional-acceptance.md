# G2D40 — professional software freeze and release gate

2026-09-29. **Software acceptance implemented; physical release signoff pending.** This milestone brings G2D36 publication, G2D37 scales/continuation, G2D38 parameters/animation, G2D39 regression and GGL10 editable interactive copies into one repeatable gate.

## Frozen contracts

- Original source, authored domain, data checksum and Gallery semantics remain authoritative. Optional lighter dotted continuation is viewport-only, explicit-function-only and excluded from probes, analyses, Fit and publication geometry. It never silently widens the authored range.
- Linear/log10/free/equal policies have shared projection, ticks, focal pan/zoom, validation, persisted capability intent and portable round-trip checks. Equal world units require two linear axes; log bounds must be positive. Non-positive endpoints/probes are omitted, never emitted as NaN drawing coordinates.
- Parameter scrubs and animation are transient until an explicit apply command. Existing automated checks include cancellation, deterministic frames, undo, saved-source preservation and uninterrupted retained geometry during resampling.
- Linear/quadratic regression uses original checked rows, reviewed QR models and explicit pointwise mean-response versus individual prediction assumptions. Stale results are not overlaid. Reports retain summaries, interval samples, bounded residuals, row IDs and checksum; images preserve authored geometry rather than transient fit overlays.
- `tests/fixtures/graph2dProfessionalExports.json` freezes eight SHA-256 digests: SVG/PNG/CSV/HTML for reviewed linear/log display fixtures with a fixed regression envelope. Only fixture elapsed timing is normalized to zero; real reports retain measured provenance. Future digest updates require reviewing the semantic change, not blindly regenerating expectations.

## Automated accessibility and publication coverage

Keyboard tests use actual named controls: Enter opens Scales, focus enters the first selector, Tab reaches the next, Escape closes and restores the opener. Existing Gallery/Parameters/Export keyboard tests remain in the combined suite. Residuals have a caption, column headers and original-ID row headers; native controls retain existing labelled 44px touch targets.

Forced-color mode uses system colors while preserving solid/dashed/dotted line distinctions and textual legends. Toolbar controls wrap within the plot on compact layouts. Browser evidence includes reduced-motion/high-contrast and compact screenshots. These checks do **not** certify actual screen-reader output or every OS accessibility setting.

Browser exports open the actual downloaded report offline with no HTTP requests, labelled tables visible in print media. Electron exports the same frozen report twice with identical bytes and no saved-source mutation. All four output formats also have byte/digest checks. This is report reproducibility, not a claim that every physical printer produces identical pages.

## Reproduce software acceptance

`npm run test:graph2d:professional:acceptance`

The gate runs desktop/shared and native model tests, root/native/parity strict types, the locale/timezone numeric corpus, frozen Gallery previews, production desktop/web builds and the complete Graph Electron/browser suites. Android Hermes bundle export is checked separately; it is not an APK installation or signed-release/device acceptance.

The dedicated `Graph2D Professional Software Acceptance` Windows CI workflow runs this gate, public-license metadata verification and Android bundle compilation on relevant pushes/PRs. It uploads software evidence and does not generate physical signoff. Local results below do not imply the newly added remote CI run has finished.

Final local component checks after corrections:

- Desktop/shared: **247 tests**, 39 files. Native models/gate: **307 tests**, 55 files. All pass.
- Electron: **27/27**. Chromium: **30/30**, en-US/UTC and pl-PL/Auckland. The complete final browser rerun passes; earlier setup/measurement failures are not counted as acceptance.
- Root renderer/main/Electron-test types, mobile types and shared parity-test types: pass. Production desktop and web builds: pass (existing large-chunk warning only).
- Numerical corpus: 16 cases per timezone, identical digest `74b2dea28ada11fe283a234c278591e6c1ab51488bad6269d994a865917a90b2`. All 20 frozen Gallery SVG/PNG previews match, 235,087 compressed bytes.
- Android Hermes export: 879 modules, 6.15 MB bundle, `output/g40-native-bundle/`. This is compilation evidence, not installed/signed APK acceptance.
- Public GPL metadata check and Git whitespace check: pass. New workflow YAML parses successfully; remote CI completion is not asserted.

Visual QA inspected continuation/log plots, fit/limits, offline residual tables under print media, system-color plots and full-width compact layout. Software captures/reports are under `test-results/graph2d-web/professional-*` and `test-results/playwright/graph2d-professional-*`. The compact-layout fix removes a hidden sidebar's reserved column; controls and the continuation notice no longer overlap. The focal-point test independently reconstructs world coordinates from the actual dispatched mouse pixels and SVG viewBox, preserving its original seven-decimal tolerance rather than comparing a requested fractional cursor position Chromium did not dispatch.

## Fail-closed physical release checklist

**1.6.0 scope decision — September 30, 2026:** the owner chose to release the
checked test pack and current automated/Samsung baseline, deferring broader
devices and full professional physical acceptance to later releases. The
strict G2D40/MOB-G13 freeze below remains pending and unchanged; 1.6.0 does
not claim it passed. See [scoped release evidence](mobile-1.6.0-release-candidate.md).

The existing `mobile-graph-device-gate.mjs` now additionally requires `publication-offline-print`, `scales-continuation-log`, `parameters-animation-cancel` and `regression-residuals-intervals` on **every** physical Android/iOS phone/tablet slot. Existing G13 gesture, lifecycle, interchange, measured retention/calibration and accessibility cases still apply. All evidence must match committed runtime source and actual embedded signed release artifacts, not an emulator, Metro, a debug build or this document.

Run the existing release check with a completed evidence file and exact artifacts:

`node scripts/mobile-graph-device-gate.mjs evidence.json --android exact.apk --ios exact.ipa`

The committed evidence template intentionally stays pending. Synthetic unit records validate rejection rules only; they are not signoff. Tests verify that withholding any new professional feature blocks acceptance.

Pending before full professional release:

- Signed standalone Android/iOS builds from reviewed committed source; all physical G13 device slots and professional feature cases, including real pinch/focal zoom, background/rotation and measured budgets.
- Real NVDA/desktop-browser and TalkBack/VoiceOver walkthroughs: controls, residual/interval tables, assumptions, validation alerts, focus restoration and no autoplay. Record OS/browser/device/tester/artifact identities.
- Physical high-contrast and print/share/import checks; native regression line-budget behavior and non-positive log exclusions on representative large datasets.

No newly compiled installer/APK was installed by this work. Existing running copies require rebuilding/restarting to use the new features. No dependencies or licenses were changed; the public GPL metadata check passes.

Next product sequence (updated 2026-09-29): **G2D41 grid controls → G2D42 Tools palette → G2D43 on-graph elements → GGL11 personal collections**, while outstanding physical release validation proceeds when devices and artifacts are available. See the [canonical roadmap](math3d-graph2d-desktop-mobile-roadmap.md).
