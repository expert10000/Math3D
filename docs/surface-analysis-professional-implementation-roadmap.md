# Surface Analysis professional implementation roadmap

Assessment date: 2026-09-11

Reviewed checkout: `93d0d7d` — test: stabilize slow CI memory profile

Planning source: supplied Surface-module consolidation brief

The numbered commits below are implementation plans, not claims that corresponding Git commits are complete. The roadmap consolidates the existing Surfaces functionality into one professional Surface Analysis workflow while preserving a strict distinction between a smooth/represented surface and its discrete mesh.

## Product boundary

**Surface Analysis owns the mathematics of the smooth or represented surface. Mesh Analysis owns the mathematics, quality, topology, and processing of its discretization.**

A tessellation generated from a surface is a provenance-linked derived representation, not a second unrelated object and not a reason to duplicate Mesh Analysis inside Surfaces.

| Surface Analysis owns | Mesh Analysis owns |
| --- | --- |
| Surface point, tangent plane, and normal field | Triangle and polygon quality |
| First and second fundamental forms | Aspect ratio, scaled Jacobian, and bad-element selection |
| Exact/sampled Gaussian and mean curvature | Discrete curvature diagnostics |
| Principal curvatures and directions | Connectivity, components, boundaries, and non-manifold edges |
| Smooth geodesics and normal curvature | Graph/heat/CGAL paths on a mesh |
| Surface charts and parameter-domain diagnostics | Mesh parameterization and UV quality |
| Smooth singularities, umbilics, ridges, and valleys | Creases, defects, repair, and validation |
| Analytic or representation-aware probes | Vertex/edge/face mesh probes |
| Surface-domain sampling and tessellation intent | Smoothing, decimation, remeshing, VTK, and CGAL processing |

The Surfaces module may show a compact summary of its derived mesh and launch shared backend actions, but detailed mesh analysis and processing remain in Mesh.

## Preservation rule

The consolidation is additive until parity is verified. Existing entry points and capabilities remain reachable throughout the roadmap:

- Explicit, implicit, parametric, spline/NURBS, constructed, Weierstrass, and mesh-backed surface families.
- Object and scene galleries, presets, formulas, custom expressions, domains, and sampling controls.
- Surface editor, viewport controls, responsive drawers/sheets, presentation modes, and Workbook handoffs.
- Curvature coloring, normals, tangents, principal directions, curvature lines, ridges, valleys, contours, Gauss map, chart grid, probes, and selections.
- Graph, parameter-space, heat, surface, and disk geodesic workflows.
- Surface calculus, feature extraction, diagnostics, comparisons, exports, histories, and saved state.
- Existing Promote to SurfaceMesh, Bake to Mesh, Geometry handoff, VTK, CGAL, and worker-backed operations until their replacement workflows pass parity tests.

Controls may be renamed, moved, merged, or retired only after the replacement covers the same workflow and the decision is recorded in this roadmap or the final workflow freeze.

## Current implementation assessment

The Surfaces module already has a broad functional base:

- The main workspace supports explicit graphs, implicit level sets, parametric surfaces, spline patches, NURBS, rotational/constructed surfaces, Weierstrass surfaces, and mesh datasets.
- Surface viewers expose graph/parameter/implicit probes, normals, tangent planes, tangent directions, principal directions, curvature lines, ridge/valley overlays, contours, chart grids, Gauss maps, and selection overlays.
- `surfaceInvariants.ts`, `principalCurvature.ts`, and viewer-local evaluators calculate graph and parametric differential quantities; Geometry also has a tested exact-surface engine and shared analysis pipeline that must be reused rather than duplicated.
- `chartGridDiagnostics.ts` reports chart orientation, degeneracy, and cell diagnostics.
- Continuous graph and parametric geodesic solvers, mesh heat/graph paths, and geodesic disks already exist.
- Surface-feature extraction, principal streamlines, ridge/valley extraction/stitching, surface calculus, and Mesh differential geometry are implemented, although ownership and provenance are not yet consistently visible.
- The right-side Surface Inspector already has Object, Result, Selection, Probe, Analysis, Diagnostics, History, and warning concepts. Local readouts include position, chart coordinates, normal, tangent/principal directions, K, H, k1, k2, shape index, curvedness, and warnings.
- `bakeSurface.ts` can tessellate several surface representations to `SurfaceMeshData`; source kinds distinguish explicit, implicit, parametric, Weierstrass, imported, detached, and Geometry-derived meshes.
- Surface and Mesh workflows already share preview/full-mesh caches, selection infrastructure, workers, validation, VTK/CGAL clients, and Geometry↔Mesh navigation.
- Responsive Surface drawers, formula-editor sheets, touch containment, surface functional E2E, Gallery checks, release checks, and memory profiles already protect important UI paths.

The main gaps are architectural rather than a lack of controls:

- Surface results do not yet use one representation-neutral, revision-safe result contract.
- Analytic, numerical, sampled, and mesh-derived methods are not consistently distinguished in the UI and saved provenance.
- Surface computation controls and overlay visibility controls are duplicated across the left panel, viewport toolbar, and Inspector.
- `SurfacesLeftPanel`, `SurfacesRightPanel`, and their `App.tsx` wiring still carry substantial Mesh-specific state and operations.
- `SurfaceMeshSource` records broad origin kinds but not a canonical surface ID, source revision, tessellation settings, parameter correspondence, or complete regeneration history.
- Promote, bake, and handoff actions overlap semantically and do not yet present the simple live-mesh/snapshot/open-in-analysis model.
- Existing memoization and worker paths do not form one dependency-aware Surface Analysis cache with stale/cancelled/failed result states.
- Mathematical truth cases are scattered rather than governed by one Surface Analysis acceptance command and workflow freeze.

Baseline verification at this assessment:

- **19 focused mathematical tests across 4 files** pass for exact surface analysis, spline surfaces, chart diagnostics, and geodesic graph behavior.
- The current repository checkpoint has **530 renderer tests across 99 files** passing.
- Existing Playwright coverage includes Surface functional workflows, Gallery visuals, responsive layouts, navigation, worker failures, persistence-related paths, release preset walks, and long-running memory checks.
- The complete slow application suite passes after the current checkout's CI memory-profile stabilization.

## Implementation progress

| Plan | Status | Existing foundation | Main work remaining |
| --- | --- | --- | --- |
| 1 — Surface-first workspace and result contract | Complete (`bb0b24a`) | Canonical Surface identity/revision, all representation adapters, shared request/result publication, typed payloads, compact persistence, visible contract provenance | None for Commit 1 |
| 2 — Unified differential-geometry engine | Complete (`9c0ddfc`) | One normalized differential point/field schema, exact Geometry reuse, analytic/symbolic/AD and adaptive numerical routes, explicit mesh provenance, masks and mathematical verification | None for Commit 2 |
| 3 — Computation/display/inspection UI split | Complete (`bdd5bb2`) | Left computation catalog, View/viewport display controls, right Result/Probe/Provenance/History Inspector, compact derived-mesh bridge and collapsed compatibility tools | None for Commit 3 |
| 4 — Curvature workspace | Advanced foundation | K/H/k1/k2 fields, directions, palettes, ranges, probes, classifications in adjacent code | Canonical saved result, statistics, classifications, direction validity, independent visualization |
| 5 — Local differential-geometry probe | Advanced foundation | Point/normal/chart coordinates, tangent basis, curvature and direction readouts | Full I/II forms, method/provenance, classification, visual osculating evidence, pins/history/export |
| 6 — Surface curves and features | Partial | Geodesics, curvature lines, ridges/valleys, feature extraction, overlays | Surface-owned method routing, persistent result layers, visibility independence, saved lifecycle |
| 7 — Charts and parameter diagnostics | Partial | Chart grid, orientation/degeneracy diagnostics, graph/param domains | Metric/Jacobian fields, distortion, boundary/degenerate regions, Inspector results, future atlas contract |
| 8 — Provenance-linked derived SurfaceMesh | Partial | Baking, `SurfaceMeshData`, source kinds, preview/full mesh caches | Source ID/revision/settings, UV correspondence, live/snapshot states, stale/regenerate/detach, persistence |
| 9 — Live mesh, bake, and Mesh Analysis handoff | Partial | Promote, Bake to Mesh, Geometry/Mesh navigation | Three unambiguous actions, direct Mesh Analyze opening, selection/camera transfer, reverse navigation |
| 10 — VTK/CGAL derived-mesh bridge | Partial | Shared workers/clients and extensive Mesh VTK/CGAL workflow | Compact Surface bridge, backend variants/provenance, no duplicated advanced Mesh panels |
| 11 — Workers, cache, and performance | Partial | Viewer memoization, mesh workers, cancellation patterns, preview/full LOD | Surface request scheduler, dependency cache, revision guards, progressive fields, budgets and profiling |
| 12 — Regression matrix and workflow freeze | Partial | Focused math tests, Surface E2E, Gallery/release/responsive/memory checks | Canonical truth gallery, pathological cases, maintained acceptance command, full journeys and v1 freeze |

Progress entries receive a Git hash only after the relevant focused tests, typecheck, production build, and required E2E/backend checks pass.

## Target architecture

```text
Surface definition
├── Explicit z = f(x,y)
├── Implicit F(x,y,z) = 0
├── Parametric r(u,v)
├── Spline / NURBS
├── Constructed
└── Weierstrass
        │
        ▼
Canonical Surface representation + identity + revision
        │
        ├──────────────────────────────┐
        ▼                              ▼
Surface Analysis                  Tessellation
smooth/represented mathematics    Derived SurfaceMesh
        │                              │
        ├── differential geometry      ├── live preview
        ├── curves and features        ├── baked snapshot
        ├── charts and distortion      ├── robust/backend variant
        ├── probes                     └── Open in Mesh Analysis
        └── saved results                       │
                                                ▼
                                  quality / topology / VTK / CGAL
```

The canonical Surface layer owns identity and meaning. The derived mesh records its source and mapping. Mesh results never masquerade as exact Surface results.

## Canonical contracts

Commit 1 should define a domain payload carried by the existing shared `AnalysisRequest`/`AnalysisResult` infrastructure, not create a second generic result store.

```ts
type SurfaceRepresentation =
  | "explicit"
  | "implicit"
  | "parametric"
  | "spline"
  | "constructed"
  | "weierstrass"
  | "mesh-backed";

type SurfaceMethod =
  | "analytic"
  | "symbolic"
  | "automatic-differentiation"
  | "numerical-derivatives"
  | "surface-sampling"
  | "mesh-approximation"
  | "vtk"
  | "cgal";

type SurfaceAnalysisPayload = {
  surfaceId: string;
  surfaceRevision: number;
  representation: SurfaceRepresentation;
  domain: unknown;
  sampling: unknown;
  differential?: {
    position?: unknown;
    normals?: unknown;
    tangentBasis?: unknown;
    firstFundamentalForm?: unknown;
    secondFundamentalForm?: unknown;
    meanCurvature?: unknown;
    gaussianCurvature?: unknown;
    principalCurvatures?: unknown;
    principalDirections?: unknown;
  };
  features?: unknown;
  geodesics?: unknown;
  charts?: unknown;
  meshLink?: DerivedSurfaceMeshIdentity;
};
```

Every published result must additionally retain the shared result fields for request parameters, engine/method, units, timing, warnings, source revision, dependency revisions, cache state, and payload. If a field comes from a mesh approximation, that method must be visible in both the Inspector and exports.

## Mathematical conventions to freeze

For a regular parametric surface `r(u,v)`, the canonical engine computes

```text
rᵤ, rᵥ, rᵤᵤ, rᵤᵥ, rᵥᵥ
E = rᵤ·rᵤ       F = rᵤ·rᵥ       G = rᵥ·rᵥ
L = -rᵤᵤ·n      M = -rᵤᵥ·n      N = -rᵥᵥ·n
det(g) = EG - F²
K = (LN - M²) / det(g)
H = (EN - 2FM + GL) / (2 det(g))
k₁,₂ = H ± sqrt(max(0, H² - K)), with k₁ ≥ k₂
```

Math3D uses `IIᵢⱼ = -⟨rᵢⱼ,n⟩`, matching the existing exact Geometry evaluator and giving positive curvature to an outward-oriented sphere. The result records the chosen unit normal and orientation convention because reversing `n` reverses H, k1, and k2 while preserving K. Principal directions are line fields, so their sign is not meaningful; continuity code may flip signs for display but must not present that choice as new mathematics.

Explicit graphs are normalized to a parametric adapter. Implicit surfaces are regular only where `∇F ≠ 0`; gradient/Hessian formulas may supply their local forms and curvatures, but critical points must be marked singular. Near-zero metric determinant, invalid derivatives, boundaries, periodic seams, and finite-difference truncation must produce explicit masks/warnings rather than fabricated finite values.

## UI responsibility freeze target

The target layout should follow the Mesh and Geometry professional shells while remaining Surface-specific:

```text
Surfaces
├── Panel: Scene | Object | View | Analysis | Services | Theory
├── Actions: Gallery | New | Demo | Compare | More
└── Tools: Define | Edit | Analyze | Navigate

left   = what to define or compute, target, domain, sampling, parameters
center = the Surface, semantic selection, previews, overlays, camera
right  = object, result, selection, probe, diagnostics, provenance, history
```

The left Analysis panel chooses computations:

- Differential geometry: curvature, principal directions, fundamental forms.
- Surface curves: geodesics, principal curvature lines, asymptotic curves, level curves.
- Surface features: ridges, valleys, umbilics, parabolic curves, singularities.
- Charts: parameterization, Jacobian/metric determinant, orientation, distortion.
- Derived Mesh: tessellation status and Mesh Analysis handoff.

The viewport toolbar controls visibility only: Surface, wireframe, grid, normals, tangents, principal directions, curvature lines, geodesics, feature curves, slice, and Gauss map. Visibility changes must never recompute analysis.

The right Inspector explains Object, Result, Selection, Probe, Analysis, Diagnostics, Provenance, and History. It owns local values and saved-result lifecycle, not computation parameter forms.

## Commit 1 — Surface-first analysis workspace and result contract

Planned message: `refactor(surface-analysis): define surface-first analysis workspace and result contract`

**Status: complete — `bb0b24a`.**

Already implemented:

- Multiple representation-specific surface viewers, editors, domains, and sampling controls.
- Domain-neutral shared analysis registry/result-store infrastructure from the Mesh and Geometry roadmaps.
- Exact-surface results in the Geometry pipeline and extensive Surface Inspector concepts.
- Persisted workspace and scene infrastructure.
- Canonical contracts define Surface identity, revision, representation, domain, sampling, units, orientation, method provenance, requests, inspection, and domain-specific result payloads.
- Explicit, implicit, parametric, spline/NURBS, constructed, Weierstrass, and mesh-backed adapters publish through the existing generic analysis registry and result store.
- Definition fingerprints advance per-Surface revisions only when source, domain, sampling, or representation data changes; publishing a new revision marks older lineage results stale.
- The Surfaces Analysis panel displays the active canonical ID, representation, revision, result state, method, units, orientation, dependency count, warnings, and shared computation-history count.
- A versioned Surface Analysis workspace document persists canonical definitions and lightweight saved-result references without copying typed field arrays into scene or local-storage state.

Remaining:

- [x] Define canonical `SurfaceIdentity`, `SurfaceRevision`, `SurfaceRepresentation`, domain, units, orientation, and sampling contracts.
- [x] Add adapters for explicit, implicit, parametric, spline/NURBS, constructed, Weierstrass, and mesh-backed surfaces.
- [x] Define Surface result kinds and dependencies in the shared analysis registry.
- [x] Publish Surface results through shared revision-safe requests/results, caching, stale-state, cancellation, and history semantics.
- [x] Define domain-specific payloads for pointwise values, scalar/vector fields, curves, features, charts, and derived meshes.
- [x] Record method provenance as analytic, symbolic, automatic differentiation, numerical derivatives, surface sampling, mesh approximation, VTK, or CGAL.
- [x] Version and persist Surface definitions, saved results, and result references without copying large typed arrays into unrelated scene state.
- [x] Add contract tests proving that the shared core imports neither Surface nor Mesh implementation code.

Validation at `bb0b24a`:

- **10 focused Surface contract and persistence tests across 2 files** pass.
- The full renderer suite passes: **519 tests across 98 files**.
- `npm run typecheck:noemit`, `npm run build:core`, and the final production renderer build pass.
- Required Surface functional, Gallery, worker-failure, and workspace-navigation E2E checks pass: **12/12**; the final Surface startup smoke also verifies visible contract provenance and persisted canonical definitions.
- `npm run test:app:responsive:smoke` passes for phone portrait, phone landscape, tablet, and desktop layouts.

Acceptance: every Surface family can issue the same canonical analysis request and publish a revision-bound result whose representation, method, units, warnings, and dependencies are inspectable.

## Commit 2 — Unified differential-geometry computation pipeline

Planned message: `feat(surface-analysis): add unified differential-geometry computation pipeline`

**Status: complete — `9c0ddfc`.**

Already implemented:

- Numerical graph derivatives and E/F/G, second-form coefficients, K, H, k1, and k2.
- Parametric principal-curvature and direction machinery in the Surface viewers.
- Tested exact parametric surface analysis in Geometry.
- Mesh differential geometry for explicitly discrete fallbacks.
- A single representation-neutral dispatcher now produces the same differential point schema for exact, explicit graph, general parametric, implicit, spline/constructed/Weierstrass-compatible parameter evaluators, and mesh-backed inputs.
- Exact Geometry definitions are reused directly; implicit sources prefer supplied analytic, symbolic, or automatic-differentiation gradient/Hessian data, then use adaptive finite differences when derivatives are unavailable.
- Field publication aligns parameters, positions, first/second derivatives, normals, fundamental forms, shape operators, K/H/k1/k2, principal directions, and six validity masks in one typed payload.
- Mesh-backed inputs and payloads are forced to `mesh-approximation` provenance and cannot be presented as analytic Surface mathematics.

Remaining:

- [x] Normalize all representation adapters to position, first derivatives, second derivatives, normal, metric, shape operator, and validity metadata.
- [x] Reuse exact definitions from Geometry where the same analytic source exists.
- [x] Select exact/symbolic/automatic differentiation first, then documented adaptive numerical derivatives, then explicit sampled or mesh fallbacks.
- [x] Compute `E`, `F`, `G`, `L`, `M`, `N`, metric determinant, shape operator, `K`, `H`, ordered `k1 ≥ k2`, and valid principal directions.
- [x] Define the normal orientation and mean-curvature sign convention per representation and preserve it in result metadata.
- [x] Handle implicit surfaces through gradient/Hessian formulas away from critical points; mark zero-gradient points singular rather than silently sampling a normal.
- [x] Emit per-sample validity, uncertainty, boundary, degeneracy, singularity, and umbilic masks.
- [x] Verify identities `K = k1·k2` and `H = (k1+k2)/2`, refinement behavior, orientation reversal, units, and exact-versus-sampled error.

Validation at `9c0ddfc`:

- **21 focused Surface computation, contract, and persistence tests across 3 files** pass.
- The full renderer suite passes: **530 tests across 99 files**.
- `npm run typecheck:noemit` and `npm run build:core` pass.
- Required Surface functional, Gallery, worker-failure, and workspace-navigation E2E checks pass: **12/12**.
- `npm run test:app:responsive:smoke` passes for phone portrait, phone landscape, tablet, and desktop layouts.

Acceptance: the same Surface result schema describes correct differential geometry for every representation, with visible fallbacks and no mesh estimate labeled analytic.

## Commit 3 — Separate computation, visualization, and inspection controls

Planned message: `refactor(surface-ui): separate analysis computation, visualization and inspection controls`

**Status: complete — `bdd5bb2`.**

Already implemented:

- Left, center, and right Surface regions with responsive drawer behavior.
- Panel/Action/Tool navigation and Inspector tabs.
- Many analysis and overlay controls, currently spread across several locations.
- The left Analysis panel now starts with a representation-neutral computation catalog for differential geometry, curvature, probes, curves, features, and chart diagnostics.
- The View panel and mesh analysis viewport toolbar are explicitly identified as display-only regions; computation no longer contains “show after compute” coupling.
- The right Inspector owns the canonical result contract plus Result, Probe, Provenance, and History views, including method, backend, warnings, saved references, units, orientation, and dependencies.
- A compact Derived SurfaceMesh bridge replaces detailed Mesh/backend controls in the primary Surface Analysis view; all prior controls remain reachable in one collapsed compatibility section.
- Surface-specific computation and Inspector UI now live in an extracted component instead of adding more rendering responsibility to `App.tsx`.

Remaining:

- [x] Move computation choices and parameters into the left Analysis panel.
- [x] Keep overlay visibility, density, glyph size, opacity, line width, palettes, and Gauss-map layout in the viewer toolbar or View panel.
- [x] Keep scientific values, warnings, provenance, saved state, and history in the right Inspector.
- [x] Replace “show after compute” coupling with independent compute and visibility state.
- [x] Extract Surface-specific controllers/components from the oversized `App.tsx` prop surfaces without changing behavior.
- [x] Remove detailed Mesh Analyze, VTK, and CGAL controls from ordinary Surface Analysis; replace them with a compact Derived Mesh bridge.
- [x] Preserve all legacy entry points in expandable groups until parity E2E passes.
- [x] Verify keyboard order, labels, focus return, narrow layouts, drawers, sheets, and touch containment.

Validation at `bdd5bb2`:

- The full renderer suite passes: **530 tests across 99 files**.
- `npm run typecheck:noemit` and `npm run build:core` pass.
- The Surface functional flow passes **3/3**, including the computation/display/inspection responsibility split, keyboard order, accessible expanded state, canonical provenance, generation, and invalid input.
- Required Surface functional, Gallery, worker-failure, and workspace-navigation E2E checks pass: **12/12**.
- `npm run test:app:responsive:smoke` passes for phone portrait, phone landscape, tablet, and desktop layouts, including drawers, sheets, and touch containment.

Acceptance: users can predict where to compute, where to display, and where to inspect; the same action is not presented with conflicting semantics in multiple regions.

## Commit 4 — Curvature fields and principal directions

Planned message: `feat(surface-analysis): consolidate curvature fields and principal-direction analysis`

**Status: planned; field computation and display foundations exist.**

Already implemented:

- K, H, k1, k2, principal direction, shape-index, and curvedness values in current Surface/Mesh paths.
- Palettes, ranges, heatmaps, glyphs, lines, probes, and some classifications.

Remaining:

- [ ] Publish one Curvature result with H, K, k1, k2, d1, d2, validity/uncertainty masks, and method provenance.
- [ ] Add min, max, mean, RMS, percentiles, histogram, extrema, valid-domain count, and unit metadata.
- [ ] Classify elliptic, hyperbolic, parabolic, planar/flat, and umbilic regions with scale-aware tolerances.
- [ ] Treat principal directions as undefined at umbilics and unstable near degeneracy; never display arbitrary glyphs as valid directions.
- [ ] Separate scalar field selection/range/palette and vector overlay visibility from computation.
- [ ] Make classification regions selectable and navigable from the Inspector.
- [ ] Save, compare, export, hide/show, recompute, and inspect curvature results independently.

Acceptance: Curvature is one coherent mathematical result rather than separate representation-specific buttons or transient color modes.

## Commit 5 — Probe and local differential-geometry Inspector

Planned message: `feat(surface-analysis): add probe and local differential-geometry inspector`

**Status: planned; a strong local probe foundation exists.**

Already implemented:

- Surface/mesh point picking, parameter or graph coordinates, normal, tangent/principal directions, K/H/k1/k2, shape index, curvedness, and warnings.
- Tangent plane, normal, and tangent overlays.

Remaining:

- [ ] Resolve every probe to canonical surface ID/revision, representation, domain coordinate, and evaluation method.
- [ ] Show 3D position, `(x,y)` or `(u,v)`, normal, oriented tangent basis, E/F/G, L/M/N, H/K/k1/k2, d1/d2, and local classification.
- [ ] Show missing/undefined values with an explanation instead of substituting mesh or zero values silently.
- [ ] Add normal-curvature-by-angle and Euler-formula readout; visualize the selected direction and normal section.
- [ ] Add tangent plane, normal, principal axes, and optional normal-curvature/osculating-circle evidence with one visibility group.
- [ ] Support pinned probes, comparison between probes or revisions, history replay, copy, and structured export.
- [ ] Preserve selection semantics and camera framing when a probe maps to a derived mesh vertex/face.

Acceptance: clicking a valid point produces a complete, method-labeled local differential-geometry report with synchronized visual evidence.

## Commit 6 — Geodesics, curvature lines, ridges, valleys, and features

Planned message: `feat(surface-analysis): consolidate geodesic, ridge, valley and feature workflows`

**Status: planned; algorithms and overlays exist in several paths.**

Already implemented:

- Continuous graph and parametric geodesics, mesh graph/heat/surface paths, geodesic disks, curvature lines, principal streamlines, feature extraction, and ridge/valley stitching.

Remaining:

- [ ] Organize Surface Curves as geodesics, principal curvature lines, asymptotic curves, and level curves.
- [ ] Organize Surface Features as ridges, valleys, umbilics, parabolic curves, critical points, and representation singularities.
- [ ] Route analytic/parameter-space methods for smooth sources and clearly labeled discrete methods for mesh-backed sources.
- [ ] Create persistent result-layer objects with stable IDs, source revisions, parameters, statistics, warnings, and polyline/point payloads.
- [ ] Allow each result layer to be hidden, shown, selected, framed, saved, compared, exported, recomputed, or removed independently.
- [ ] Add selection-derived seeds/endpoints and preserve their semantic source references.
- [ ] Define confidence, stopping, branch, periodic-domain, boundary, and singular-region behavior.

Acceptance: curve/feature computation survives overlay toggles and becomes inspectable scientific output rather than temporary viewer state.

## Commit 7 — Charts and parameter-domain diagnostics

Planned message: `feat(surface-analysis): add chart and parameter-domain diagnostics`

**Status: planned; chart-grid diagnostics exist.**

Already implemented:

- Parameter/graph domains, chart grids, chart-cell diagnostics, coordinate readouts, orientation information, and degeneracy checks.

Remaining:

- [ ] Publish parameter-domain bounds, periodic seams, trim/chart boundaries, and valid-domain masks as a Chart result.
- [ ] Compute Jacobian rank, orientation, `det(g) = EG-F²`, and area scale `sqrt(det(g))`.
- [ ] Add area and angle distortion fields with documented reference metrics and units.
- [ ] Detect degenerate/near-degenerate regions using scale-aware thresholds and link them to 3D selections.
- [ ] Provide synchronized parameter-domain and 3D views with shared probe/selection highlighting.
- [ ] Add chart boundary, seam, orientation-flip, and degenerate-region overlays with independent visibility.
- [ ] Define a future-compatible atlas contract for chart overlap and coordinate transitions without requiring an atlas UI in v1.

Acceptance: users can explain where a parameterization is valid, oriented, distorted, or singular and navigate directly between domain evidence and the 3D Surface.

## Commit 8 — Provenance-linked derived SurfaceMesh

Planned message: `feat(surface-mesh): make tessellation a provenance-linked derived SurfaceMesh`

**Status: planned; baking and broad source kinds exist.**

Already implemented:

- Surface baking, preview/full meshes, `SurfaceMeshData`, broad `SurfaceMeshSource` kinds, UVs for several grids, and validation fields.
- Geometry↔Mesh trace infrastructure that provides a model for bidirectional correspondence.

Remaining:

- [ ] Define `DerivedSurfaceMeshIdentity` with mesh ID/revision, source Surface ID/revision/representation, tessellation method/settings, backend, timestamp, and state.
- [ ] Distinguish live derived meshes, frozen snapshots, robust backend variants, and detached independently editable meshes.
- [ ] Preserve vertex-to-domain `(u,v)` mapping and surface point/normal correspondence where available.
- [ ] For implicit surfaces, retain projection/residual, source-cell, or nearest-surface correspondence with confidence rather than inventing UVs.
- [ ] Add source→mesh and mesh→source selection mapping with partial/unavailable confidence states.
- [ ] Mark a derived mesh stale when its Surface revision or tessellation parameters change; preserve its old payload for comparison.
- [ ] Add regenerate, freeze snapshot, detach, delete, open source, and inspect provenance actions.
- [ ] Persist compact derived-mesh metadata and regeneration history across save/reopen.

Acceptance: every derived tessellation can answer which Surface revision and settings created it, whether it is current, and how its entities map back to the source.

## Commit 9 — Live mesh, bake, and Open in Mesh Analysis

Planned message: `feat(surface-mesh): add explicit live-mesh, bake and open-in-mesh-analysis workflows`

**Status: planned; overlapping promote/bake/handoff actions exist.**

Remaining:

- [ ] Define **Mesh** as the current live tessellation under the Surface; it does not create an independent object.
- [ ] Define **Bake to Mesh** as an independently editable snapshot that retains immutable source provenance.
- [ ] Define **Open in Mesh Analysis** as navigation to Mesh → Analysis with the live or selected derived mesh already active.
- [ ] Replace ambiguous Promote/Bake labels only after migration and parity tests prove saved workspaces still load.
- [ ] Transfer mapped selection, camera framing, source label, units, and comparison target into Mesh Analysis.
- [ ] Add **Open Surface Source** and mapped return selection from Mesh.
- [ ] Expose stale/live/snapshot/detached state and tessellation summary before navigation.
- [ ] Verify edits to a baked mesh never mutate the source Surface and edits to a Surface never silently overwrite a snapshot.

Acceptance: users can predict whether an action shows a live representation, creates a snapshot, or changes modules, and can navigate both directions without losing provenance.

## Commit 10 — VTK and CGAL bridge for derived meshes

Planned message: `feat(surface-mesh): integrate VTK and CGAL processing for derived meshes`

**Status: planned; common backend infrastructure already exists.**

Already implemented:

- VTK/Python workers, CGAL setup and validation, robust meshing/boolean paths, Mesh operations, backend health, cancellation, and packaging documentation.

Remaining:

- [ ] Replace detailed VTK/CGAL Surface panels with a compact Derived Mesh card: vertices, faces, watertightness, boundary count, backend, source revision, and stale state.
- [ ] Route **Remesh** and **Robust Mesh** through the common Mesh/backend request layer.
- [ ] Represent native tessellation, VTK post-processing, and CGAL robust meshing as derived variants of the same Surface source.
- [ ] Preserve backend version, parameters, logs/warnings, timing, source revision, and validation summary.
- [ ] Navigate to Mesh Analysis for advanced quality, topology, repair, remeshing, decimation, smoothing, booleans, and backend controls.
- [ ] Handle missing backends with explicit availability/fallback guidance; never relabel a native fallback as CGAL/VTK.
- [ ] Verify Windows local development, packaged Electron worker resolution, browser limitations, and CI backend smoke paths.

Acceptance: Surface users get a clear robust-mesh bridge while VTK/CGAL scientific and processing controls remain implemented once, in Mesh/common backend infrastructure.

## Commit 11 — Worker-backed computation, caching, and performance

Planned message: `perf(surface-analysis): workerize heavy surface computations and cache derived fields`

**Status: planned; isolated caches and worker patterns exist.**

Remaining:

- [ ] Key caches by Surface ID/revision, representation, domain, sampling resolution, analysis kind, parameters, method, and dependency revisions.
- [ ] Register dependencies such as derivatives → metric/forms → curvature → principal directions → curvature lines/features.
- [ ] Workerize high-resolution fields, implicit projection, feature extraction, geodesics, chart distortion, and heavy tessellation.
- [ ] Publish queued, running, progressive, cached, ready, stale, failed, and cancelled states through the shared result store.
- [ ] Guard every worker publication by request ID and exact Surface revision; late results cannot update the active viewport.
- [ ] Reuse derivative/normal/form fields across dependent analyses and across compatible visualizations.
- [ ] Guarantee that camera, palette, range, overlay density, glyph length, opacity, and line width changes trigger zero analysis recomputation.
- [ ] Add explicit cancel/retry and preserve last valid results while a new revision computes.
- [ ] Set reviewed budgets for interaction, point probes, 10k/100k samples, overlay publication, cancellation, module switch, and derived-mesh regeneration.
- [ ] Add current-build performance and memory reports for representative explicit, implicit, parametric, spline, and derived-mesh cases.

Acceptance: heavy Surface Analysis remains responsive, deterministic, revision-safe, cancellable, and measurably within reviewed budgets.

## Commit 12 — Regression matrix, workflow QA, and Surface Analysis v1 freeze

Planned message: `test(surface-analysis): add surface-analysis regression matrix and workflow QA`

**Status: planned; useful but distributed coverage exists.**

Canonical gallery:

- Plane, sphere, cylinder, cone, torus, saddle, paraboloid, ellipsoid, Mexican hat, Enneper surface, helicoid, Möbius strip, implicit sphere, implicit torus, spline/NURBS patch, and at least one constructed/Weierstrass surface.
- Pathological cases: degenerate parameterization, implicit critical point, seam/orientation reversal, trim boundary, non-orientable chart, disconnected implicit extraction, undersampled field, stale derived mesh, worker cancellation/failure, and unavailable backend.

Mathematical gates:

- [ ] Plane: K = H = k1 = k2 = 0 within the declared tolerance.
- [ ] Sphere of radius R: K = 1/R² and `|H| = |k1| = |k2| = 1/R`, with the sign explained by orientation.
- [ ] Cylinder of radius R: K = 0 and principal curvature magnitudes `{0, 1/R}`.
- [ ] Saddle: K < 0 away from singular/boundary regions.
- [ ] Torus: expected elliptic/hyperbolic regions and parabolic transition.
- [ ] Reparameterization preserves intrinsic quantities while orientation reversal follows the declared normal convention.
- [ ] Exact, numerical, sampled, and mesh-approximation results use separate tolerance classes and demonstrate convergence where applicable.

Workflow gates:

- [ ] Define Surface → Analyze Curvature → Probe → Save Result → change visualization without recomputation.
- [ ] Modify source → stale result warning → recompute/compare revisions.
- [ ] Compute geodesic/feature/chart result → independently hide/show/frame/export.
- [ ] Surface → live SurfaceMesh → Mesh Analysis → mapped selection → Open Surface Source.
- [ ] Surface → Bake to Mesh → edit Mesh independently → retain immutable source provenance.
- [ ] Surface → robust CGAL/VTK mesh variant → validate in Mesh → return to source.
- [ ] Save/reopen preserves Surface identities, saved results, derived relations, stale state, and visibility.
- [ ] Gallery, New, Demo, formulas, all surface families, Workbook handoffs, responsive drawers/sheets, keyboard navigation, and backend-unavailable states remain functional.
- [ ] Create maintained `test:surface-analysis:v1:unit`, `test:surface-analysis:v1:e2e`, backend verification, performance profile, and aggregate acceptance commands.
- [ ] Publish `docs/surface-analysis-v1-freeze.md` with the final UI decisions, seven or more accepted journeys, ownership boundary, and change policy.

Acceptance: canonical and pathological cases pass documented tolerances, the complete Surface↔Mesh lifecycle passes, and Surface Analysis v1 is governed by one repeatable acceptance contract.

## Commit dependencies

```text
1 Contract and identity
├── 2 Differential engine
│   ├── 4 Curvature
│   ├── 5 Probe
│   ├── 6 Curves/features
│   └── 7 Charts
├── 3 UI responsibility split
└── 8 Derived SurfaceMesh
    ├── 9 Live/bake/open workflows
    └── 10 VTK/CGAL bridge

2 + 8 ──► 11 Workers/cache/performance
3–11  ──► 12 Regression matrix and v1 freeze
```

Commits may be developed in parallel only where these dependency edges remain respected. In particular, UI consolidation must consume the canonical result contract, and derived-mesh actions must consume the canonical source identity instead of inventing temporary IDs.

## Required end-to-end journeys

The final freeze must preserve at least these journeys:

1. Define or open a Surface → analyze smooth differential geometry → inspect a local probe → save/export the result.
2. Analyze → change only visualization → confirm cache reuse and zero mathematical recomputation.
3. Analyze → edit source/domain → inspect stale result → recompute or compare revisions.
4. Compute geodesics/features/charts → keep multiple persistent result layers independently visible and inspectable.
5. Surface → live derived SurfaceMesh → Open in Mesh Analysis → analyze discrete quality/topology → return to the mapped Surface source.
6. Surface → Bake to Mesh → edit the detached snapshot → confirm the Surface and prior snapshot remain unchanged.
7. Surface → robust VTK/CGAL derived variant → inspect backend provenance and validation → compare with native tessellation.
8. Save/reopen → restore Surface identity, revisions, saved analysis, derived relationships, stale state, selection mapping, and view state.

## Definition of done for every implementation commit

- The ownership boundary remains explicit in types, UI labels, Inspector provenance, and exports.
- Existing capabilities remain reachable or have a documented, tested replacement.
- New result payloads are revision-safe and do not introduce a parallel generic result/history system.
- Exact, numerical, sampled, mesh, VTK, and CGAL methods are visibly distinguished.
- Unit tests cover formulas, identity/revision behavior, invalid inputs, stale/cancelled publication, and serialization as appropriate.
- Full TypeScript typecheck and production renderer/core build pass.
- Relevant Electron E2E, responsive, persistence, round-trip, worker-failure, backend, and performance checks pass.
- The progress table and completed commit section are updated with the implementation Git hash and validation evidence.

## Validation commands

Until Commit 12 introduces the maintained aggregate gate, use focused checks followed by the relevant full gates:

```powershell
npm --prefix renderer test -- src/math/chartGridDiagnostics.test.ts src/math/splineSurface.test.ts src/math/selection/geodesicGraph.test.ts src/geometry/exactSurfaceAnalysis.test.ts
npm --prefix renderer test
npm run typecheck:noemit
npm run build:core
npx playwright test tests/e2e/surface-functional.spec.ts tests/e2e/gallery-visual.spec.ts tests/e2e/workspace-navigation.spec.ts tests/e2e/worker-failure-injection.spec.ts --reporter=list
npm run test:app:responsive:smoke
```

Backend and long-running checks should be added when a commit touches derived meshes, workers, VTK, CGAL, release presets, or memory behavior.

## Main implementation references

- `renderer/src/App.tsx`: current Surfaces workspace, state, UI wiring, analysis controls, derived meshes, handoffs, persistence, workers, and Inspector.
- `renderer/src/components/SurfaceViewer.tsx`: explicit/implicit surface rendering, sampling, picking, overlays, local differential fields, and performance diagnostics.
- `renderer/src/components/ParamSurfaceViewer.tsx`: parametric/spline/constructed rendering, parameter-domain sampling, curvature, directions, and overlays.
- `renderer/src/components/GaussMapPanel.tsx`: current floating Gauss-map result view.
- `renderer/src/math/surfaceInvariants.ts`: graph derivatives and differential invariants.
- `renderer/src/math/principalCurvature.ts`: parametric principal-curvature computations.
- `renderer/src/geometry/exactSurfaceAnalysis.ts`: tested analytic surface definitions and local exact analysis to reuse through adapters.
- `renderer/src/math/sampling/surfaceSampling.ts`: common Surface sample records and sample-set builders.
- `renderer/src/math/surfaceQuery.ts`: representation-aware Surface query/probe contract foundation.
- `renderer/src/math/chartGridDiagnostics.ts`: chart-cell orientation and degeneracy diagnostics.
- `renderer/src/math/graphGeodesicContinuous.ts` and `renderer/src/math/paramGeodesicContinuous.ts`: smooth graph/parameter geodesic solvers.
- `renderer/src/math/curvatureLines.ts`, `principalStreamlines.ts`, `ridgeValley.ts`, and `ridgeValleyStitch.ts`: current curve/feature foundations.
- `renderer/src/math/bakeSurface.ts`: current representation-specific tessellation.
- `renderer/src/mesh/surfaceMesh.ts`: `SurfaceMeshData`, source metadata, import, validation, and mesh conversion.
- `renderer/src/analysis/`: domain-neutral analysis request, registry, result store, dependencies, and invalidation.
- `renderer/src/mesh/`: discrete differential geometry, topology, quality, calculus, features, result history, and Mesh-only processing.
- `renderer/src/services/`: VTK/CGAL/Python worker clients and backend bridges.
- `tests/e2e/surface-functional.spec.ts`: existing Surface functional E2E.
- `tests/e2e/gallery-visual.spec.ts`: Surface gallery and visual coverage.
- `tests/e2e/mesh-topology-persistence.spec.ts`: cross-module selection/provenance and round-trip patterns.
- `scripts/responsive-layout-smoke.mjs`: Surface drawer/sheet/touch responsive checks.

## Final architecture rule

The completed workflow must feel continuous without erasing the representation boundary:

```text
Surface definition → Surface Analysis → linked Derived SurfaceMesh → Mesh Analysis
       ▲                                                        │
       └──────────── source identity and mapped navigation ─────┘
```

Surface and Mesh are two scientific views of one provenance graph. They share scene identity, navigation, requests/results, saved-result lifecycle, and backend infrastructure, while preserving different mathematical meanings.
