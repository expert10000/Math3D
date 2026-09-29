# G2D41 — shared grid display controls

2026-09-29. First implementation of the [grid/tools/canvas sequence](graph2d-grid-tools-canvas-roadmap.md). G2D42 Tools and G2D43 on-graph probes/parameter cards remain planned, not delivered.

## Delivered behavior

Desktop/web: **Graphs → Grid**. Keyboard Enter opens the panel, focus enters its first visibility switch, Escape cancels unapplied changes and restores Grid focus. Grid, X/Y axes and numeric labels are independent switches. Visibility, minor subdivisions, sparse/normal/dense Auto density, subtle/normal/strong contrast and independent X/Y manual spacing preview immediately when valid. Apply or Close saves them as one reversible display edit; Cancel/Escape discards unapplied changes. Invalid drafts explain the problem, retain the last valid preview and do not issue commands. Controls have 44px targets, scroll inside the panel and retain system forced-color rendering.

Native: **Graphs → Display → Grid settings**. Existing grid/axis/number visibility switches apply immediately; the advanced draft preserves those changes when applying spacing, subdivisions, density and contrast. Controls retain labelled native roles and 44-unit targets. Native Display remains scrollable/keyboard-aware.

The optional `display.axes.gridOptions` object has exact keys `minor`, `density`, `contrast`, `xStep`, `yStep` and requires `graph2d.grid.v1`. Blank spacing means Auto (`null`). Linear steps are finite positive world units from 1e-100 to 1e100; logarithmic steps are integer decades from 1 to 100. Polar grids require linear axes and Auto spacing. Changing scales/grid mode explains incompatible saved manual spacing; settings are not silently discarded.

Commands edit only display intent. Source, mathematical identity, authored domains, point data, parameters and analysis provenance remain unchanged; undo/redo, canonical save/reopen and desktop/native handoff retain settings. Older readers that do not support the capability fail closed. Absent options preserve legacy document bytes and frozen desktop/publication previews; this work does not regenerate fixtures.

## Bounded drawing and honest limits

Shared Cartesian projection caps major ticks at 200 per axis and minor output at 1000. A manual request with more than 199 intervals, less than 6 projected pixels per step, or an unsafe integer index suppresses that axis's grid lines and explains why numbers fall back to Auto. If even Auto tick indices are numerically unresolved, lines and numbers are omitted with guidance to widen the bounds. Subdivisions below 4 pixels or numerical resolution are omitted with a notice. Attempt-count guards prevent stalled integer increments at very large coordinate offsets. Log minor detail considers the whole legal range before pixel filtering, rather than drawing a left-hand prefix.

New polar policy shares bounded rings/rays between desktop, native and publication. Rings reflect actual world-to-screen aspect; they are not forced into circles on unequal axes. Each ring layer has a 64-ring budget and explains omissions. Native polar rings are clipped polylines with an explicit approximation notice; all native grid geometry shares a separate **512-line budget**, so grid detail cannot consume the existing curve budget. Device performance/visual acceptance remains pending.

Publication honors visibility, density, spacing, subdivisions and contrast for new options, and retains grid omission warnings in report metadata. Legacy publication output intentionally retains its previous grid rendering. SVG/PNG renderings are approximate, and native/publication tessellation is not pixel-identical to SVG ellipses.

## Initial G2D41 verification

- Desktop/shared unit tests: **264 passing**, 40 files, including 17 new grid-policy cases and unchanged frozen professional export digests.
- Native model/gate tests: **310 passing**, 56 files. Three new cases cover storage/handoff/history, shared projection/suppression and bounded polar drawing; the physical evidence gate also rejects a missing `grid-display-controls` case.
- Root/native/parity strict types pass; numerical parity retains digest `74b2dea28ada11fe283a234c278591e6c1ab51488bad6269d994a865917a90b2`. All 20 frozen Gallery SVG/PNG previews match (235,087 compressed bytes).
- Electron: **28/28**; Chromium: **34/34** across en-US/UTC and pl-PL/Auckland. New checks cover invalid drafts, saved source identity/spacing, undo/reopen, focus restoration, dense-grid notice, visibility and compact forced-color controls. The G41 Electron check also passes after rebuilding the final renderer; captured desktop/compact Grid panels were visually inspected.
- Production desktop/web builds pass (existing large-chunk warning only). `npm run test:graph2d:professional:acceptance` passes; final unit reruns include the two additional extreme-offset/full-log-range regression cases. The Android bundle was recompiled after those corrections. Remote CI completion is not implied by local acceptance.
- Android embedded Hermes bundle compilation passes (881 modules, approximately 6.18 MB), not a signed APK installation or physical acceptance. Public GPL compliance metadata is internally consistent; no dependency or license change.

## Desktop UX corrections — 2026-09-29

Dense selection now changes the displayed grid without requiring Apply. The preview is transient: a workspace save while Grid is open stores committed settings only. Close (including the Grid toolbar toggle or switching to another panel) saves the valid preview; Cancel/Escape discards it. Opening and closing an unchanged panel does not add a history entry. Replacing the owning document cancels its grid draft. Invalid fields cannot be committed; switching panels retains only the last valid preview.

Closing Grid preserves the selected function and Inspector. Escape with Grid open dismisses that panel even when focus is on the plot/toolbar, and repeating Escape on the toolbar does not clear selection. Plot clicks while display/parameter panels are open do not accidentally deselect the inspected object.

Grid, pins, selection and metadata are excluded from the curve-sampling key. Source ownership, curve style, sampling quality, viewport/size, data and execution policy still invalidate sampling. During pan/zoom, the Inspector retains same-source observations and diagnostics, explicitly marked **Updating — previous observation**. Retained samples are not used as current picking or analysis evidence, and Fit function waits for settled sampling. Stable scrollbar space, numeric formatting, reserved status/count row heights and disabled scroll anchoring prevent the pending worker from collapsing and shifting the right panel.

Correction acceptance:

- The two new browser regressions reproduced the original unchanged Dense grid and disappearing sampling observations before the fixes.
- Desktop/shared unit tests: **266 passing**, 41 files. Two new key tests prove display-only reuse and real-input invalidation. Renderer, parity and E2E strict type checks pass; production desktop/web builds pass.
- Chromium: **38/38** across en-US/UTC and pl-PL/Auckland. Checks cover immediate preview, committed-only saves, Close/Escape/selection preservation, zero new grid-triggered sampling workers and stable observations/scroll/bounds with delayed zoom workers.
- Electron: **28/28** in the final full run; the Grid check confirms immediate Dense rendering, reversible Apply and preserved Inspector selection. An existing Gallery test now waits for scheduled panel focus before sending Undo, removing the focus race seen in the first run (27 passed, 1 failed; isolated retry passed). All eight focused Chromium G41 checks also pass after the final test/type corrections. The final desktop Grid capture was visually inspected.
- Native code, schema and dependencies are unchanged by these corrections. The native test and bundle results above are the initial G2D41 baseline, not a fresh native deployment. Physical and real screen-reader acceptance remain pending.

The required `grid-display-controls` physical case covers spacing/visibility/contrast, validation, save/reopen/undo, pan/pinch with readability notices, polar approximation/budget behavior and accessibility on every Android/iOS phone/tablet slot. Exact signed artifacts, real screen readers, print and measured native workload remain pending. No installer/APK has been installed by this work.

Next implementation: **G2D42 — discoverable tools palette** using existing mathematical commands, then **G2D43 — labelled source-linked probes and compact parameter cards**.
