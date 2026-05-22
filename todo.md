# TODO

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
