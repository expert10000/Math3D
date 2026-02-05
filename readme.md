# Math3D

## Latest changes

- Added geodesic disk selection (heat-method + Dijkstra) with boundary extraction and disk stats (area/perimeter/phi).
- Added Volume viewer v0 with a toy voxel grid and slice preview (axis/index/opacity controls).
- Added true Volume Presets (sphere, torus, gyroid, metaballs) that sample F(x,y,z) into a volume grid with per-axis dims.
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
- Added curvature line streamlines that follow principal direction fields (d1/d2) with controls for field, seeding, and step limits.
- Added ridge/valley overlays (local extrema of k1/k2 along d1/d2) with thresholds for magnitude, contrast, and direction alignment.
- Added ridge/valley curve stitching (v2) that turns feature vertices into readable polylines with decimation and cap controls.
- Added geodesic disk selection (intrinsic radius) plus zoom-to-region controls in the selection panel.
- Added geodesic distance heatmaps for mesh-based heat paths on graph, parametric, and Weierstrass surfaces.

## Build the renderer into /dist

```bash
git clone https://github.com/expert10000/Math3D.git
cd Math3D
npm install
cd renderer
npm install
cd ..
```

```bash
npm run build
```

## Build

```bash
npm run build:main
npm --prefix renderer run build
```

```bash
npm run build
npm run dist
```

## Functionality

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

#### 4) Volume grids (experimental)

- Purpose: Preview scalar fields sampled on a voxel grid and inspect slices quickly.
- Rendering: A slice plane in three.js textured with a grayscale Image2D derived from the grid.
- Presets: Sphere, torus, gyroid (TPMS), and metaballs as true F(x,y,z) fields.
- Controls: Preset selector, grid dims (Nx, Ny, Nz), slice axis/index, and opacity in the left panel when Volume mode is active.
- Source: Volume grids are sampled client-side (no worker/VTK dependency yet).

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
- The UI shows idx, position, normal, and curvature scalars (K/H/k1/k2 when available).
- The Gauss map highlights the inspect normal direction, and the inspect marker stays until cleared.
- Inspect markers are placed at the exact click location while stats are sampled from the nearest mesh sample.

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

## Python setup

The Python worker powers CGAL meshing and the new VTK mesh ops. Install these into the
Python environment used by the app (set `MATH3D_PYTHON` if needed):

```bash
python -m pip install numpy scipy sympy pygalmesh vtk
```

## VTK implicit preview (fast)

The implicit viewer includes a **Preview (VTK)** button for a fast mesh pass before running CGAL:

- Uses VTK Flying Edges (or Marching Cubes) on a uniform grid.
- Uses the **implicit domain bounds** and **implicit resolution** controls.
- Optional decimation to a target face count for responsive previews.
- Returns a SurfaceMesh, so you can use all mesh tools immediately.

Note: the preview button appears under the **Implicit surface (custom)** block in the right panel.

## Latest changes (2026-01)

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

The compare mode provides a side-by-side view with synchronized cameras. This is useful for
studying variations between related surfaces, parameter choices, or expression tweaks.

Key behaviors:

- A leader view drives camera updates in the compare view.
- Both views share lighting/material settings for consistent analysis.
- Compare mode is available for implicit, graph, and parametric modes.

Examples of use cases:

- Compare a catenoid and a helicoid.
- Compare two graph expressions with only one parameter changed.
- Contrast implicit torus vs parametric torus.

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
