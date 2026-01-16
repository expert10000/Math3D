# Code map: surface pipelines

This file mirrors the README "Code map (surface pipelines)" section and adds a little more
detail for code review and onboarding. Paths are workspace-relative.

## Shared render lifecycle (SurfaceViewer and ParamSurfaceViewer)

- `renderer/src/components/SurfaceViewer.tsx` and
  `renderer/src/components/ParamSurfaceViewer.tsx` each create a `THREE.WebGLRenderer`,
  `Scene`, `PerspectiveCamera`, and `OrbitControls` inside a main `useEffect`.
- Both start a render loop with `requestAnimationFrame` and render every frame.
- The dependency arrays at the end of each main `useEffect` control when the scene and
  geometry are rebuilt. For example, `SurfaceViewer` depends on `surfaceId`, expressions,
  resolutions, domain sizes, and material settings; `ParamSurfaceViewer` depends on
  `surfaceId`, domain bounds, param resolution, and Weierstrass inputs.
- `SurfaceViewer` also has a lighter-weight recolor effect that updates material properties
  and vertex colors without rebuilding geometry.
- Both viewers build a `SurfaceSampleSet` via
  `renderer/src/math/sampling/surfaceSampling.ts` right after geometry creation. Those
  samples drive Gauss map points, selection masks, and selection stats.

## 1) Implicit surfaces (f(x,y,z)=0)

- Render lifecycle: `renderer/src/components/SurfaceViewer.tsx` main `useEffect` rebuilds the
  implicit mesh when `surfaceId`, `implicitExpr`, `implicitResolution`, `implicitDomainSize`,
  or material options change (dependency list at the end of the effect).
- Geometry build: `makeImplicitSurface` in `renderer/src/components/SurfaceViewer.tsx` uses
  `MarchingCubes` and samples `f(x,y,z)` on an `implicitRes^3` grid, writes into
  `effect.field`, sets `effect.isolation = 0`, and calls `effect.update()`.
- Preset/custom expressions: `getImplicitFallback` and `implicitFnRef` in
  `renderer/src/components/SurfaceViewer.tsx`, parsed by `compileExpression` in
  `renderer/src/math/expression.ts` (shunting-yard parser with implicit multiplication).
- Normals and curvature: `sampleImplicitDerivatives`, `buildImplicitNormalLines`,
  `applyImplicitCurvatureColors`, and `computeImplicitPrincipalAtPoint` in
  `renderer/src/components/SurfaceViewer.tsx`. These use finite differences on the gradient
  and Hessian to estimate mean and principal curvature values.
- Probe projection: the implicit probe path (see the implicit probe effect in
  `renderer/src/components/SurfaceViewer.tsx`) iterates a Newton-style projection that
  uses `sampleImplicitDerivatives` to move the point onto the zero set.
- Contours and slicing: `marchingSquares` in `renderer/src/math/marchingSquares.ts` is used
  to intersect implicit slices and planes (see contour and slice effects in
  `renderer/src/components/SurfaceViewer.tsx`).
- Sampling: `renderer/src/math/sampling/surfaceSampling.ts` extracts positions/normals into
  `SurfaceSample` records for selection and Gauss map overlays.

## 2) Graph surfaces (z=f(x,y))

- Render lifecycle: built in the same `SurfaceViewer` `useEffect` as implicit surfaces,
  with updates triggered by `surfaceId`, `graphExpr`, `graphResolution`, or graph domain
  changes.
- Geometry build: `makeGraphGeometry` in `renderer/src/components/SurfaceViewer.tsx` creates
  a `ParametricGeometry` mapping `(u,v)` to `(x, z=f(x,y), y)`, keeping the graph domain in
  world z for consistent probing and slicing.
- Domain storage: graph meshes live in a group with `userData.__graph` (xSpan, ySpan) set in
  `renderer/src/components/SurfaceViewer.tsx`, so slice/contour tools can reuse the domain.
- Preset/custom expressions: graph presets are inline functions in
  `renderer/src/components/SurfaceViewer.tsx`; custom graphs compile via `compileExpression`
  in `renderer/src/math/expression.ts` and are stored in `graphFnRef`.
- Curvature coloring and probes: `applyCurvatureHeatToGraph` in
  `renderer/src/components/SurfaceViewer.tsx` computes Gaussian curvature via finite
  differences and log-compresses large values; probe invariants come from
  `renderer/src/math/surfaceInvariants.ts`.
- Contours and slicing: `buildGraphContours` in `renderer/src/math/contours.ts` and
  `marchingSquares` in `renderer/src/math/marchingSquares.ts` are called from
  `renderer/src/components/SurfaceViewer.tsx` to generate contour lines and plane
  intersections.
- Sampling: `renderer/src/math/sampling/surfaceSampling.ts` provides shared sample sets for
  selection, Gauss map, and histograms.

## 3) Parametric surfaces (sigma(u,v))

- Render lifecycle: `renderer/src/components/ParamSurfaceViewer.tsx` main `useEffect`
  rebuilds geometry when `surfaceId`, domain bounds, `paramResolution`, or custom
  expressions change.
- Geometry build: `paramFunc` is selected in the surface switch, wrapped to map `u,v` from
  [0,1] into domain bounds, and passed into `ParametricGeometry`. The geometry then calls
  `computeVertexNormals()` before rendering.
- Color mapping: `applyParamColoring` in `renderer/src/components/ParamSurfaceViewer.tsx`
  fills vertex colors for height/radius/curvature palettes.
- Custom parameter expressions: `makeSafeParamExpr` in
  `renderer/src/components/ParamSurfaceViewer.tsx` uses a guarded `new Function` wrapper.
- Curvature and principal directions: `computePrincipalCurvatureAtUV` in
  `renderer/src/math/principalCurvature.ts` plus helpers in
  `renderer/src/math/principalStreamlines.ts` and
  `renderer/src/math/curvatureDirections.ts` power the principal fields and streamlines.
- Slicing and sampling: `marchingSquares` is used for slice plane intersections in
  `renderer/src/components/ParamSurfaceViewer.tsx`; samples are built by
  `renderer/src/math/sampling/surfaceSampling.ts`.

## 4) Weierstrass minimal surfaces (g(z), phi(z))

- Render lifecycle: `renderer/src/components/ParamSurfaceViewer.tsx` calls
  `buildWeierstrassSurface` when `surfaceId === "weierstrass"`; rebuilds are triggered by
  `weierstrassGExpr`, `weierstrassPhiExpr`, `weierstrassResolution`, and domain changes.
- Build and integrate: `renderer/src/math/weierstrass.ts` compiles complex expressions,
  builds a grid of Phi vectors, integrates along u-first and v-first paths, and averages
  them to reduce drift. It reports `pathDisagreement` (avg/max) for diagnostics.
- Recenter/rescale: optional `recenterRescale` recenters to the grid bounding box and
  rescales the patch to a ~unit extent in `renderer/src/math/weierstrass.ts`.
- Parametric evaluation: `buildWeierstrassSurface` returns a `paramFunc` that bilinearly
  interpolates the precomputed grid (`bilerp`) for smooth sampling.
- Complex expression parsing: `renderer/src/math/complexExpr.ts` and `renderer/src/math/complex.ts`.
- Path drift diagnostics: `computeWeierstrassDrift` in `renderer/src/math/weierstrass.ts`
  integrates Phi around the domain boundary; `renderer/src/components/ParamSurfaceViewer.tsx`
  draws the drift arrow using the returned vector.

## Feature systems (analysis and overlays)

### Sampling and selection masks

- Sample extraction: `renderer/src/math/sampling/surfaceSampling.ts` walks geometry buffers
  and builds `SurfaceSampleSet` with positions, normals, optional UVs, and mesh data.
- Selection mask: `renderer/src/math/selection/selectionModel.ts` implements region
  selection for world-space disks, UV disks, and Gauss caps via dot product thresholds.
- Viewer overlays: `renderer/src/components/SurfaceViewer.tsx` and
  `renderer/src/components/ParamSurfaceViewer.tsx` render selection overlays as `THREE.Points`
  using the computed mask.

### Gauss map (S^2) and density inset

- Gauss map data: the viewers pass sample normals through `onGaussPoints`, and
  `renderer/src/components/GaussMapPanel.tsx` visualizes them as points on the sphere.
- Coloring modes: `renderer/src/components/GaussMapPanel.tsx` supports component coloring
  and palette-based coloring; see `renderer/src/components/gaussMapUtils.ts` for the shared
  `GaussPoint` type.
- Gauss-cap selection: `renderer/src/components/GaussMapPanel.tsx` emits Gauss cap picks
  that become `SelectionMode="gaussCap"` in
  `renderer/src/math/selection/selectionModel.ts`.
- Density heatmap: `renderer/src/math/selection/gaussDensity.ts` bins normals in
  (theta, phi) with optional smoothing and normalization; the panel renders the grid to a
  small canvas.

### Curvature, principal fields, and glyphs

- Principal curvature: `renderer/src/math/principalCurvature.ts` computes fundamental forms
  from finite differences, builds the shape operator, and extracts k1/k2 + directions.
- Implicit principal curvature: `computeImplicitPrincipalAtPoint` in
  `renderer/src/components/SurfaceViewer.tsx` uses the implicit Hessian projected to the
  tangent basis for k1/k2 and directions.
- Principal glyphs: the viewers sample principal directions at points and draw line
  segments (see `principalGlyphsRef` effects in both
  `renderer/src/components/SurfaceViewer.tsx` and
  `renderer/src/components/ParamSurfaceViewer.tsx`).

### Curvature line streamlines

- Streamline tracing: `renderer/src/math/curvatureLines.ts` traces paths along a direction
  field with neighbor matching, min-cos thresholds, and loop protection.
- Adjacency: `buildVertexAdjacency` in `renderer/src/math/curvatureLines.ts` builds mesh
  neighbor lists (index-based or spatial hashing for non-indexed meshes).
- Rendering: both viewers assemble segments with `buildStreamlineSegments` and draw them
  as `THREE.LineSegments` when "Curvature lines" is enabled.

### Ridges and valleys

- Feature detection: `renderer/src/math/ridgeValley.ts` looks for extrema of k1/k2 along d1/d2
  using neighbor pairs aligned to the principal directions.
- Stitching: `renderer/src/math/ridgeValleyStitch.ts` links feature vertices into polylines,
  supports min-cos linking, confidence thresholds, decimation, and smoothing.
- Viewer integration: `renderer/src/components/SurfaceViewer.tsx` and
  `renderer/src/components/ParamSurfaceViewer.tsx` create ridge/valley segments or stitched
  curves based on the current toggle settings.

### Geodesics and intrinsic selection

- Parametric geodesics: `renderer/src/math/geodesic.ts` computes Christoffel symbols from
  finite-difference metric coefficients and integrates with RK4. It supports wrapping and
  speed renormalization; used by `renderer/src/components/ParamSurfaceViewer.tsx`.
- Geodesic disk selection: `renderer/src/math/selection/geodesicGraph.ts` builds a weighted
  adjacency graph from mesh triangles (merging near-duplicate vertices), then
  `dijkstraDistancesAndPrev` computes intrinsic distances. `renderer/src/math/selection/geodesicSelection.ts`
  wraps the Dijkstra call for the selection panel.
- Geodesic path rendering on meshes: the viewers render `geodesicPathIndices` as a line in
  `renderer/src/components/SurfaceViewer.tsx` and
  `renderer/src/components/ParamSurfaceViewer.tsx`.

### Selection stats and histograms

- Stats engine: `renderer/src/math/selection/selectionStats.ts` computes counts, bbox, mean
  normals, and curvature statistics (K/H/k1/k2), plus optional histograms.
- UI panel: `renderer/src/components/SelectionStatsPanel.tsx` renders the stats table and
  histogram.

### Slicing and contours

- Marching squares: `renderer/src/math/marchingSquares.ts` is the core for plane intersections
  and contours in both viewers.
- Graph contours: `renderer/src/math/contours.ts` builds contour polylines for z = f(x,y).
- Slice preview: `renderer/src/components/Slice2DPreview.tsx` renders a 2D overlay of slice
  polylines for interactive inspection.

### Probe and inspect markers

- Surface probes: both viewers use a `Raycaster` to pick points and then draw markers,
  normals, and tangent planes in `renderer/src/components/SurfaceViewer.tsx` and
  `renderer/src/components/ParamSurfaceViewer.tsx`.
- Inspect mode: `inspectPoint` is rendered as a persistent marker in both viewers, and the
  linked normal is sent to the Gauss map panel when enabled.
