# Math3D

[![CI](https://github.com/expert10000/Math3D/actions/workflows/ci-build-and-worker-smoke.yml/badge.svg)](https://github.com/expert10000/Math3D/actions/workflows/ci-build-and-worker-smoke.yml) [![Docs](https://github.com/expert10000/Math3D/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/expert10000/Math3D/actions/workflows/docs-pages.yml) [![Latest release](https://img.shields.io/github/v/release/expert10000/Math3D?display_name=tag)](https://github.com/expert10000/Math3D/releases/latest) [![Downloads](https://img.shields.io/github/downloads/expert10000/Math3D/total)](https://github.com/expert10000/Math3D/releases) [![License](https://img.shields.io/github/license/expert10000/Math3D)](https://github.com/expert10000/Math3D/blob/main/LICENSE)

Documentation (GitHub Pages): https://expert10000.github.io/Math3D/

## Changes (Latest changes)

- Added an Object tab as a true selected-object identity/properties panel (name, type, creation source, parameters, domain/ranges, sampling, mesh stats, transform, and object actions).
- Added a scalable Scene contents list with row actions (show/hide, focus, delete), color/type badges, and grouped/flat modes.
- Added explicit scene roles for multi-object workflows: `PrimaryObject`, `Overlay`, `DerivedResult`, `ReferenceObject`.
- Added a docked status bar with persistent context (viewer, selected object/type, mesh stats, camera mode, picked point, analysis/compare/workspace state) and wrapping tokens to avoid main horizontal scroll.
- Added a Geometry Viewer with construction primitives, constraints, stereometry analyzer (pyramid incenters + plane check), and face selection/highlight overlays.
- Added “Convert to Mesh…” for surfaces: bakes the active surface into a mesh dataset and switches to the SurfaceMesh viewer.
- Added an implicit baker (marching cubes) with independent bounds + resolution controls, running in a worker with progress and caching for big grids.
- Added SurfaceMesh exports (GLB/OBJ) plus a weld-vertices tool with tolerance control.
- Added MeshDataset plumbing with `datasetKind: "surface"` + `surfaceType: "mesh"` (no separate mesh dataset kind).
- Added graph/param/Weierstrass surface bakers (grid sampling + triangulation + invalid-point skipping).
- Added a dedicated Complex map tab next to Weierstrass, with sweep output choices for Re/Im surfaces and 3D isolines; complex rebuilds can be live or manual.
- Split SurfaceMesh controls into Surface vs Volume tabs (next to SurfaceMesh), moving dataset selection into the header tabs.
- Added linked orthogonal volume slices with click-to-place crosshair, readout panel, and a toggle back to full 3D view.
- Added geodesic disk selection (heat-method + Dijkstra) with boundary extraction and disk stats (area/perimeter/phi).
- Added volume slice overlays: marching-squares contours, hover probe with F(x,y,z)/|∇F|, histogram, and auto window/level.
- Added VTK-backed volume isosurface extraction with optional Laplacian smoothing.
- Added volume sampling controls with a crop box + gizmo (move/scale) and quick rebuild/reset.
- Added Volume viewer v0 with a toy voxel grid and slice preview (axis/index/opacity controls).
- Added true Volume Presets (sphere, torus, gyroid, metaballs) that sample F(x,y,z) into a volume grid with per-axis dims.
- Added adjustable volume presets (sliders per preset), plus noise fields, Mandelbulb DE, and a custom F(x,y,z) expression entry.
- Added new volume presets (ellipsoid, capped cylinder, superquadric) and refreshed custom examples (now one-click buttons).
- Added parametric geodesic heat paths (mesh heat + continuous ODE in UV).
- Added Weierstrass minimal surface mode (g(z), phi(z)) rendered through the parametric pipeline.
- Added Weierstrass presets (Enneper, Catenoid, Helicoid) and improved complex expression parsing for functions like exp(z).
- Added optional recenter/rescale for Weierstrass patches and documented the feature in the renderer README.
- Added a Gauss map (S²) inspector panel that mirrors normals as a second live visualization.
- Added Weierstrass diagnostics (path-drift magnitude, vector, traffic-light status, optional arrow, and recompute controls) that flag period drift.
- Added dual-path averaging and avg/max path disagreement reporting to the Weierstrass builder so trimmed domains show fewer seams even when drift is low.
- Added region selection overlays, including a translucent selection sphere, and linked the selected surface samples to the Gauss map.
- Added a Selection stats panel with count/mean normal/bbox plus K/H/k1/k2 stats and a mini histogram for selected points (graph, param, implicit, and Weierstrass).
- Added an Inspect mode: click-to-probe point selection with a surface marker, linked Gauss marker, and a persistent readout (no hover).
- Moved the Gauss map toggle into the in-view slice panel and kept color controls in the left panel when the map is enabled.
- Added a Gauss-map density heatmap (S²) for selected or all normals, rendered as a compact equirectangular inset with optional smoothing.
- Inspect picks now place the marker at the clicked surface point even when sampling stats from the nearest vertex.
- Added an Inspect-tab Domain navigator for graph/param/Weierstrass surfaces: 2D domain rectangle, click/hover picking, optional drag, sync with 3D picks, and coordinate readout mapped to the current surface point.
- Reduced live-hover flicker by throttling domain hover picks, ignoring tiny motion deltas, and routing domain probes through lightweight viewer updates (no full scene re-init).
- Added curvature line streamlines that follow principal direction fields (d1/d2) with controls for field, seeding, and step limits.
- Added ridge/valley overlays (local extrema of k1/k2 along d1/d2) with thresholds for magnitude, contrast, and direction alignment.
- Added ridge/valley curve stitching (v2) that turns feature vertices into readable polylines with decimation and cap controls.
- Added geodesic disk selection (intrinsic radius) plus zoom-to-region controls in the selection panel.
- Added geodesic distance heatmaps for mesh-based heat paths on graph, parametric, and Weierstrass surfaces.
- Added VTK worker ops for volume slice (vtkImageReslice), unsigned distance fields, and streamlines, with IPC/preload/service updates to expose them end-to-end.
- Integrated a volume bridge in the UI (Surface → Volume distance field), plus a volume override mode, and a new streamlines panel with vector presets and seed controls.
- Swapped volume slice rendering to use VTK when available/large grids, added a small-grid CPU fallback for volume isosurface, and added VTK streamlines rendering as tubes.

For detailed UI behavior and workflows for Scene contents/Object/Status bar, see [manual.md](manual.md).

## Code

### Install

```bash
git clone https://github.com/expert10000/Math3D.git
cd Math3D
npm install
```

### Tests

```bash
npm --prefix renderer run test
npm run test:app:startup:smoke
npm run test:app:geometry:smoke
```

### Web app (browser)

```bash
npm run dev:web
npm run build:web
npm run preview:web
```

`npm run build:web` writes static browser files to `apps/web/dist/`.

### Desktop app (Electron)

```bash
npm run build:core
```

```bash
npm run build
npm run dist
```

Desktop installers stay on the existing Electron pipeline (`npm run dist`, `npm run dist:ci`, `npm run dist:dev`).

### Python setup

The Python worker powers CGAL meshing and the new VTK mesh ops. Install these into the
Python environment used by the app (set `MATH3D_PYTHON` if needed):

```bash
python -m pip install numpy scipy sympy pygalmesh vtk
```

### VTK implicit preview (fast)

The implicit viewer includes a **Preview (VTK)** button for a fast mesh pass before running CGAL:

- Uses VTK Flying Edges (or Marching Cubes) on a uniform grid.
- Uses the **implicit domain bounds** and **implicit resolution** controls.
- Optional decimation to a target face count for responsive previews.
- Returns a SurfaceMesh, so you can use all mesh tools immediately.

Note: the preview button appears under the **Implicit surface (custom)** block in the right panel.

## Functions (Functionality)

### Overview

Math3D is a desktop visual lab for classical geometry and modern surface theory. It combines
three main visualization modes (implicit, explicit graph, and parametric) with a shared set of
tools for lighting, materials, probing, slicing, and comparative inspection. The goal is to
let you explore geometry interactively with minimal friction, while keeping the math visible
and editable.

### Core modes

#### 1) Implicit surfaces (f(x,y,z)=0)

- Purpose: Explore level sets of scalar fields in 3D.
- Rendering: A Marching Cubes grid is sampled over a finite box to extract the isosurface.
- Presets: Classical quadric families and named minimal surfaces are available, with custom
  expressions for user-defined forms.
- Custom expression: Enter f(x,y,z)=0 using standard math syntax. The surface is updated
  in real time and errors are reported inline.

#### 2) Graph surfaces (z=f(x,y))

- Purpose: Study height fields and explicit graphs with curvature and contour tools.
- Rendering: A parametric grid in the domain (x,y) is mapped to world coordinates using
  z=f(x,y). This keeps normals and derivative-based measurements consistent across tools.
- Presets: Saddles, waves, Gaussians, and several radially symmetric examples. Custom
  expressions are also supported.
- Curvature: The app computes local invariants (K, H, k1, k2) at the probe point and can
  color the mesh by curvature.

#### 3) Parametric surfaces (sigma(u,v))

- Purpose: Work with classical parametrizations, global topology, and geodesic tools.
- Rendering: A parametric grid in (u,v) is sampled and mapped into 3D. Domains can be
  edited to control coverage and reduce self-intersection clutter.
- Presets: Canonical examples such as torus, helicoid, catenoid, Enneper, and others.
- Custom param: Provide X(u,v), Y(u,v), Z(u,v) expressions for custom surfaces.
- Geodesics: Heat-method paths on the parametric mesh, plus a continuous ODE solver in UV when enabled.

### SurfaceMesh conversion (Convert to Mesh…)

Use the **Convert to Mesh…** button in the SurfaceMesh panel to bake the current surface into a mesh dataset and switch to the **SurfaceMesh** viewer.

How it works (by viewer):

Implicit (f(x,y,z)=0)
- Requires CGAL mesh first.
- Convert uses the current CGAL mesh output. If CGAL hasn’t run, it won’t convert.

Explicit graph (z=f(x,y))
- Samples a grid over the current graph domain at the current resolution.
- Skips invalid points, then triangulates the grid.
- If everything is invalid, you’ll get “No valid triangles produced.”

Parametric (σ(u,v))
- Samples the current u,v domain at the current resolution.
- Skips invalid points, triangulates the grid.
- Custom expressions are evaluated; invalid values are skipped.

Weierstrass
- Uses the current g/phi, domain, resolution.
- Samples the param surface from the Weierstrass builder.
- Skips invalid points; triangulates.

Complex map
- Uses the already-built complex map mesh.
- If the map isn’t ready, it errors (“Complex map mesh not ready yet.”).

#### 4) Complex maps (w = f(z))

This tab helps you inspect a complex map w = f(z) by:

- Drawing preimages of simple sets in the W-plane.
- Highlighting critical points / zeros / poles.
- Visualizing local distortion (area / anisotropy / conformality).

**Preimage tool**

Choose which W-plane set you want to preimage:

- Off — disables the preimage overlay.
- Re(w)=c — shows the preimage of the vertical line Re(w)=c.
- Im(w)=c — shows the preimage of the horizontal line Im(w)=c.
- |w|=1 — shows the preimage of the unit circle |w|=1.
- arg(w)=θ — shows the preimage of a ray with argument arg(w)=θ.

Controls:

- Value — the constant c or angle θ used by the selected mode.
- Snap to nice values — snaps the chosen value to convenient numbers (e.g., near 0, simple angles) to make exploration easier.
- Click W-plane to set — click inside the W-plane view to set the value interactively (depending on the mode).

**Critical points / zeros / poles**

This section draws markers for special points detected from the map:

- Critical — marks points where the mapping becomes locally degenerate (near singular Jacobian / derivative). Threshold shown as |detJ| ≤ ….
- Zeros — marks points where |w| is near 0 (i.e., f(z) ≈ 0). Threshold shown as |w| ≤ ….
- Poles — marks points where |w| is very large (i.e., the map blows up). Threshold shown as |w| ≥ ….

Tuning:

- crit rel / zero rel / pole rel — relative sensitivity sliders (0–1). Lower values usually mean stricter / fewer markers; higher values mean more / looser detection.
- max markers — limits how many markers are drawn (performance + readability).
- Z-plane markers — show markers in the Z-plane view.
- W-plane markers — show corresponding points in the W-plane view.
- 3D markers — show markers on the 3D surface (if enabled).

**Distortion**

Visualizes how the map locally stretches/warps space.

Modes:

- Off — no distortion visualization.
- Area |detJ| — shows local area scaling (how much the mapping expands/contracts area).
- σmax/σmin — shows anisotropy (how directional the stretching is). Values near 1 are close to isotropic; larger values indicate strong directional distortion.
- Conformal error — shows deviation from conformality (angle-preservation). Smaller values are “more conformal”; larger values indicate angle distortion.

Display settings:

- Scale: Linear / Log. Log is available only for |detJ| and σmax/σmin (helps when values vary a lot).
- Z-plane heatmap — overlays the distortion as a heatmap in the Z-plane.
- Surface color — colors the 3D surface by the chosen distortion metric.

Tip:

- Probe a point on the surface to read the local distortion value at that point.

**Riemann sphere view (PR7)**

Optional stereographic projection view for W:

- Toggle "Riemann sphere view" under the Z/W planes in the Complex map panel.
- W-plane samples (isolines, picked lines, preimage curves, markers, probes) are mapped to S².
- Poles map to the north pole, giving a clean representation of infinity.
- "Stack along sweep axis" shows one sphere per sweep slice, centered along the sweep axis.

**Multi-sheet surfaces (PR8)**

Render algebraic/Riemann surfaces defined by w^k = p(z):

- Switch the Complex map "Map mode" to multi-sheet.
- Re/Im define p(z); choose k (sheet count) and whether to render all sheets or a single sheet.
- The branch cut angle rotates the principal argument used by the root.
- The active sheet drives W-plane and preimage tools; all sheets can be rendered in 3D.

#### 5) Volume grids (experimental)

- Purpose: Preview scalar fields sampled on a voxel grid, inspect slices, and extract first-pass 3D surfaces.
- Rendering: A slice plane in three.js textured with a grayscale Image2D derived from the grid.
- Presets: Sphere, ellipsoid, torus, capped cylinder, superquadric, gyroid (TPMS), metaballs, noise fields, Mandelbulb DE, and a custom F(x,y,z) field.
- Controls: Preset/custom toggle, per-preset parameter sliders, grid dims (Nx, Ny, Nz), slice axis/index, and opacity in the left panel when Volume mode is active.
- Slice overlays: marching-squares contours, hover probe (x,y,z + F + |∇F|), plus histogram + auto window/level for contrast.
- Isosurface: VTK marching cubes/flying edges to a shaded SurfaceMesh, with optional Laplacian smoothing.
- Sampling box: crop box and gizmo to move/scale the sampled bounds, with quick rebuild/reset.
- Custom: Enter F(x,y,z) with standard math syntax (sin, cos, exp, sqrt, etc.) and live-compile errors. Examples are one-click buttons.
- Source: Volume grids are sampled client-side; VTK is used only for isosurface extraction/smoothing via the Python worker.

### Gauss map (S²)

- When you toggle the Gauss map, a companion sphere renders the sampled normals side-by-side with the 3D view.
- Normals can be colored by their components or the current palette, hover/highlight works both ways, and probe updates keep the sphere synced with the surface, turning normals into a second live visualization.
- The Gauss viewer now behaves like a micro OrbitControls scene with damping, zoom/pan constraints, a reset button, toggles for depth occlusion or wireframe/axes/equator helpers, and controls to tweak point size plus sampling density so you can limit clutter without leaving the panel.
- The "Select region" flow now links the surface and Gauss map: enable it in the left panel, pick a seed point (world or UV) and a radius, and both the surface and the sphere highlight the same normals, while an optional Gauss-cap click also selects its matching points on the surface.
- The Gauss map toggle lives in the slice-plane overlay in the main view; color options remain in the left panel and only appear when the map is enabled.
- You can show a translucent selection sphere at the picked point to visualize the radius used for the surface and Gauss-map selection.
- The density inset bins normals on S² (theta/phi) for selected or all points, normalizes by the max bin, and shows a quick heatmap of normal concentration.

### Selection analysis

- Enable "Select region" and click the surface to seed a spherical selection.
- The Selection stats panel reports count, mean normal, bbox size/diag, and curvature stats (K/H/k1/k2) when available.
- A mini histogram summarizes a chosen metric for the selected points and updates live with radius changes.

### Curvature lines

- Enable "Curvature lines" to draw streamline overlays that follow the principal direction field (d1 or d2).
- Seeds can come from a global grid or the active selection region, and density/step/length caps keep the overlay stable.

### Ridges / valleys

- Enable "Ridges / Valleys" to draw short segments at vertices where k1 is locally maximal along d1 (ridges) or k2 is locally minimal along d2 (valleys).
- Controls include magnitude/contrast thresholds, direction alignment (minCos), segment length, sampling density, and optional selection-only filtering.
- Enable "Stitch into curves (v2)" to connect ridge/valley feature vertices into polylines with decimation, max-curves cap, and optional confidence filtering.

### Geodesic disk selection

- Selection mode now supports Euclidean ball or geodesic disk (intrinsic shortest-path radius on the mesh).
- Disk mode computes a geodesic distance field once per center pick; radius updates are instant.
- Optional disk boundary extraction draws a discrete geodesic circle on the mesh.
- Disk stats report vertex/triangle counts, area, perimeter, and phi min/max/mean.
- When enabled, "Zoom to region" smoothly frames the current selection with a debounced camera fit.

### Geodesic distance heatmaps (mesh)

- The "Show distance heatmap" toggle now works for graph, parametric, and Weierstrass meshes as well as implicit surfaces.
- Heatmaps visualize the mesh-based heat-method distance field and are disabled when "Use continuous ODE" is active.

### Geodesics on explicit surfaces (z=f(x,y))

If you want geodesics on a custom graph surface (e.g., a saddle z=f(x,y)), there are two practical approaches.

1) Mesh-based explicit geodesics (same as implicit) ✅
2) Continuous parametric explicit geodesics (ODE/PDE on (x,y)) ✅

Use the left-panel “Heat method (mesh)” section and toggle “Use continuous ODE (graph)” when in graph mode.

**A) Continuous formulation on z=f(x,y) (math-first)**

- Parametrization: r(x,y) = (x, y, f(x,y)).
- Partials: rx = (1, 0, fx), ry = (0, 1, fy).
- First fundamental form (metric):
  - E = 1 + fx^2
  - F = fx * fy
  - G = 1 + fy^2
  - ds^2 = E dx^2 + 2F dx dy + G dy^2
- Geodesic ODE on (x,y):
  - u^k'' + Gamma^k_ij(u) u'^i u'^j = 0, k=1,2
  - Gamma^k_ij are the Christoffel symbols of the metric (need fx, fy, fxx, fxy, fyy).
  - Useful metric derivatives:
    - Ex = 2 fx fxx, Ey = 2 fx fxy
    - Fx = fxx fy + fx fxy, Fy = fxy fy + fx fyy
    - Gx = 2 fy fxy, Gy = 2 fy fyy
  - Inverse metric:
    - Delta = E G - F^2
    - g^{-1} = (1 / Delta) [[G, -F], [-F, E]]
- Boundary-value solvers (two endpoints):
  - Shooting method: solve for the initial direction, integrate the ODE (RK4/5) until you hit the target.
  - Distance field + backtrace: solve for distance d(x,y) on the domain and step along -g^{-1} grad d; lift to 3D via r(x,y).
    - You can compute d via a heat method or an Eikonal/FMM variant adapted to the metric.

**B) Mesh-based (recommended in Math3D)**

- Sample a regular grid in the (x,y) domain, triangulate it (two tris per quad).
- Lift vertices to 3D: p_ij = (x_i, y_j, f(x_i, y_j)).
- Run the same heat solve + Poisson solve + face-walk backtrace pipeline already used for CGAL meshes.
- This gives geodesics on explicit graphs with almost no new math or code.

### Inspect tool

- Toggle "Inspect mode" and click on the surface to lock an inspect point.
- The Inspect panel shows idx, 3D point, normal, tangent frame, and curvature scalars (K/H/k1/k2 when available).
- The Gauss map highlights the inspect normal direction, and the inspect marker stays until cleared.
- Inspect markers are placed at the exact click location while stats are sampled from the nearest mesh sample.
- For graph/param/Weierstrass viewers, Inspect includes a Domain navigator card:
  - 2D rectangle over active `(x,y)` or `(u,v)` domain.
  - `Click` and `Hover` modes, with optional drag-to-move.
  - `Sync with 3D pick` to mirror picks between viewport and domain chart.
  - Coordinate readout linking domain coordinates to the mapped 3D point/value.
- For most stable interaction, use `Click mode`; `Hover mode` is throttled for live preview.

### Weierstrass diagnostics

- The new diagnostics card in the Weierstrass panel estimates Δ = Re ∮ Φ(z) dz around the UV rectangle, reports the path-drift magnitude, shows the dx/dy/dz vector, and color-codes a status indicator (green/yellow/red for <1e-3, 1e-3..1e-2, >1e-2).
- Toggle “Show drift vector arrow” to overlay the vector on the surface and hit “Recompute diagnostics” whenever you change the domain or resolution; the UI also warns when the boundary hits a singularity so you can pick a safer patch.
- Curated Weierstrass presets (Enneper, Enneper order 2, Helicoid-like exp, Catenoid-like exp pair, trig demo) zero-load the correct g/φ pairs, safe domains, resolution, and recenter settings; each preset also explains the “Suggested safe domain” so you can reapply the conservative uv-range in one click without hunting for poles.

### Surface catalog and presets

Math3D ships with a curated set of presets in each category. These are grouped by mode and
shown in the surface picker. The list includes:

- Implicit: sphere, ellipsoid, hyperboloids, torus (implicit), gyroid, superquadric, and
  other named examples.
- Graph: saddles, waves, Gaussian bumps, ripple families, and multiple sinc variants.
- Parametric: plane, cylinder, cone, sphere, torus, Moebius, Klein bottle, and more.

Presets are intended to be simple but illustrative. They serve as a starting point for
investigating curvature, topology, and singularities. The graph and implicit modes both
support custom expressions, and parametric mode supports custom coordinate maps.

### Material and lighting controls

The viewer includes a unified material palette shared across modes:

- Material roughness and metalness to control specular response.
- Opacity to study self-intersections and internal structure.
- Wireframe toggle for geometric analysis.
- Multiple lighting presets for clarity or depth.

Lighting presets are designed to emphasize shape and curvature without overwhelming the
surface with shadows. Use softer presets for smooth curvature analysis and higher contrast
for structural forms.

### Color modes and palettes

Color is a key analytic tool in Math3D. The app offers several color modes:

- Solid: clean material color, no vertex coloring.
- Height: color by world-space height.
- Radius: color by distance from origin.
- Curvature: graph mode and implicit overlays, color by curvature magnitude.
- Gaussian / mean / principal curvatures for graph and parametric modes.

You can also choose from multiple palettes (blue-red, rainbow, grayscale, red-yellow).

### Probe and inspection tools

Probe mode provides precise local inspection:

- Click a surface to retrieve a point p and a unit normal n.
- Show normals, tangents, and a local tangent plane.
- For graph surfaces, compute curvature invariants (K, H, k1, k2).
- Probe coordinates are displayed in the side panel and can be reused as domain inputs.

This enables a workflow like: pick a point, inspect derivatives, adjust parameters, compare
with a second surface, and quickly see the geometric changes.

### Implicit overlays

Implicit surfaces can be hard to read because the surface is extracted from a volume. Two
extra overlays improve insight:

- Normal lines derived from the gradient of f(x,y,z), displayed as small vectors.
- Curvature coloring computed from gradient and Hessian samples.

These overlays can be toggled independently, and they are useful for understanding behavior
near singularities or asymptotic regions.

### Contours and slicing

Graph mode includes contour lines that represent level sets of z in the domain. This makes
it easy to connect geometry to 2D intuition. The number of contour levels is adjustable.

Slicing adds multi-plane cross sections:

- Enable XY, YZ, and XZ slices independently.
- Adjust offsets per plane to sweep through the surface.
- Optional slice sheets and line coloring for visual clarity.

Slicing is effective for understanding the implicit surfaces because it reveals how the
level set intersects coordinate planes.

## Changes (Latest changes, 2026-01)

- Added VTK implicit preview (flying edges/marching cubes) with optional decimation for fast implicit meshing.
- Added a Python VTK pipeline (clean normals, decimate, smooth) with binary IPC buffers.
- Added VTK mesh ops UI to push any surface mesh through the worker and return a new SurfaceMesh.
- Enabled ridge/valley overlays for SurfaceMesh and added mesh presets that show features clearly.

Slice plane intersections for graph surfaces are computed by defining a unit normal n and
offset c so the plane is n dot X = c. For graph surfaces z=f(x,y), we sample
g(x,y)=nx*x + ny*f(x,y) + nz*y - c on a grid and run marching squares at level 0 to get
polylines. Those polylines are mapped to 3D points (x, f(x,y), y) and drawn as lines; the
translucent plane is a rectangle oriented to n. It updates only when slice params or the
surface/domain change (not every frame).

### Domain pickers and presets

Right-panel domain tools let you control where your surface is sampled:

- Graph domains define x-span and y-span, changing the visible region.
- Parametric domains define u/v min and max values, controlling coverage.

Both graph and param domains support saved presets:

- Save a domain per surface with an optional label.
- Reapply saved domains to restore a preferred view.
- Domains are stored per surface to keep changes local and reproducible.

Domain pickers also support direct clicking to send a domain point to the active surface
viewer, enabling quick targeting for probes or custom evaluations.

### Compare mode

The compare mode provides a side-by-side view with optional camera sync. This is useful for
studying variations between related surfaces, parameter choices, or expression tweaks.

Key behaviors:

- Toggle camera sync on/off from the Compare controls.
- Each pane uses independent overlay/color settings captured per snapshot.
- Compare mode is available for implicit, graph, and parametric modes.

Quick workflow:

- Open Workbook → Visualize block.
- Capture A (left) and Capture B (right) snapshots.
- Enable Compare and use Jump A / Jump B to align a pane to a snapshot.

Examples of use cases:

- Compare a catenoid and a helicoid.
- Compare two graph expressions with only one parameter changed.
- Contrast implicit torus vs parametric torus.

### Snapshot diff + ghost overlays

Visualize blocks now support **snapshot diff** (visual diff, not git diff). This makes it
clear *what changed* between A and B when comparing two views.

What the diff shows:

- **Settings diff**: a compact A→B table listing only the fields that changed (dataset,
  viewer kind, surface/param id, expressions, domains, resolutions, and overlay toggles).
- **Geometry diff stats** (graph/param/Weierstrass snapshots):
  - `Area` (triangle surface area sum)
  - `Mean edge length`
  - `BBox diagonal`
  - Vertex/face counts
  - Each stat shows A, B, and Δ (B − A)

Limits and scope:

- Geometry stats currently run for **graph**, **param**, and **Weierstrass** snapshots only.
  Implicit / mesh / volume snapshots show a gentle “unsupported” note for now.
- Diff stats are recomputed from the snapshot’s stored settings (expressions, domains,
  resolution) so they remain stable even if the live viewer changes later.

Diff heatmap (graph-only):

- In Compare mode, enable **Diff heatmap** to overlay `|ΔK|` (absolute Gaussian curvature
  difference) on the **left** pane.
- Requires **both** snapshots to be graph surfaces; the toggle auto‑disables otherwise.
- The diff heatmap temporarily overrides other heatmap overlays for clarity.

Ghost overlays:

- When you run a new **Curve overlay** or **Direction overlay** from a Compute block,
  the previous overlay is retained as a **ghost** (faint, low‑opacity) so you can see what
  changed without losing context.
- Toggle **Ghost overlays** in the Workbook header.
- Only workbook curve/direction overlays are ghosted (selection masks are unchanged).

### Templates + problem packs

Math3D ships with a template library so you can spin up structured workbooks quickly.

How to use:

- Open **Workbook** → expand **Templates & problem packs**.
- Search by keyword or click tag chips (e.g., `geodesics`, `atlas`, `curvature`).
- Click **Use template** to create a new workbook from that template.
- Click **Create all templates** on a problem pack to add all its templates at once.

Built‑in templates (examples):

- **Compute curvature** — curvature field + interpretation.
- **Geodesics from point** — heat method + shortest path.
- **Chart + basis** — chart grid and tangent basis.
- **Transport demo** — parallel transport along a drawn curve.
- **Selection + stats** — selection overlay + curvature context.
- **Principal directions** — curvature + principal direction glyphs.
- **Curve overlay demo** — draw curves with ghost overlays.

Problem packs bundle templates with metadata:

- Topic, difficulty, and prerequisites.
- Required operators and suggested stages.
- Tags for filtering in the library browser.

### Exports (Markdown / PDF / replay HTML)

Workbook exports preserve meaning by bundling the visual record with the narrative.

How to use:

- In **Workbook**, use the export buttons next to the workbook controls.
- **Export Markdown** creates a static report with stage/block text plus Visualize snapshots (A/B thumbnails + captions).
- **Export PDF** opens a print-friendly report; use the print dialog to "Save as PDF".
- **Export Replay HTML** generates a standalone HTML file that embeds the workbook JSON and launches Math3D in read-only replay mode.

Notes:

- Replay mode disables edits and compute runs, but you can still orbit the camera and jump to snapshots.
- If the replay export cannot inline assets (dev builds), keep the HTML next to the app's built assets so the linked scripts/styles resolve.

### Command console

An inline command interface supports quick changes without hunting through controls:

- Switch surfaces and modes.
- Change expressions for graph and implicit modes.
- Adjust resolution and color modes.
- Inspect probe data from the current cursor selection.

This is intended for power users and for repeatable workshop demos.

### Data storage

Presets and domain preferences are stored locally in the browser storage environment, with
keys scoped by surface id. This keeps the state user-specific without requiring an external
backend.

### Performance notes

Surface rendering is compute-heavy. To keep interaction smooth:

- Use moderate resolutions for Marching Cubes.
- Increase resolution only when studying small-scale details.
- Avoid overly large domain spans for implicit and graph surfaces.

When compare mode is enabled, rendering cost doubles. If performance drops, lower resolution
or disable heavy overlays (curvature or dense contours).

### Tips for exploration

- Start with a canonical surface (sphere, torus, saddle) and enable curvature coloring.
- Explore the Weierstrass mode diagnostics: the new sidebar shows path‑drift magnitude, drift vector, and a traffic‑light status so you can tell whether the minimal surface depends on the integration path. Toggle “Show drift vector arrow” to overlay the vector and hit “Recompute diagnostics” whenever you change the domain or resolution.

- Use probe mode to locate critical points and read off curvature values.
- Activate slicing to reveal hidden structure inside implicit surfaces.
- Save multiple domains for a single surface to quickly switch viewpoints.

### Troubleshooting

- If a surface fails to render, check for syntax errors in custom expressions.
- If the view looks empty, reduce the domain spans or reset them to defaults.
- If performance drops, lower resolution or turn off overlays.

### Limitations and future extensions

Math3D focuses on interactive clarity. Some advanced features are approximated numerically
(e.g., curvature for implicit surfaces is estimated from local samples). The system is
extensible and designed to support additional surface families, export options, and more
specialized analytic tools.

### Code map (surface pipelines)

This section is duplicated in `CODE_MAP.md` with the same references for quick PR review.
It describes where each surface type is built, when it re-renders, and the core algorithms.

#### 1) Implicit surfaces (f(x,y,z)=0)

- Render lifecycle: `renderer/src/components/SurfaceViewer.tsx` main `useEffect` rebuilds the
  scene and implicit mesh when `surfaceId`, `implicitExpr`, `implicitResolution`,
  `implicitDomainSize`, or material options change (see the dependency list at the end of
  the effect).
- Geometry build: `makeImplicitSurface` in `renderer/src/components/SurfaceViewer.tsx` uses
  `MarchingCubes`, samples `f(x,y,z)` on an `implicitRes^3` grid, sets `effect.isolation = 0`,
  and calls `effect.update()`.
- Preset/custom expressions: `getImplicitFallback` and `implicitFnRef` in
  `renderer/src/components/SurfaceViewer.tsx`, parsed by `compileExpression` in
  `renderer/src/math/expression.ts`.
- Normals and curvature: `sampleImplicitDerivatives`, `buildImplicitNormalLines`,
  `applyImplicitCurvatureColors`, and `computeImplicitPrincipalAtPoint` in
  `renderer/src/components/SurfaceViewer.tsx` (finite differences on the gradient/Hessian).
- Contours and slicing: `marchingSquares` in `renderer/src/math/marchingSquares.ts` is used
  to intersect implicit slices and planes in `renderer/src/components/SurfaceViewer.tsx`.

#### 2) Graph surfaces (z=f(x,y))

- Render lifecycle: built in the same `SurfaceViewer` `useEffect` as implicit surfaces, with
  updates triggered by `surfaceId`, `graphExpr`, `graphResolution`, or graph domain changes.
- Geometry build: `makeGraphGeometry` in `renderer/src/components/SurfaceViewer.tsx` creates
  a `ParametricGeometry` mapping `(u,v)` to `(x, z=f(x,y), y)` so the graph domain is stored
  in world z.
- Preset/custom expressions: graph presets are inline functions in
  `renderer/src/components/SurfaceViewer.tsx`; custom graphs compile via `compileExpression`
  in `renderer/src/math/expression.ts` into `graphFnRef`.
- Curvature coloring and probes: `applyCurvatureHeatToGraph` in
  `renderer/src/components/SurfaceViewer.tsx` computes Gaussian curvature with finite
  differences; `renderer/src/math/surfaceInvariants.ts` provides probe invariants.
- Contours and slicing: `buildGraphContours` in `renderer/src/math/contours.ts` and
  `marchingSquares` in `renderer/src/math/marchingSquares.ts` are called from
  `renderer/src/components/SurfaceViewer.tsx`.

#### 3) Parametric surfaces (sigma(u,v))

- Render lifecycle: `renderer/src/components/ParamSurfaceViewer.tsx` main `useEffect`
  rebuilds geometry when `surfaceId`, domain bounds, `paramResolution`, or custom
  expressions change (dependency list at end of the effect).
- Geometry build: `paramFunc` is selected in the surface switch, wrapped to map `u,v` from
  [0,1] into domain bounds, and passed into `ParametricGeometry`, followed by
  `geometry.computeVertexNormals()`.
- Custom parameter expressions: `makeSafeParamExpr` in
  `renderer/src/components/ParamSurfaceViewer.tsx` uses a safe `new Function` wrapper.
- Curvature and principal directions: `computePrincipalCurvatureAtUV` in
  `renderer/src/math/principalCurvature.ts` plus streamline helpers in
  `renderer/src/math/principalStreamlines.ts`.
- Slicing and sampling: `marchingSquares` is used for slice plane intersections in
  `renderer/src/components/ParamSurfaceViewer.tsx`; samples come from
  `renderer/src/math/sampling/surfaceSampling.ts`.

#### 4) Weierstrass minimal surfaces (g(z), phi(z))

- Render lifecycle: `renderer/src/components/ParamSurfaceViewer.tsx` calls
  `buildWeierstrassSurface` when `surfaceId === "weierstrass"`; rebuilds are triggered by
  `weierstrassGExpr`, `weierstrassPhiExpr`, `weierstrassResolution`, and domain changes.
- Build and integrate: `renderer/src/math/weierstrass.ts` builds a grid of complex data,
  integrates along u-first and v-first paths, averages them to reduce drift, and stores
  `pathDisagreement` (avg/max).
- Recenter/rescale: optional `recenterRescale` recenters and scales the grid to a ~unit
  extent in `renderer/src/math/weierstrass.ts`.
- Complex expression parsing: `renderer/src/math/complexExpr.ts`.
- Path drift diagnostics: `computeWeierstrassDrift` in `renderer/src/math/weierstrass.ts`
  and the drift arrow setup in `renderer/src/components/ParamSurfaceViewer.tsx`.

### Summary

Math3D provides a cohesive environment for studying surfaces across implicit, explicit, and
parametric definitions. With probes, overlays, slicing, and compare tools, it supports both
intuitive exploration and mathematically precise inspection.
### CGAL worker (Windows / conda)

Run the app from a shell where the CGAL-enabled Python environment is active:

```powershell
conda deactivate
conda activate math3d-cgal
$env:MATH3D_PYTHON = (Get-Command python).Source
npm run build
npm run dev
```

To exit the environment:

```powershell
conda deactivate
```


Added signed distance fields (winding-number sign) and auto-bounds for Surface → Volume, with UI toggles and updated distance-field metadata.
Added streamline step size + max steps controls (range + numeric) and plumbed them through to VTK.
Implemented a proper non‑cubic CPU marching‑cubes fallback using three’s tables and a custom grid marcher.


Add a dedicated 3D view (4th pane) to show the isosurface without locking rotation.
Share isosurface geometry across views so it can render in all three without duplicate computation.
Add a “snap crosshair to voxel center / keep continuous” toggle.

Summary

Implemented PR4 distortion visualization controls + Z‑plane heatmap/surface coloring + probe readout in App.tsx.
Implemented PR5 linked probe (Z/W/3D picking), cross‑markers, readout, and pinned probes in App.tsx.
Implemented PR6 mapped coordinate net upgrades (separate u/v counts, thickness/opacity, two‑color grid, optional surface tubes) across App.tsx, complexMapSweep.ts, PlanePlot.tsx, and SurfaceViewer.tsx.
Tests

Not run (not requested).
Next Steps

Run the app and sanity‑check: Z/W/3D linked picks, distortion heatmap + surface color, and grid thickness/opacity + tube overlays.

PR2 - SurfaceQuery v1 (one geometry API for param/explicit/mesh)

What you add
- A unified query interface that operators use instead of branching per dataset.
- `sampleAt(chartCoord | pick)` -> `{ p, du, dv, n, metric, areaElem }`.
- `tangentBasis(pick)` -> `{ e1, e2, n }`.
- `neighborhood(pick)` -> local neighborhood / adjacency (mesh).
- `projectToChart(pick)` -> chart coordinates + validity.

Implement for
- Param/Weierstrass: evaluate `S(u,v)` + finite-diff derivatives (or analytic if available).
- Explicit: `(x, y, f(x,y))` + finite diffs.
- Mesh: local tangent-plane chart around picked point (PCA / normal + local axes).

Done when
- A single `Point info` operator works on all surface kinds with identical output shape.

PR3 - Implicit baker

- Marching cubes + normals
- Bounds + resolution UI

PR4 - Worker + progress + caching

- Make it usable for big resolutions

PR5 - Nice extras (optional)

- Export baked mesh (GLB/OBJ)
- Decimate / smooth / weld vertices

How to use PR3–PR5 + SurfaceQuery updates

Implicit baker (PR3)
1. Switch to an implicit surface.
2. In the left panel, set bounds and resolution for the implicit bake.
3. Run the bake and wait for progress to complete.
4. Use “Convert to Mesh…” in the SurfaceMesh panel to switch to the baked mesh dataset.

Worker + progress + caching (PR4)
1. Run the implicit baker at higher resolutions and watch the progress indicator.
2. Re‑run with the same settings to verify the cache hit.
3. If you change bounds or resolution, expect a fresh bake.

Mesh extras (PR5)
1. With a mesh dataset active, use the SurfaceMesh panel to export `GLB` or `OBJ`.
2. Use `Weld vertices` with a small tolerance to collapse duplicate vertices.
3. Use VTK `Smooth` or `Decimate` when available for cleanup.

Workbook compute + Point info (SurfaceQuery)
1. Add an Interaction block set to Pick point and capture a point on any surface type.
2. Add a Compute block and choose `Point info`.
3. Click Run operator to read `p, du, dv, normal, metric, areaElem` for the picked point.
4. Curvature stats (K/H/k1/k2) now come from surface fields when available and fall back to graph sampling.

Differential operators (grad/div/laplacian)
1. Add a Compute block and choose `Grad (scalar → vector field)`, `Div (vector → scalar field)`, or `Laplacian (scalar → scalar field)`.
2. For `Grad`, pick a scalar field (defaults to `K`) and optionally set `Vector density` and `Vector scale`. Run to render downsampled tangent arrows (e.g. `K → grad(K)`).
3. For `Div`, either connect a vector output from an earlier Grad block or choose the `Vector field` param (defaults to `grad(K)`), then run to compute a scalar field.
4. For `Laplacian`, choose a scalar field (defaults to `K`) and run; this computes `div(grad(scalar))`.
5. When the surface samples match the mesh vertices, `Div` and `Laplacian` also enable a heatmap for the computed scalar field.

Developer note (SurfaceQuery + fields)
1. SurfaceQuery lives in `renderer/src/math/surfaceQuery.ts`.
2. Mesh datasets (kind `"surface"` with `surfaceType: "mesh"`) can provide scalar/vector fields via `MeshDataset.fields` in `renderer/src/scene/datasets.ts`.
3. The App builds a surfaceQuery with `sampleAt`, `neighborhood`, `scalarField`, and `vectorField` accessors.

PR7 - Riemann sphere mode (stereographic)

Visualize w on the sphere via stereographic projection:
- map w in C U {infinity} -> S^2
- sweep axis becomes "stacked spheres" or animate v
- poles go to north pole (clean handling of infinity)

Why: handles huge values/poles elegantly; very "complex analysis".

PR8 - Multi-sheet surfaces (true algebraic/Riemann surfaces)

For things like w^k = p(z) or w = sqrt(p(z)):
- generate k sheets
- branch point detection + sheet stitching (harder)
- UI: choose branch cut strategy

Why: this is the real "Riemann surface" feature.

Performance/quality (you'll want this soon)

PR9 - Robust meshing around singularities
- triangle dropping near invalid vertices
- adaptive refinement in cells with large gradients (simple heuristic)
- optional "singularity mask" overlay

Why: removes skinny sliver artifacts and makes plots stable.

Workbook PRs (Notebook UX)

PR A - Workbook scaffolding
- Project → Workbook list
- Workbook editor with 4 stage tabs (Define, Compute, Visualize, Explain / Check)
- Block types: Text, Formula, Visualize (no compute yet)
- Save/load as JSON

PR B - Visualize blocks control the viewer
- Capture current view (camera + toggles + selected overlays)
- Capture A/B snapshots for compare mode
- Jump to view (block click + Jump A/B buttons)
- Mini thumbnail preview (optional, per snapshot)

PR C - Compute blocks (operator-based, no arbitrary code)
- Chart: coords readout + grid overlay
- Curvature heatmap / principal directions
- Geodesic heat solver → polyline overlay

PR D - Navigation + teaching polish
- Left outline (headings + block list)
- Next stale/failed block navigation
- Export: Markdown/PDF report view + JSON
- Example workbook template (solved problem)

Workbook PRs (Notebook UX, Next)

PR1 — Real dependency graph + “stale” + cache

- Each block has typed inputs/outputs (even if hidden in UI).
- Compute blocks store inputHash → cached outputs.
- If an upstream block changes → downstream becomes STALE (badge + “Run from here”).
- Add “Run stage”, “Run all stale”, and a tiny status line: ✓ up to date / ⟳ stale / ✗ failed.
- This single PR makes everything else scale.

PR2 — Parameter controls inside blocks (sliders, pickers, scrub)

- Any block can expose params: gridDensity, geodesicCount, stepSize, seed, colormap range, etc.
- Add “scrub mode”: slider drag updates visualization live (throttled).
- Add “keyframes”: save a few param states and play them (mini animation).
- This is where “Math3D > Jupyter” starts to show.

PR3 — Interaction blocks (the killer feature)

- Add blocks that ask the user to do something in the viewer and output data:
- PickPoint → outputs Point3 + chart coords + tangent basis
- DrawCurve (polyline) → outputs PolylineSet
- SelectRegion (paint/brush on mesh) → outputs FaceSet or VertexMask
- PickDirection at point → outputs tangent vector
- Then Compute blocks consume these outputs: geodesics from picked point, transport along drawn curve, integrate divergence on selected region, etc.

PR4 — Visualize blocks control the viewer

- Capture current view (camera + toggles + selected overlays)
- Jump to view on block click
- Mini thumbnail preview (optional)

PR2 — Parameter controls inside blocks

Add params

- Add any block (Compute, Visualize, Interaction, etc.).
- In the block’s Parameters section, pick a param from Add param….

Scrub mode (live)

- Toggle Scrub mode on.
- Drag sliders → the view updates live (throttled).
- Turn scrub off to edit without updating, then click Apply params.

Keyframes

- Set desired params.
- Click Save keyframe.
- Click Play to cycle keyframes (mini animation). Click again to stop.
- Use Apply on a keyframe to jump to it. Delete removes it.

Currently available params

- graphResolution, paramResolution, implicitResolution
- implicitDomainSize
- wireframe, contours, chartGrid, probe
- colorMode, colorPalette
- selectionRadius

PR3 — Interaction blocks

Add an interaction block

- Add block → Interact.
- Choose type: Pick point, Draw curve, Select region, or Pick direction.

How to use interaction outputs

PickPoint → geodesic heat / path

1. Add two Interaction blocks set to Pick point, and capture two points.
2. Add a Compute block and choose Geodesic heat or Geodesic path.
3. Click Run operator. It will use the latest two PickPoint outputs upstream.

DrawCurve → curve overlay

1. Add an Interaction block set to Draw curve.
2. Click Arm pick, click on the surface to add points, then Finish curve.
3. Add a Compute block → Curve overlay and Run operator.

DrawCurve + PickDirection → parallel transport

1. Add an Interaction block set to Draw curve.
2. Click Arm pick, click on the surface to add points, then Finish curve.
3. Add an Interaction block set to Pick direction and capture a tangent direction (optional; falls back to curve tangent).
4. Add a Compute block → Parallel transport (curve) and Run operator.

SelectRegion → selection overlay

1. Add an Interaction block set to Select region.
2. Click Arm pick, select on the surface.
3. Add a Compute block → Selection overlay and Run operator.
4. Use Clear workbook selection to drop the overlay and return to normal selection.

PickDirection → direction overlay

1. Add an Interaction block set to Pick direction.
2. Click Arm pick to capture a point, then adjust the direction angle slider.
3. Add a Compute block → Direction overlay and Run operator.

Capture

- Click Arm pick, then click in the viewer.
- Pick point: captures point + normal + tangent basis (stored).
- Pick direction: captures point + tangent basis + direction angle.
- Draw curve: each click adds a point; click Finish curve when done.
- Select region: enable and click in viewer; selection mask is captured.

Clear

- Click Clear to reset the captured output.

What’s missing (not wired yet)

- Compute operators read PickPoint outputs for geodesic heat/path (latest two points).
- DrawCurve can drive the Curve overlay compute operator.
- SelectRegion can drive the Selection overlay compute operator.
- PickDirection can drive the Direction overlay compute operator.

If you want it to actually drive compute

PR3 — First 3 “killer” calculations (workbook suddenly feels real)

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

PR4 — Field calculus v1 (grad/div/Laplacian) + vector field viz

- `grad(scalar)` → tangent vector field
- `div(vector)` → scalar field
- `laplacian(scalar)` → scalar field
- Render: arrows (downsample), later streamlines

Done when

- Example: `K → grad(K)` renders sensible tangent arrows.

PR5 — Interaction-to-math: DrawCurve → Parallel transport

- Interaction block: `DrawCurve` outputs polyline on surface
- Compute: `parallelTransport(curve, initialVec)` outputs vectors along curve
- Render: vectors along curve + optional “twist” visualization

Done when

- You can demonstrate holonomy / transport effects in a workbook.



- Geodesic heat uses picked points as endpoints.
- Geodesic path uses picked points on the mesh.
- A new compute op: “Geodesics from picked point”.


Check stale detection + run-from-here

Open the Workbook tab.
Add:
an Interact block (Pick point) twice,
a Compute block set to Geodesic path,
another Compute block set to Curvature field.
Click Run operator on both compute blocks once (so they’re OK).
Change a parameter on a block (e.g., add a param to the Curvature block like colorMode and tweak it).
You should see downstream compute blocks marked STALE.
Click Run from here on the first stale compute block.
Only that block and downstream stale ones should re-run.
Upstream OK blocks should stay OK.


Cache hit badge + input hash tooltip
Log/timing panel per compute block
Mini “Cache hit” indicator in the Compute block header

## GitHub Release (Installer Assets)

This repository now includes `.github/workflows/release.yml` to publish Windows installers as GitHub Release assets.

How to publish a release:

1. Push a semver tag (for example: `git tag v1.0.0 && git push origin v1.0.0`).
2. GitHub Actions runs the `Release Installer` workflow on that tag.
3. The workflow builds and attaches:
   - `Math3D-Setup-<version>.exe`
   - `Math3D-<version>-win-portable.zip` (from `release/win-unpacked`, when available)
   - `SHA256SUMS.txt`
   - Optional builder metadata (`latest.yml`, `builder-debug.yml`)
4. Release notes are generated automatically by GitHub.

## Notice

Math3D  
Copyright 2026 expert10000

This product includes software and components developed for the Math3D project.

Third-party libraries, assets, fonts, icons, models, datasets, and other external materials
remain subject to their own respective licenses unless explicitly stated otherwise.

## License

This project is licensed under the Apache License 2.0.

Unless explicitly stated otherwise, the source code in this repository is covered by the
Apache-2.0 license.

Third-party libraries, assets, fonts, icons, models, datasets, screenshots, and other
externally sourced materials may be subject to separate licenses and are not automatically
relicensed under Apache-2.0.

See the `LICENSE` file for details.

## Third-party materials

Some non-code materials included in this repository may be provided under separate terms.
Where applicable, their original license and attribution should be preserved.

These materials are not assumed to be covered by the repository's main Apache-2.0 license
unless explicitly stated.


erification

npm --prefix renderer run test passed (24/24).
npm --prefix renderer run build passed.
If you want, I can continue immediately with phase 2:

make apps/web own real browser bootstrap (not proxy scripts),
start moving Electron main/preload ownership under apps/desktop/src.
