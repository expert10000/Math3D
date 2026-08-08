# TODO

## Checked backlog from August 8, 2026

### Verification before next release
1. Run the full fast verification pass:
   - `npm run typecheck:noemit`
   - `npm run test:app:startup:smoke`
   - `npm run test:app:e2e:fast`
2. Confirm Electron still launches cleanly after verification.
3. Review untracked local files and decide what should be committed, ignored, archived, or removed.

### Release notes and version hygiene
1. Update `RELEASE_NOTES.md` for `1.4.9`; the package version is already `1.4.9` while the current release notes still start at `1.4.8`.
2. Add current known limitations:
   - renderer memory spike during Surfaces gallery warmup,
   - remaining Three.js viewer lifetime cleanup,
   - mobile Phase 5 device matrix still pending.

### Renderer size and startup performance
1. Split heavy mode-specific code out of `renderer/src/App.tsx`.
2. Lazy-load major modes with `React.lazy` and `Suspense`.
3. Compare production build chunks before and after the split.
4. Keep mode switching behavior unchanged.

### Three.js memory and viewer lifetime cleanup
1. Audit scene/viewer transitions for undisposed geometry, materials, textures, controls, workers, timers, and listeners.
2. Re-run Surfaces gallery memory profile after cleanup.
3. Reduce peak renderer RSS during early gallery warmup.
4. Add regression coverage for repeated open/render/close cycles.

### Differential geometry feature completion
1. Finish principal curvatures `k1` and `k2`.
2. Finish principal direction fields `d1` and `d2`.
3. Add shape index and curvedness.
4. Add feature detection:
   - parabolic lines,
   - ridges / crests,
   - umbilic points,
   - high-curvature, flat, and saddle zones.
5. Improve outputs:
   - heatmap,
   - isolines,
   - glyphs,
   - labels,
   - save analysis result,
   - export CSV / JSON / vertex attributes.

### Vector calculus panel
1. Add scalar source choices:
   - height x/y/z,
   - radius,
   - distance from point,
   - Gaussian curvature,
   - mean curvature,
   - custom scalar field,
   - sampled texture/value,
   - signed distance / implicit function,
   - geodesic distance.
2. Add operations:
   - gradient,
   - divergence,
   - curl,
   - Laplacian.
3. Add vector source choices:
   - surface gradient field,
   - principal directions,
   - projected world vector,
   - normal field,
   - custom vector field,
   - previous result.
4. Add displays:
   - vector field overlay,
   - magnitude heatmap,
   - critical points,
   - flow lines,
   - normalized arrows,
   - tangent-plane projection.

### Construction object operations
1. Add an explicit Operations group inside Construction Objects.
2. Enable it for selected construction objects, faces, edges, or geometry objects.
3. Include actions:
   - rename,
   - duplicate,
   - convert,
   - project,
   - extend,
   - trim,
   - offset,
   - align,
   - mirror,
   - copy.
4. Keep these discoverable instead of scattering them across Object, Transform, and Construct panels.

### Mobile Phase 5 release readiness
1. Run the full Android/iOS device smoke matrix in `docs/mobile-phase5-stability-checklist.md`.
2. Archive logcat and iOS crash logs from the full matrix run.
3. Verify no blocker crashes in launch/viewer flow.
4. Verify backend failure retry paths and actionable diagnostics on device.
5. Confirm Android GL fallback is only used when explicitly configured.
6. Get engineering and QA signoff before external distribution.

### Backend/proxy diagnostics polish
1. Improve UI handling when worker diagnostics proxy is not running.
2. Make the backend/proxy status less noisy in dev logs.
3. Ensure users see a clear recovery path for:
   - backend not running,
   - wrong backend URL,
   - worker timeout,
   - incompatible worker protocol.

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

PR28 — Dependency Graph + Live Recompute

PR29 — Constraints

Add relationships:

The next clean step is to add an Operations group inside Construction Objects, enabled when a construction object/face/edge/object is selected:

Construction Objects
├─ Create by type
├─ Relationships
├─ Operations
   Rename
   Duplicate
   Convert
   Project
   Extend
   Trim
   Offset
   Align
   Mirror
   Copy
That would make these explicit instead of hidden across Object/Transform/Construct.

12:25 PM
