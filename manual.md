# Manual

## Workbook usage
1. Open the Workbook tab (right panel) and create or select a workbook.
2. Add blocks in the Define/Compute/Visualize/Explain stages as needed.
3. Interaction blocks: choose a mode (Pick point, Draw curve, Select region, Pick direction) and capture data on the surface.
4. Compute blocks: pick an operator and click Run to generate outputs; parameters can be added via the Parameters section.
5. Visualize blocks: capture the current view as a snapshot and jump back to it later; use A/B snapshots for compare mode.
6. Export or import workbooks as JSON from the Workbook panel.

## Scene contents, Object tab, and status bar

### A) Geometry viewer scene roles
Use scene roles to keep multi-object projects consistent as object count grows.

1. `PrimaryObject`
- Main scene geometry that users create/edit directly.
- Typical examples: box, sphere, plane, vector, line, curve, procedural scene objects.

2. `Overlay`
- Display helpers layered on top of objects.
- Typical examples: wireframe, labels, bounding box, axes, normals, helper construction marks.

3. `DerivedResult`
- Geometry/results computed from other objects.
- Typical examples: intersection curves, measurement paths, projections, fitted constructions, generated mesh from procedural objects.

4. `ReferenceObject`
- Read-only or guide geometry used for construction context.
- Typical examples: guide planes, imported template meshes, helper references.

### B) Scene contents panel behavior
The Scene contents panel is the central object list for the active scene/workspace.

1. It supports both list modes:
- `Grouped`: groups rows by role (`PrimaryObject`, `Overlay`, `DerivedResult`, `ReferenceObject`).
- `Flat`: one continuous list when you prefer strict creation/order scanning.

2. Each row supports desktop-style object management:
- Visibility toggle (eye/show-hide behavior).
- Select/focus action (select row and jump to Object tab context).
- Delete/remove action (when allowed).
- Name + type badge + color chip for fast scanning.

3. Why this matters:
- Analysis outputs are not only booleans; they become first-class scene objects.
- You can add many overlays/results without scattering controls across multiple tabs.
- Selecting from Scene contents always routes details/edit actions to Object tab.

### C) Object tab behavior
Object tab is the identity card and properties panel of the currently selected item.

1. Core identity fields:
- Name
- Category/role
- Type
- Created from/source definition

2. Math/geometry fields:
- Domain/ranges (x/y/z or u/v, depending on object type)
- Sampling/resolution
- Mesh/topology stats (vertices/faces/triangles when available)

3. Editable fields and actions (when object is editable):
- Transform (position, rotation, scale)
- Rename
- Duplicate
- Hide/show
- Isolate/show all
- Bake/export/delete (depending on object type and mode)

### D) Docked status bar
The status bar is docked and persistent to provide passive context with low UI cost.

1. It is intended for always-useful runtime state, such as:
- Active viewer kind
- Selected object name
- Object type
- Mesh stats
- Camera mode
- Picked coordinates
- Analysis running/ready
- Compare mode state
- Workspace saved/unsaved state

2. Layout behavior:
- Docked at the bottom of the app viewport.
- Tokenized entries wrap/truncate as needed to prevent forcing main horizontal scroll.
- Keeps continuous feedback visible without consuming sidebar space.

## Differential operators (grad/div/laplacian)
1. Add a Compute block and choose `Grad (scalar → vector field)`, `Div (vector → scalar field)`, or `Laplacian (scalar → scalar field)`.
2. For `Grad`, pick a scalar field (defaults to `K`) and optionally set `Vector density` and `Vector scale`. Run to render downsampled tangent arrows (e.g. `K → grad(K)`).
3. For `Div`, either connect a vector output from an earlier Grad block or choose the `Vector field` param (defaults to `grad(K)`), then run to compute a scalar field.
4. For `Laplacian`, choose a scalar field (defaults to `K`) and run; this computes `div(grad(scalar))`.
5. When the surface samples match the mesh vertices, `Div` and `Laplacian` also enable a heatmap for the computed scalar field.

## Track A (calculus panel): vector fields + grad/div/curl
1. Open `Display & analysis` and expand `Vector calculus (Track A)`.
2. Pick a scalar source (`Height`, `Radius`, `Temperature`, curvature fields, or `Custom expression`) and run `Compute grad`.
3. Pick a vector source and run `Compute div` or `Compute curl` (normal-component curl).
4. Enable `Show vector field overlay` to render arrows/tubes that are sampled on surface points and stay attached to the surface.
5. Use `Density` and `Scale` to control overlay readability; clear heatmap with `Clear heatmap` when needed.

## Workbook reference (deep)

### Layout and navigation
1. Open the Workbook tab in the right panel. The header shows the current dataset, camera ready/pending state, and a Ghost overlays toggle.
2. Status shows overall workbook health: ok, stale, or failed. Use Run stage (Compute tab only) and Run all stale to refresh.
3. Use Clear workbook selection to drop selection overlays and return to normal selection behavior.
4. Use the stage chips to move through Define, Compute, Visualize, Explain / Check.
5. Use the Outline to jump to any block and Next stale/failed to cycle through blocks that need attention.

### Workbooks (create, rename, manage)
1. Use File actions in the Workbook panel: New Workbook, Open, Save, Save As, Recent, Export, Share bundle.
2. Use the workbook selector to switch between workbooks.
3. Rename in the title input. Duplicate or Delete from the action buttons.
4. The header dot is a dirty indicator: filled means unsaved changes vs last manual save.
5. Workbook data is stored locally; export if you need to share or archive.

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
11. Curl (vector -> scalar field): computes normal-component curl and stores a scalar field; enables heatmap when full vertex samples are available.
12. Laplacian (scalar -> scalar field): computes div(grad(scalar)) and stores a scalar field; enables heatmap when full vertex samples are available.
13. Principal directions: turns on principal direction glyphs.

### PR Charts v1 (coordinates)
- Added chart controls in Surface mode: `Show chart grid`, `Grid density`, `Active chart`, and `Coordinate readout`.
- Chart providers now cover:
  - Graph/explicit surfaces: `(x,y)` chart
  - Param/Weierstrass surfaces: `(u,v)` chart
  - Mesh-like surfaces (`mesh`/`implicit`/`complex`): local tangent-plane chart `(xi,eta)` around the picked point
- Added chart coordinate readout in probe theory view for the active chart kind.
- Chart grid now renders reliably on all surface types:
  - Graph: iso-x / iso-y curves on the surface
  - Param/Weierstrass: iso-u / iso-v curves on the surface
  - Mesh-like: local tangent-plane patch grid around the probe point

### PR4 — Export/import loop (OBJ/PLY)
- Added `Export PLY` alongside existing OBJ/GLB export in the Surface mesh panel.
- Mesh files can be re-imported (`Load STL/OBJ/PLY/GLTF`) and keep geometry coordinates as exported, so orientation/scale round-trip reliably.
- PLY export writes triangle faces directly from the current mesh dataset.

### PR4.5 — Scene ↔ Dataset
- Geometry panel now has a `Scene ↔ Dataset` block:
  - `Scene → Dataset (selected)`
  - `Scene → Dataset (all visible)`
  - `Dataset → Scene`
- `Dataset → Scene` spawns the active surface mesh dataset back into Geometry Viewer as an editable scene object.
- Scene-composed objects can be analyzed as one mesh dataset and then brought back into Geometry mode.

### PR1.5 — Polyhedra creator
- Added polyhedron options `triangulate`, `smoothNormals` (flat when off), `edgeDisplay`, plus `subdivision` for Platonic builds in `proceduralObjects.ts`.
- Kept/showed derived `V/E/F + triangles`, with triangle complexity reacting to subdivision in `App.tsx`.
- Added edge overlay generation (including selected outline) in `App.tsx`, wired through `GeometryViewer.tsx`.

### PR2 — Bake to MeshSurface (non-destructive)
- Added `Bake selected` and `Bake all visible` actions in `App.tsx`.
- Implemented handlers that bake transformed procedural meshes, switch to mesh/surfaces view, and keep geometry objects intact in `App.tsx`.
- Added provenance metadata source kind `geometryObject` with params/transform/material in `surfaceMesh.ts`.

### PR2.2 — Picking + inspector
- Viewport click now selects object and records pick data in inspector state in `App.tsx`.
- Added selected-object outline highlight via overlay polylines in `App.tsx`.
- Inspector now shows/edits params + transform + material, and shows last pick readout in `App.tsx`.
- Per-object material/flat shading is respected in mesh override rendering in `SurfaceViewer.tsx`.

### PR2.4 — Gizmo + snapping
- Added move/rotate/scale viewport gizmo for procedural geometry objects.
- Added optional snapping controls for translation step, rotation angle, and scale step.
- Gizmo updates the selected object transform live and stays synced with inspector transform fields.

### PR3 (mesh ops) — Basic mesh ops on baked meshes
- Added direct mesh tools in the Surface mesh panel: `Triangulate`, `Recompute normals`, `Subdivide`, `Center`, `Normalize scale`.
- Existing `Weld vertices` remains available in the same workflow.
- Subdivide uses simple midpoint triangle subdivision, then recomputes mesh-derived data (adjacency/mean edge length/validation).

### PR3.5 — Edge/feature visualization for polyhedra
- Added polyhedron feature overlays in geometry inspector: sharp edges by dihedral threshold, vertex angle defect markers, face normals, and dihedral readouts.
- Feature overlays are computed from the selected polyhedron mesh and rendered as live overlay groups in the viewport.
- Selected-object outline and optional edge display remain active and sync with feature overlays.

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
1. Save/Save As/Export use `.math3d` bundle files (JSON envelope + workbook payload).
2. Bundle exports include a `workspace` snapshot with Geometry, Datasets, and Analysis state.
3. Geometry persistence stores object definitions (type, params, transform, material, visibility, name, group), not triangle-only scene dumps.
4. Asset mode controls bundle behavior:
   - Embedded: mesh payloads are written into the bundle for portability.
   - Linked: mesh payloads are omitted; recipes/provenance remain.
5. Dataset persistence stores compact recipes and provenance (`source`, linked object ids when available, timestamps/version).
6. Export Markdown creates a static report with blocks and snapshots.
7. Export PDF opens a print view; use the print dialog to save as PDF.
8. Export Replay HTML creates a standalone read-only replay with embedded workbooks.
9. Replay mode disables edits and compute runs but allows camera navigation and snapshot jumps.
10. Analysis persistence stores chart/grid settings, scalar/vector field settings, overlay/geodesic toggles, and compute recipes/cache metadata.

### Import bundle / JSON
1. Open supports `.math3d` bundles and legacy `.json` workbook exports.
2. Active workbook and stage IDs are restored when present.
3. If `workspace` is present, Geometry objects, Dataset recipes, and Analysis state are restored.
4. Importing a `.math3d` bundle also restores bundle asset mode (`embedded` or `linked`).

### Autosave, snapshot, and recovery
1. Autosave runs every ~30 seconds and on meaningful workbook changes.
2. Autosave writes a journal (bounded history) plus the latest autosave record.
3. On restart, if autosave is newer than the last manual save, the app prompts to recover the session.
4. Quick action Restore last autosave loads the last autosaved workbook session payload.
5. Snapshot creates a named restore point for the full workbook session.
6. Use the snapshot selector to switch and restore any saved snapshot, or delete stale snapshots.
7. Session snapshot/restore is for the entire workbook payload; Visualize Capture A/B is for per-block view snapshots.

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
