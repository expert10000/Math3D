# Math3D Professional Volume v1 workflow freeze

Status: frozen for the Volume v1 release gate. The freeze commit is the Git revision containing this document.

## Canonical workflow

Volume owns analytic scalar fields, custom fields, dense scalar/vector grids, distance fields, masks, and label maps. Every active dataset has a stable Volume identity, definition revision, sampled-grid revision, spatial metadata, managed storage reference, and provenance dependencies. Derived arrays remain in the typed-array store; workspace JSON contains recipes and explicit artifact references only.

The supported journey is:

1. Select **Volume** in the top workspace navigation.
2. Choose an analytic preset, enter a custom field, import a scientific grid, or sample a Surface/Mesh/Geometry source as occupancy or distance.
3. Apply dimensions, bounds, centering, interpolation, and boundary policy in the left Volume controls.
4. Inspect linked XY/XZ/YZ slices and the spatial 3-D pane. Pin probes from **Inspector → Slice**.
5. Choose slice, isosurface, MIP, MinIP, average, or DVR in **Inspector → Rendering**.
6. Run statistics/derivatives in **Analysis**, create masks and labels in **Masks & Labels**, or capture A and compare against B in **Compare**.
7. Apply an isosurface in **Derived Surfaces**, then send its provenance-linked snapshot to Mesh, Geometry, or Mesh Analysis.
8. Import/export RAW+JSON, NPY+JSON, or VTI in **Import / Export**. Save compact session state and use revision-aware undo/redo in **History**.

## UI location guide

| Capability | Location |
| --- | --- |
| Presets, custom fields, parameters | Left panel → Volume detailed controls |
| Grid dimensions, bounds, centering, resampling | Left panel → Sampling |
| Quad/Slices/3D/XY/XZ/YZ layouts | Left panel → View |
| Crosshair, orientation, probes | Right Inspector → Slice |
| Transfer function, window, quality, backend status | Right Inspector → Rendering |
| Iso threshold and extraction | Right Inspector → Derived Surfaces |
| Occupancy, signed distance, Boolean/offset operations | Right Inspector → SDF |
| Threshold for analysis regions | Right Inspector → Analysis → Region threshold |
| Threshold for masks/connected labels | Right Inspector → Masks & Labels → Threshold |
| Scientific files | Right Inspector → Import / Export |
| A/B alignment and differences | Right Inspector → Compare |
| Save/restore and revision history | Right Inspector → History |
| Replayable sample/slice/render/analyze/segment/compare/export recipes | Right panel → Workbook |

## Numerical and spatial conventions

- Index order is `x + nx * (y + ny * z)` and component layout is interleaved.
- Direction is a row-major index-to-world 3×3 matrix. Origin, spacing, direction, centering, coordinate system, position units, value units, scalar type, component count, and missing-value policy are canonical metadata.
- Scalar interpolation may be nearest or linear. Masks and labels always use nearest-neighbor interpolation.
- Non-finite values are reported and excluded from finite statistics. Empty and zero-range inputs remain explicit states.
- Comparison never aligns implicitly: exact grid, resample B→A, common target, or reject-incompatible must be selected. Categorical comparison is exact-grid only.
- Isosurface results record algorithm/version, backend, input transform, normals method, topology/area/volume metrics, memory profile, and source grid revision.

## Backend matrix

| Path | v1 status | Fallback and diagnostics |
| --- | --- | --- |
| Browser native worker | Primary for cancellable Volume jobs | Stale revisions are rejected; lifecycle/progress is visible |
| Reviewed CPU | Supported for sampling, analysis, segmentation, comparison, projection, and marching cubes | Memory plan may reject or request reduced dimensions |
| VTK worker/service | Optional capability-gated path | Missing endpoint falls back explicitly; never reported as VTK success |
| GPU/WebGL 3-D | Interactive spatial rendering | Shader/capability failure leaves slices and CPU results usable |
| Chunked/bricked contract | Planned execution contract, memory layout reviewed | v1 exposes memory guard and brick metadata; full out-of-core streaming is not claimed |

## Known limitations

- Imported multi-component metadata is preserved, but the current main viewer selects the first scalar component; arbitrary component selection is not yet exposed.
- RAW requires a JSON sidecar. NPY uses a JSON spatial sidecar because NPY itself does not carry Math3D direction/units semantics.
- VTI support targets deterministic ImageData scalar payloads; compressed/appended variants outside the staged parser report unsupported input.
- Label maps cannot be interpolated or compared across different grids.
- Optional VTK and GPU paths depend on runtime capabilities. The reviewed CPU path is the correctness baseline.
- Workspace restore does not embed dense imported bytes. Missing or moved artifacts require relinking by content hash before payload-dependent replay.
- The compatibility Volume controls remain until parity screenshots and downstream release review approve retirement.

## Troubleshooting

- **Threshold is not visible:** open the right **Inspector**, then choose **Analysis** for analysis-region threshold or **Masks & Labels** for segmentation threshold.
- **Import restores only the view:** open **History**, read the relink diagnostic, and select the original artifact with the matching content hash.
- **Compare is disabled:** capture Volume A, change or import Volume B, choose an explicit alignment policy, then run Compare.
- **Signed SDF is unavailable:** inspect SDF sign diagnostics; open or inconsistently oriented meshes intentionally degrade to unsigned distance/occupancy.
- **A job is rejected:** reduce dimensions or use the reviewed brick plan shown in Diagnostics; the memory guard rejects unsafe peak allocations before execution.
- **A derived result is stale:** regenerate against the current sampled-grid revision or detach the old result as a snapshot.

## Reproducible acceptance evidence

Implementation sequence: `7fce781`, `20bec9e`, `763e50b`, `30662c7`, `6643f0a`, `3cf4f5a`, `5d37564`, `a073537`, `615a433`, `d17ce13`, `0182128`, `1b767a0`, `8fcd52b`, `b1c13e7`, `9b41d1e`.

Reviewed baselines are stored in `docs/assets/screenshots/volume-v1`: desktop Gallery/Quad, 3-D Render, Analysis, Segmentation, Compare, and Derived Surfaces, plus tablet and phone workspaces. They are regenerated by the screenshot command below.

Run from the repository root:

```text
npm run test:volume:v1:unit
npm run typecheck:noemit
npm run build:core
npm run test:volume:v1:e2e
npm run test:app:responsive:smoke
npm run verify:volume:v1:backends
npm run profile:volume:v1
npm run capture:volume:v1:screenshots
npm run test:volume:v1:acceptance
```

The deterministic matrix and tolerances live in `renderer/src/volume/regression.ts` and its tests. Performance evidence records fixture, reviewed hardware class, backend, cold/warm cache, median, p95, peak working set, and pass/fail budget. Playwright failures retain traces, screenshots, and video under `test-results/playwright`.
