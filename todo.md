# TODO

## Tiny: Surface <-> Mesh representation map

Keep a short map of places where the app shows both dataset and mesh-object forms of the same surface.

### Current confirmed flow (Explicit / Saddle)
1. Source definition: `Surfaces > Explicit > Graph > Saddle graph`.
2. Derived dataset result: `dataset/surface-mesh` (for example Complex Map Sweep).
3. Converted mesh object: `Geometry > Procedural > Object` as detached/editable mesh object.

### UI consistency checklist (for each flow like above)
1. Scene tab: list both forms clearly (`DerivedResult` vs mesh object).
2. Object tab (Surfaces): show display/material controls even for derived dataset mesh.
3. Geometry Object panel: keep equivalent material/opacity controls for converted mesh object.
4. Labels/provenance: show `Source object` + `Operation` + conversion step.
5. Keep one canonical list of these dual representations in `todo.md` and update when new conversions are added.

## Real bundle thinning (not only warning suppression)

### Goal
Reduce the initial JavaScript payload by splitting heavy mode-specific code from `renderer/src/App.tsx` into lazily loaded modules, instead of only increasing `chunkSizeWarningLimit`.

### Why
Current production build has a large entry chunk (`assets/index-*.js` around 1.1 MB minified), which hurts startup parse/execute cost. The warning was silenced by raising the threshold, but the runtime cost is still there.

### Scope
1. Extract major app modes into separate modules (for example: Surfaces, Geometry, Topology, 2D Mobius/Chebyshev/maps).
2. Replace eager imports in `App.tsx` with `React.lazy(() => import(...))`.
3. Render lazy modules through `Suspense` with a small fallback (`Loading module...`).
4. Keep state/UX behavior unchanged after module load.

### Acceptance criteria
1. `npm --prefix renderer run build` succeeds.
2. No functionality regressions when switching modes.
3. Entry chunk (`assets/index-*.js`) is significantly smaller than baseline.
4. Heavy code is moved into dedicated async chunks (for example `mode-geometry-*`, `mode-surfaces-*`, etc.).

### Verification
1. Compare before/after build output chunk table.
2. Smoke test mode switching and first-load lazy fallback behavior.
3. Confirm each mode loads once and re-opens from cache without repeated UX disruption.

## Cloudflare deploy blocked by Git LFS quota

Use one of these:

### Immediate paid fix
1. Click `Manage budgets` on the Git LFS panel.
2. Set a Git LFS budget `> $0` (and ensure payment method is active).
3. In Cloudflare: open failed deploy -> `Manage deployment` -> `Retry deployment`.

### Free fix (wait)
1. Quota resets in about 19 days (around June 1, 2026).
2. Retry deploy after reset.

### Free immediate workaround (recommended for now)
1. Deploy from a branch that does not include LFS `data/` assets.
2. Prepare and push a `pages-deploy` branch, then switch Cloudflare Production branch to it.

## CGAL / VTK usage map

### CGAL is used in:
1. Implicit surface robust meshing pipeline (run/stop/health/version UI + job execution) in `renderer/src/App.tsx` (`runCgalMesh`, `handleRunCgalMesh`, `cgalHealthState` flow).
2. CGAL client wrapper in `renderer/src/services/cgalMeshClient.ts`.
3. Window bridge wiring for CGAL worker calls in `renderer/src/services/webWorkerProxyBridge.ts` (`window.cgalMesh`).
4. Implicit-surface downstream analysis that consumes CGAL mesh output in `renderer/src/App.tsx` (active CGAL mesh state, sampling/neighborhood, geodesic-related mesh token invalidation, mesh stats).

### Where CGAL appears in UI
1. `Surfaces` mode when viewer is `Implicit`, inside the left-panel workflow cards under `Analysis tools`.
2. The subsection titled `Robust meshing (CGAL)` with controls such as:
   `run mesh (CGAL)`, `stop worker`, target edge, auto edge, tri budget, radius bound, min tris, verbose, preflight samples.
3. Worker health/status badges and errors in the same implicit-analysis card (`available`, backend/protocol/log path, worker unavailable reasons).
4. The generated mesh then feeds downstream mesh inspection/geodesic tools and mesh stats in the inspector.

### What this means in Implicit viewer
1. `run preview (VTK)` = fast draft mesh for quick iteration while editing the implicit equation.
2. `run mesh (CGAL)` = robust/final mesh generation pass for stability and higher-confidence downstream analysis.
3. CGAL controls tune mesh quality/cost tradeoffs (`target edge`, `auto`, `tri budget`, `radius bound`, `min tris`, `verbose`, `preflight samples`).
4. After CGAL mesh generation, downstream mesh-dependent tools use that result (inspection stats, geodesic-related workflows, and exports).

### VTK is used in:
1. Surface mesh ops in `renderer/src/App.tsx` via `vtkCleanNormals`, `vtkDecimate`, `vtkSmooth`, `vtkPreviewImplicit`.
2. VTK mesh client wrapper in `renderer/src/services/vtkMeshClient.ts`.
3. VTK volume ops (slice, isosurface, distance field, streamlines) in `renderer/src/services/vtkVolumeClient.ts`.
4. Volume viewer execution path in `renderer/src/components/VolumeViewer.tsx` (`vtkVolumeSlice`, `vtkVolumeIsosurface`, `vtkVolumeStreamlines`, optional `vtkSmooth` post-process).
5. Window bridge wiring for VTK worker calls in `renderer/src/services/webWorkerProxyBridge.ts` (`window.vtkMesh`, `window.vtkVolume`).
6. UI controls/status for VTK operations and last-result inspector in `renderer/src/App.tsx`.



Shared pipeline: surface tools (curvature, geodesics, chart/pick) run on triangle meshes anyway.
Simpler state model: only surface | volume at dataset root in viewerTypes.ts.
Existing conversion flow: “surface mesh dataset -> detached mesh object” already exists in App.tsx.
When mesh should become a top object:
You want mesh-first workflows independent of surface semantics.
You want imported/edited meshes to be first-class (selection/history/ops/export) without going through “surface mode”.
You plan non-surface mesh types or broader geometry pipelines.
Recommendation for this codebase now: keep current model unless you’re committing to mesh-first UX.
If yes, I can draft a clean refactor to DatasetKind = "surface" | "mesh" | "volume" with minimal breakage



Analysis

1. Source
   - Surface definition
   - Current generated mesh
   - Mesh source: VTK preview / CGAL robust / imported / detached

2. Mesh quality
   - vertex count
   - triangle count
   - boundary edges
   - non-manifold edges
   - connected components
   - normal status
   - degenerate triangles

3. Differential geometry
   - mean curvature H
   - Gaussian curvature K
   - principal curvatures k1, k2
   - principal direction overlay
   - curvature heatmap

4. Geodesics
   - pick source point
   - pick target point
   - compute shortest path
   - distance field
   - geodesic isolines

5. Topology
   - Euler characteristic
   - orientability estimate
   - genus estimate
   - boundary loops
   - component count

6. Mesh operations
   - clean
   - smooth
   - decimate
   - recompute normals
   - detach mesh
   - export



   22222222222222222222222


   Differential Geometry Analysis

[Source]
  Object: current selected object
  Object type: implicit surface / parametric surface / mesh
  Analysis input: VTK preview mesh / CGAL robust mesh / detached mesh / analytic surface
  Mode: Auto / Fast Preview / Robust Mesh / Analytic
  Precheck: Run / Auto

[Scalar Curvatures]
  [x] Mean curvature H
  [x] Gaussian curvature K
  [ ] Principal curvature k1
  [ ] Principal curvature k2
  [ ] Shape index
  [ ] Curvedness

[Direction Fields]
  [x] Normals
  [ ] Principal direction 1
  [ ] Principal direction 2
  [ ] Asymptotic directions

[Feature Detection]
  [ ] Parabolic lines K = 0
  [ ] Ridges / crests
  [ ] Umbilic points
  [ ] High-curvature zones
  [ ] Flat zones
  [ ] Saddle zones

[Post-processing]
  Smoothing: none / light / medium
  Remesh before analysis: off / on
  Normalize scale: off / on
  Clamp outliers: off / on

[Output]
  Overlay: none / heatmap / isolines / glyphs
  Store result: temporary / save to scene
  Export: CSV / JSON / vertex attributes

[Run]
  Preview
  Accurate
  Save to scene


----- left panel

ifferential geometry

Computation
[x] Principal curvatures k1, k2
[x] Mean curvature H
[x] Gaussian curvature K
[x] Principal directions d1, d2
[ ] Umbilic / parabolic points
[ ] Shape operator
[ ] Normal variation

Display after compute
[x] Principal direction glyphs
[ ] Principal normal planes
[ ] Curvature heatmap
[ ] Curvature labels
[ ] Curvature line seeds

Sampling
Density: 1/100
Length: 0.40
Mode: d1 + d2

Quality
[Fast] [Balanced] [Accurate]

Actions
[Compute differential geometry]
[Clear overlay]
[Save as analysis result]


  ---- left panel

  Vector calculus

Scalar source
[ Height y ▼ ]

Options:
- Height x
- Height y
- Height z
- Radius r
- Distance from point
- Gaussian curvature K
- Mean curvature H
- Custom scalar field
- Texture / sampled value
- Signed distance / implicit f
- Geodesic distance

Operation
[Compute grad]
[Compute div]
[Compute curl]
[Compute Laplacian]

Vector source
[ None ▼ ]

Options:
- Surface gradient field
- Principal direction d1
- Principal direction d2
- Projected world vector
- Normal field
- Custom vector field
- Previous result

Display
[x] Show vector field overlay
[ ] Show magnitude heatmap
[ ] Show critical points
[ ] Show flow lines
[ ] Normalize arrows
[ ] Project vectors to tangent plane

Sampling
Density: 800
Scale: 1.0
Smoothing: 0.0

Actions
[Compute]
[Trace flow]
[Clear]
[Save vector field]

PR21, 22, 23 - shuul imp[lement full

Exactly: previously it was mostly not explicitly checked before tests.

What changed:

Until May 28, 2026 (07d6c05), test:app:* scripts did not run a dedicated Electron repair/check step first.
From May 28, 2026, pretest:... runs ensure:electron.
From May 29, 2026 (9e2fbdd), that check got a hard 10-minute timeout.
Why tests still used to pass:

npm ci usually installs Electron correctly, so no extra check was needed.
On runners where install was partial/corrupted/cache-odd, tests could still pass sometimes if Electron happened to be present enough.
The new ensure:electron made this explicit and deterministic, so now CI fails early instead of failing later or passing by luck

Implemented the PR27 continuation.
Added a shared core evaluator in constructionObjects.ts (line 1), exported through index.ts (line 1). It supports midpoint, line, parallel, perpendicular, circle, angle bisector, tangent, and normal construction definitions with dependency evaluation, invalid/broken-source status, and automatic recomputation from current source points.
Updated App.tsx (line 2378) so the procedural geometry panel can create, show/hide, select, and delete mathematical construction objects, and so their labels are included in viewer overlays.
Added focused tests in constructionObjects.test.ts (line 1), including the key GeoGebra behavior: move source point A, midpoint M recomputes.
Verification:
Passed: npx vitest run src/geometry/constructionObjects.test.ts
Filtered TypeScript check found no diagnostics for the new construction files or math-construction symbols.
Full npx tsc -p tsconfig.app.json still fails on many unrelated existing app errors, so I did not claim a clean full typecheck.