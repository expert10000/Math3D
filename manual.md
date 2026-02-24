# Manual

## Workbook usage
1. Open the Workbook tab (right panel) and create or select a workbook.
2. Add blocks in the Define/Compute/Visualize/Explain stages as needed.
3. Interaction blocks: choose a mode (Pick point, Draw curve, Select region, Pick direction) and capture data on the surface.
4. Compute blocks: pick an operator and click Run to generate outputs; parameters can be added via the Parameters section.
5. Visualize blocks: capture the current view as a snapshot and jump back to it later; use A/B snapshots for compare mode.
6. Export or import workbooks as JSON from the Workbook panel.

## Differential operators (grad/div/laplacian)
1. Add a Compute block and choose `Grad (scalar → vector field)`, `Div (vector → scalar field)`, or `Laplacian (scalar → scalar field)`.
2. For `Grad`, pick a scalar field (defaults to `K`) and optionally set `Vector density` and `Vector scale`. Run to render downsampled tangent arrows (e.g. `K → grad(K)`).
3. For `Div`, either connect a vector output from an earlier Grad block or choose the `Vector field` param (defaults to `grad(K)`), then run to compute a scalar field.
4. For `Laplacian`, choose a scalar field (defaults to `K`) and run; this computes `div(grad(scalar))`.
5. When the surface samples match the mesh vertices, `Div` and `Laplacian` also enable a heatmap for the computed scalar field.

## Workbook reference (deep)

### Layout and navigation
1. Open the Workbook tab in the right panel. The header shows the current dataset, camera ready/pending state, and a Ghost overlays toggle.
2. Status shows overall workbook health: ok, stale, or failed. Use Run stage (Compute tab only) and Run all stale to refresh.
3. Use Clear workbook selection to drop selection overlays and return to normal selection behavior.
4. Use the stage chips to move through Define, Compute, Visualize, Explain / Check.
5. Use the Outline to jump to any block and Next stale/failed to cycle through blocks that need attention.

### Workbooks (create, rename, manage)
1. Click New to create a workbook.
2. Use the workbook selector to switch between workbooks.
3. Rename in the title input. Duplicate or Delete from the action buttons.
4. Workbook data is stored locally; export if you need to share or archive.

### Stages and intent
1. Define: problem statement, formulas, assumptions, and setup.
2. Compute: operator runs that generate overlays, fields, or measurements.
3. Visualize: snapshots, comparisons, and narrative notes tied to views.
4. Explain / Check: assertions, conclusions, and checks.

### Block types
1. Text: Markdown narrative.
2. Formula: LaTeX or formula text.
3. Visualize: snapshots (A/B), notes, diff panel.
4. Compute: operator runs with status and summary.
5. Interact: capture points, curves, regions, or directions from the viewer.
6. Assert: expected values and a pass/fail status.

### Interaction blocks (capture data)
1. Pick point: Arm pick, click a surface point. Outputs point, normal, tangents, and mesh metadata.
2. Draw curve: Arm pick and click to add points, then Finish curve. Outputs a polyline.
3. Select region: Arm pick, paint a region. Outputs a selection mask (sample indices).
4. Pick direction: Arm pick to capture a point, then set Direction angle with the slider.
5. Clear resets captured data and returns the interaction to idle.

### Compute blocks (operators and workflows)
1. Choose an operator, then Run operator. A quick hint appears for most operators.
2. Run from here recomputes this block and downstream Compute blocks in the current stage that are stale or failed.
3. Operators use the latest upstream outputs by type. Reorder blocks if the wrong upstream output is selected.
4. Compute blocks are tied to the current dataset and viewer kind. Switching surfaces can mark blocks stale.
5. Compute operators only target surface datasets. If you are in Volume mode, switch back to a surface mode first.

### Compute operator catalog (visible operators)
1. Point info + chart grid: reports local chart coordinates, tangents, and normal, and enables chart grid or wireframe.
2. Curvature field + principal directions: enables curvature coloring and principal direction glyphs.
3. Geodesic distance (heat): computes a heatmap from a seed point and an optional target and returns a shortest path.
4. Geodesic path: computes a shortest path between two picked points on the same mesh.
5. Curve overlay: renders the latest Draw curve output as a polyline overlay.
6. Direction overlay: draws a direction arrow from the latest Pick direction output.
7. Parallel transport (curve): transports a picked tangent direction along the latest Draw curve and renders vectors along it.
8. Selection overlay: visualizes the latest Select region output as a selection mask.
9. Grad (scalar -> vector field): computes a gradient field and draws tangent arrows.
10. Div (vector -> scalar field): computes divergence and stores a scalar field; enables heatmap when full vertex samples are available.
11. Laplacian (scalar -> scalar field): computes div(grad(scalar)) and stores a scalar field; enables heatmap when full vertex samples are available.
12. Principal directions: turns on principal direction glyphs.

### PR3 — First 3 “killer” calculations (workbook suddenly feels real)

A) Point Info + Chart Grid

- Input: PickPoint
- Output: chart coords, tangent basis, normal, metric summary
- Render: tangent frame glyph + optional iso-grid (polylines)

B) Curvature Field + Principal Directions

- Output fields: K, H, k1, k2, principal directions
- Render: heatmap + glyphs / short line field (downsampled)

C) Geodesic Distance (heat method)

- Input: one/many seed points
- Output: distance scalar field + optional extracted geodesic polylines to targets
- Render: heatmap + tubes (you already have polyline tubes)

Done when

- Workbook demo: PickPoint → GeodesicDistance → Visualize + Curvature(K) → Visualize.

Workbook steps

Point info + chart grid
1. Add an Interact block → Pick point.
2. Click Arm pick, then click the surface.
3. Add a Compute block → Point info + chart grid.
4. Click Run operator.

Curvature field + principal directions
1. Add a Compute block → Curvature field + principal directions.
2. Click Run operator.
3. Optional: add a Visualize block and Capture A.

Geodesic distance (heat)
1. Add an Interact block → Pick point and capture a seed point.
2. Optional: add a second Pick point if you want a target.
3. Add a Compute block → Geodesic distance (heat).
4. Click Run operator.

### PR4 — Field calculus v1 (grad/div/Laplacian) + vector field viz

- `grad(scalar)` → tangent vector field
- `div(vector)` → scalar field
- `laplacian(scalar)` → scalar field
- Render: arrows (downsample), later streamlines

Done when

- Example: `K → grad(K)` renders sensible tangent arrows.

Workbook steps

Grad (scalar → vector field)
1. Add a Compute block → Grad (scalar → vector field).
2. Optional: set Scalar field (defaults to K), Vector density, Vector scale.
3. Click Run operator to render tangent arrows.

Div (vector → scalar field)
1. Add a Compute block → Div (vector → scalar field).
2. Optional: set Vector field (defaults to grad(K)).
3. Click Run operator to compute the scalar field (heatmap appears when vertex-aligned).

Laplacian (scalar → scalar field)
1. Add a Compute block → Laplacian (scalar → scalar field).
2. Optional: set Scalar field (defaults to K).
3. Click Run operator to compute the scalar field (heatmap appears when vertex-aligned).

### PR5 — Interaction-to-math: DrawCurve → Parallel transport

- Interaction block: `DrawCurve` outputs polyline on surface
- Compute: `parallelTransport(curve, initialVec)` outputs vectors along curve
- Render: vectors along curve + optional “twist” visualization

Done when

- You can demonstrate holonomy / transport effects in a workbook.

Workbook steps

Parallel transport (curve)
1. Add an Interact block → Draw curve and capture a curve.
2. Optional: add an Interact block → Pick direction to set the initial vector.
3. Add a Compute block → Parallel transport (curve).
4. Click Run operator to render vectors along the curve.

### Visualize blocks (snapshots and compare)
1. Capture A and Capture B store a full view snapshot (camera, surface, expressions, domains, resolution, and overlays).
2. Jump A and Jump B restore the viewer to a stored snapshot.
3. Live/Frozen toggle: Live clears stored snapshots; Frozen keeps snapshots for comparison and export.
4. Click on a Visualize block (outside inputs/buttons) to jump to the most recent snapshot.
5. Use Compare mode with A/B snapshots to align left/right panes and study differences.

### Snapshot diff panel
1. Settings diff shows only fields that changed between A and B (dataset, viewer, expressions, domains, resolution, overlays).
2. Geometry stats include area, mean edge length, bbox diagonal, and vertex/face counts.
3. Diff stats are available for graph, param, and Weierstrass snapshots only; other modes show an unsupported note.

### Parameters and keyframes
1. Each block can carry Parameters. Use Add param to attach a control from the catalog.
2. Scrub mode applies param changes live while dragging; turn it off and use Apply params for manual updates.
3. Save keyframe stores the current param state. Play cycles keyframes; Stop ends playback.
4. Use Apply on a keyframe to jump to it; Delete removes it.

### Parameter catalog (current)
1. Graph resolution
2. Param resolution
3. Implicit resolution
4. Implicit domain size
5. Wireframe (toggle)
6. Contours (toggle)
7. Chart grid (toggle)
8. Probe (toggle)
9. Color mode (solid, height, radius, phase, curvature, gaussian, mean, k1, k2)
10. Color palette (blue/red, rainbow, grayscale, red/yellow)
11. Scalar field (K, H, k1, k2)
12. Vector field (grad(K), grad(H), grad(k1), grad(k2))
13. Vector density
14. Vector scale
15. Selection radius

### Status, staleness, and cache
1. Compute blocks track an input hash from operator, inputs, dataset, viewer kind, and params.
2. If any upstream block changes, the block becomes stale and shows a stale badge.
3. Run all stale recomputes only blocks marked stale.
4. Cached results are reused when inputs are unchanged; this keeps re-runs fast.

### Templates and problem packs
1. Expand Templates & problem packs to browse the library.
2. Search by keyword and filter by tag chips; use Clear tags to reset.
3. Use template creates a new workbook from that template.
4. Create all templates creates one workbook per template in a problem pack.
5. Templates and packs list required operators, suggested stages, difficulty, and tags.

### Export and replay
1. Export JSON saves all workbooks plus the active workbook and stage.
2. Export Markdown creates a static report with blocks and snapshots.
3. Export PDF opens a print view; use the print dialog to save as PDF.
4. Export Replay HTML creates a standalone read-only replay with embedded workbooks.
5. Replay mode disables edits and compute runs but allows camera navigation and snapshot jumps.

### Import JSON
1. Import JSON replaces the current workbook list with the imported data.
2. If the file includes active workbook and stage IDs, they are restored when possible.

### Practical workflows
1. Geodesic path: two Pick point interactions, then Compute -> Geodesic path.
2. Curvature study: Compute -> Curvature field + principal directions, then capture Visualize snapshots.
3. Vector calculus: Compute -> Grad, then Compute -> Div or Laplacian with the gradient field.
4. Overlay review: Draw curve or Pick direction, then Compute -> Curve overlay or Direction overlay; toggle Ghost overlays to compare iterations.
5. Transport demo: Draw curve, optionally Pick direction, then Compute -> Parallel transport (curve) to visualize twisting along the path.

### SurfaceQuery v1 (unified geometry API)
What you add
- A unified query interface that operators use instead of branching per dataset.
- `sampleAt(chartCoord | pick)` -> `{ p, du, dv, n, metric, areaElem }`.
- `tangentBasis(pick)` -> `{ e1, e2, n }`.
- `neighborhood(pick)` -> local neighborhood / adjacency (mesh).
- `projectToChart(pick)` -> chart coordinates + validity.

Implement for
- Param/Weierstrass: evaluate `S(u,v)` plus finite-difference derivatives (or analytic when available).
- Explicit: `(x, y, f(x,y))` plus finite differences.
- Mesh: local tangent-plane chart around the picked point (PCA / normal + local axes).

Done when
- A single `Point info` operator works on all surface kinds with identical output shape.

Chart coordinates
- Graph surfaces return `(x, y)`.
- Param/Weierstrass surfaces return `(u, v)` when UV is known.
- Mesh/implicit surfaces return local tangent-plane `(u, v)` around the picked point.
