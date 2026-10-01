# Math3D 1.6.0 reusable test pack

Use the same files and expected results on desktop, web and future mobile
devices. Keep originals unchanged; open independent editable copies.
Fixtures are original Math3D examples, licensed GPL-3.0-or-later.

The 1.6.0 release scope is automated software acceptance plus the recorded
Samsung SM-A566B/Android 16 baseline. This pack does not assert that every
manual case passed. Other Android classes/tablets, iPhone/iPad, full spoken
screen-reader checks and measured device calibration are follow-up release
work. Do not mark a pending case passed without performing it.

## Start

1. Record app version/build, platform/device/OS, tester/date, exact artifact
   SHA-256 and source commit in a copy of `results.template.json`.
2. Optionally run `node verify.mjs` after extraction to check file integrity.
   This needs Node.js but no installed packages. Developers can additionally
   run `node scripts/graph2d-release-test-pack.mjs` from the repository for
   canonical import, CSV, numerical-reference and rejection checks.
3. Android: Projects → Graph Gallery → My Graphs → View local Graph file.
   Choose a `.graph.json`, inspect it, then Open independent editable Graph
   copy. Desktop/web: use the Gallery/My Graphs local-file import.
4. For data fixtures, create a temporary Graph point series and import the
   matching CSV through its data editor first; commit the valid rows. Then
   import the Graph fixture. CSV stores the original rows separately from
   Graph JSON. Without the CSV, import must report a missing sidecar.
5. Use the built-in Catenoid example for the Surface restart case. No remote
   worker is required for the Graph fixtures or Catenoid.

## Fixture references

| File in fixtures/ | Expected result |
| --- | --- |
| line-comparison.graph.json | y=x and y=2*x+1; crossings at (-1,-1), second line y=1 at x=0. |
| reciprocal-pole.graph.json | Separate negative/positive branches; no line across the excluded interval [-0.125,0.125]. |
| circle-ellipse.graph.json | Unit circle and ellipse with x-radius 2, y-radius 1; equal scale preserves their shape. |
| polar-rose.graph.json | Three petals; signed radius is retained, angles in radians. |
| implicit-conics.graph.json | Unit circle and hyperbola x²-y²=1; numerical contours have approximation limits. |
| strict-disk.graph.json | Disk interior filled; strict boundary excluded and dashed. |
| piecewise-data-gaps.graph.json + gaps.csv | Piecewise jump at x=0; missing measured row at x=0 remains a gap. Five original rows, one missing y. |
| wave-beats-interactive.graph.json | f=4.5 by default; f controls the second frequency. Preview/cancel does not change saved source. |
| regression-reference.graph.json + regression.csv | Eight rows. Linear fitted y=2*x+1, SSE=0.32 within numerical tolerance. Residuals ±0.2; prediction limits wider than mean-response limits. Coefficients shown in a centered/scaled basis need conversion before comparing slope/intercept. |
| reject-future-version.graph.json | Import rejects the unsupported version and preserves the current project. This is deliberately invalid. |

## Repeatable walkthrough

| Case | Actions | Expected outcome / evidence |
| --- | --- | --- |
| TP01 editing | Open Two slopes. Change x to 5*x, apply, undo, redo. Enter an invalid expression. | Valid edit changes the plot; undo/redo restores each source. Invalid draft has a readable error and does not replace valid source. Capture definitions and error. |
| TP02 gestures | Pan, pinch around a visible point, interrupt a gesture by resizing/rotating; undo after a completed gesture. | Focal point remains stable; a gesture makes one undoable view command. Interrupted resize does not commit an obsolete transform. Record a short video. |
| TP03 probes | Probe explicit, parametric, polar, contour and data fixtures; repeat taps on overlap, then tap empty space. | Appropriate coordinates/parameter/original data row appear; overlap cycles; empty tap clears. Record displayed readouts. |
| TP04 analysis | On Two slopes select the intended pair and find the crossing. On a parabola request a tangent; edit its source afterward. | Crossing near (-1,-1); tangent at x=1 on x² has slope 2. Old source-linked results become stale after edits. |
| TP05 persistence | Save the edited Graph, close/reopen, reopen from Projects; then Explore → Catenoid, close/reopen again. | Saved Graph retains definitions and data. Unsaved Catenoid remains the current workspace after switching from a saved Graph. Record both restarts. |
| TP06 lifecycle | Start sampling/animation, background the app, resume. | No stale publication or uncontrolled retry; responsive preview/refinement recovery. Saved source remains intact. Record logs. |
| TP07 rotation/layout | Switch portrait/landscape with a draft and selection. On a tablet also switch tool panels and narrow the window. | Draft/selection retained, keyboard avoids controls, usable plot/tools; split pane only when measured space permits. |
| TP08 import/share | Import valid fixtures and CSVs, cancel a picker, share/export and reopen an independent copy. Try the invalid fixture and data fixture before its CSV. | Cancellation/rejection preserves current work. Missing data is diagnosed. Valid source and original rows survive transfer. |
| TP09 accessibility | Use keyboard where available, large text and TalkBack/VoiceOver/NVDA as appropriate; navigate Gallery, tools, errors and residual tables. | Named controls, sensible focus order/restoration, readable validation and table headers; no automatic animation. Record what was actually spoken. |
| TP10 workloads | Repeat a fixed fixture workload at least ten times; test reduced workload, background and cold recovery. | Record sampling/next-frame p95 and peak serialized sample/table bytes with fixture/device identity. Review calibration; do not invent a GPU-frame measurement. |
| TP11 publication | Export SVG/PNG/CSV/HTML. Open HTML offline and print preview; check presentation exit and capture recipe. | Authored geometry/provenance retained, labelled tables, no network dependency; incomplete/external-data caveats visible. |
| TP12 scales | Test linear/equal/log10 axes and continuation on explicit functions. | Positive log bounds required, non-positive values excluded, equal scale only for linear axes. Continuation is viewport-only and excluded from analysis/probes/publication. |
| TP13 parameters | Play Beating waves animation, stop/cancel; then apply one value and undo. | No autoplay. Cancel preserves f=4.5; apply makes one source change and undo restores it. |
| TP14 regression | Import regression CSV then Graph, fit linear, inspect residuals/intervals, edit data afterward. | Eight original rows, reference fit/SSE above, assumptions and interval distinction visible; old fit becomes stale. |
| TP15 crash review | Review scoped native/JS logs across the walkthrough. | No attributable fatal native/JS errors. Preserve log window and any warnings with observations. |

Copy results for each device; attach evidence paths and observations. A screenshot
alone does not prove gesture semantics or performance. For the later full
MOB-G13/G2D40 freeze, transfer completed observations into the repository's
`docs/mobile-graph-device-evidence.template.json` and run its strict gate with
the exact Android/iOS artifacts. This simpler pack record does not replace it.
