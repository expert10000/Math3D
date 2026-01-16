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
