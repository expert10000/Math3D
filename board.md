# Major Release Board

Scope pillars: `trust`, `workflow speed`, `depth`

## P0 (must ship)

1. Unified `Analysis Workspace` with saved runs, parameter snapshots, and reproducible results.
2. Full `Geometry Viewer parity` controls everywhere (coordinates, planes, labels, axes, presets, reset behavior). ✅ DONE (2026-05-17)
3. `Topology + Diagnostics` expansion: genus/boundary/components/non-manifold checks in one panel.
4. `Mesh Quality Report` module: min/avg/max metrics, highlighted defects, export to JSON/CSV.
5. `Performance pass`: worker offloading, cancellation tokens, progressive compute UI, cached recompute. ✅ DONE (2026-05-18)
6. `Project format v2`: versioned save files with migration so old projects open safely. ✅ DONE (2026-05-18)

### P0.1 Execution Board: Unified Analysis Workspace

Status: `done` (2026-05-18)

- [x] ✅ Persist per-compute saved runs in workbook model (`runHistory` with timing/logs/status/cache metadata).
- [x] ✅ Persist parameter snapshots per run (`params`) and exact upstream references (`inputRefs` + `inputHash`).
- [x] ✅ Persist viewer snapshot per run (`viewSnapshot`) for reproducible camera/dataset state.
- [x] ✅ Migrate legacy `lastRun` data into new saved-run history on load.
- [x] ✅ Expose run-history UI in analysis compute boxes (collapsible "Saved runs", timestamp/status/cache/duration).
- [x] ✅ Add `Replay run` action restoring snapshot + params then re-executing operator.
- [x] ✅ Add workspace summary metadata (`runCount`, `latestRunAt`) for analysis overlays.
- [x] ✅ Add deterministic reference-scene replay test for saved-run reproducibility.
- [x] ✅ Add export/import validation test ensuring saved runs survive `.math3d` roundtrip.

### P0.2 Execution Board: Geometry Viewer Parity

Status: `done` (2026-05-18)

- [x] ✅ Add parity controls to full-workbook Live preview (`Wireframe`, `Coordinates`, `XY/XZ/YZ`, `Major/Minor`, `Labels/Axes`, presets, fit/reset, include helpers).
- [x] ✅ Align remaining viewer surfaces (if any) to the same parity control contract and behavior.
- [x] ✅ Add smoke test coverage for reset/preset/fit parity in both compact and full workbook viewer layouts.

Final UX sweep (2026-05-17):
- [x] ✅ Verified parity controls visible and consistent in main Geometry viewer toolbar.
- [x] ✅ Verified parity controls available in full workbook Live preview (boxed/toggleable).
- [x] ✅ Verified parity controls available in compact workbook layout (boxed/toggleable).
- [x] ✅ Verified camera actions (`3D`, `Planar`, `Fit scene/stage/claim`, `Reset camera`) covered in smoke flow.
- [x] ✅ `npm --prefix renderer run build` passing after parity merge.
- [x] ✅ `npm run test:app:geometry:smoke` passing with new compact/full parity markers.

### P0.3 Execution Board: Topology + Diagnostics Expansion

Status: `done` (2026-05-17)

- [x] Add unified diagnostics panel combining: orientability/genus, boundary components, connected components, and non-manifold flags.
- [x] Add explicit non-manifold detectors (edge incidence >2, vertex star disconnection, invalid boundary cycles) with row-level details.
  - [x] edge incidence >2 with per-edge incident-face details in diagnostics panel
  - [x] vertex star disconnection detector
  - [x] invalid boundary-cycle detector
- [x] Add one-click jump/highlight from diagnostics row to corresponding topology entities in the viewer/editor.
- [x] Add export action for topology diagnostics report (`JSON` + `CSV`).
- [x] Add regression tests for canonical presets (sphere/torus/projective/klein/mobius/cylinder/cone) and non-manifold fixtures.

Implemented in this pass (P0.3):
1. Add diagnostic row actions (`Focus edge`, `Focus vertex`, `Focus face`) and wire them to existing topology selection/highlight state.
2. Add persistent highlight style for focused diagnostic entities in 2D/3D views so jumps are visually obvious.
3. Add export button for unified diagnostics payload (`JSON`) plus flat table export (`CSV`).
4. Add one regression test file covering:
   - canonical preset invariant sanity checks
   - one non-manifold fixture triggering `edge incidence >2`
   - one fixture triggering vertex-star disconnection and invalid boundary-cycle flags
5. Update P0.3 checklist status based on the above and rerun renderer build/tests.

### P0.4 Execution Board: Mesh Quality Report Module

Status: `done` (2026-05-17)

- [x] Add mesh quality report compute module with min/avg/max metrics:
  edge length, triangle area, aspect ratio, vertex valence, dihedral angle.
- [x] Add topology counters in report:
  boundary edges, non-manifold edges, degenerate faces.
- [x] Add defect extraction with bounded listings:
  degenerate faces, high-aspect faces, non-manifold edges.
- [x] Add in-view defect highlighting controls in Surfaces analysis panel.
- [x] Add mesh quality export actions for report payload (`JSON`) and flattened table (`CSV`).
- [x] Add regression tests for manifold baseline, non-manifold edge, and degenerate/high-aspect fixtures.
- [x] Verify with `npm --prefix renderer run test -- src/mesh/meshQualityReport.test.ts`.
- [x] Verify with `npm --prefix renderer run build`.

### P0.5 Execution Board: Performance Pass

Status: `done` (2026-05-18)

- [x] Offload mesh-quality analysis compute from main renderer thread into a dedicated web worker.
- [x] Add cancellation-token behavior for mesh-quality runs: newer runs cancel/replace in-flight runs; UI `Cancel` stops current worker job.
- [x] Add progressive compute UI for mesh-quality report with phase + percentage (`faces`, `edges`, `finalize`).
- [x] Add cached recompute for mesh-quality results keyed by mesh identity + options (threshold/max-listed defects), with LRU cap.
- [x] Keep existing report/export/highlight behavior unchanged while worker path is active.
- [x] Verify with `npm --prefix renderer run build`.
- [x] Verify with `npm run test:app:geometry:smoke`.

### P0.6 Execution Board: Project Format v2

Status: `done` (2026-05-18)

- [x] Introduce explicit `math3d-project` file envelope with schema `version: 2`.
- [x] Keep `.math3d` extension and include `assetMode` + `payload` in v2 envelope.
- [x] Add migration-aware parser supporting:
  - v2 project envelopes
  - legacy v1 `math3d-bundle` envelopes
  - legacy wrapped payload objects (`{ payload: ... }`)
  - legacy raw payload forms (`{ workbooks: ... }` and bare workbook arrays)
- [x] Route import/open workflow through the migration parser before applying payload.
- [x] Update save/export workflow to emit v2 envelopes.
- [x] Add project-format unit tests covering v2 build and legacy parse/migration cases.
- [x] Verify with `npm --prefix renderer run test -- src/workbook/projectFormat.test.ts`.
- [x] Verify with `npm --prefix renderer run build`.

## P1 (strong release upgrades)

1. `Geodesics suite`: multi-source paths, constrained geodesics, disk comparison (heat vs dijkstra), error bounds.
2. `Surface chart tooling`: editable chart cells, seam visualization, invalid-cell diagnostics.
3. `Analysis pipeline boxes`: reorderable, toggleable, selectable steps with per-step status.
4. `Command palette` + keyboard-first workflow for power users.
5. `Export system`: screenshots, animations, analysis tables, and session bundle.

## P2 (post-release or stretch)

1. Plugin-style `analysis operators` API.
2. Collaborative/session sharing mode.
3. Built-in benchmark scenes and solver performance dashboard.

## Release Gates (non-negotiable)

1. Deterministic compute on reference scenes.
2. Crash-free long session test (2h+ with heavy recompute).
3. Performance budgets documented and enforced.
4. Migration tests for old project files.
5. UX acceptance checklist for each viewer tab.
