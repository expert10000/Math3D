# Surface Analysis v1 freeze

Status: frozen on 2026-09-12 after roadmap Commit 12.

This document is the maintained product and engineering contract for Surface Analysis v1. The aggregate gate is:

```powershell
npm run test:surface-analysis:v1:acceptance
```

## Ownership boundary

Surface Analysis owns smooth or represented-surface meaning: canonical Surface identity and revision, domain coordinates, derivatives, metric and fundamental forms, smooth curvature, probes, chart diagnostics, geodesics/features, and the relationship to derived tessellations.

Mesh Analysis owns discrete-mesh meaning and processing: vertex/edge/face topology, mesh quality, discrete curvature, validation, repair, remeshing, decimation, smoothing, booleans, and detailed VTK/CGAL controls.

The handoff is a provenance edge, not a relabel:

```text
Surface definition -> Surface Analysis -> linked Derived SurfaceMesh -> Mesh Analysis
       ^                                                        |
       +---------- source identity and mapped navigation -------+
```

Analytic, automatic-differentiation, numerical, sampled, mesh-approximation, VTK, and CGAL results must retain their actual method labels.

## Frozen UI decisions

- The left Analysis panel chooses and computes Differential geometry, Curvature, Local probe, Surface curves, Features, and Charts.
- The viewport strip owns display-only state: field, palette, range, visibility, glyph/overlay appearance, and framing. These controls do not recompute mathematics.
- The right Inspector owns values, units, method/provenance, masks, warnings, statistics, navigation, save/compare/export/recompute actions, and result history.
- The Derived SurfaceMesh card is compact. It shows counts, watertightness, boundary edges, backend/version, source/mesh revisions, lifecycle state, mapping quality, and explicit backend availability.
- **Mesh (live)** follows the current Surface. **Bake to Mesh** creates an independently editable snapshot. **Open in Mesh Analysis** activates the selected derived record with source provenance.
- **Remesh** and **Robust Mesh** route to the shared Mesh Operations registry. Advanced VTK/CGAL parameters and logs are not duplicated in Surfaces.
- Missing values and unavailable backends remain explicit. No fallback may be relabeled as analytic, VTK, or CGAL.

## Built-in layer presets

Surface → Analysis starts each preset on the current Surface definition and revision; it never replaces the source object. A Surface change clears the active preset badge so an earlier stack cannot appear current.

- **Curvature atlas** — signed Gaussian-curvature field and principal directions.
- **Local frame** — mean-curvature field, local probe, normal, tangent plane, and principal frame.
- **Principal flow** — first-principal-curvature field, principal directions, and both principal-line result layers.
- **Feature map** — signed curvature plus ridge, valley, umbilic, and parabolic result layers.
- **Chart + seams** — parameter grid, boundary, seam, orientation-flip, and degeneracy diagnostics.

Presets only orchestrate the canonical computations, display controls, Inspector results, and result-layer store described below. Each generated layer keeps its Surface identity, revision, method, warnings, visibility, and lifecycle actions; there is no separate preset result system.

## Accepted journeys

1. Define or open a Surface, analyze Curvature, inspect and pin a local probe, then save/export the result.
2. Change palette, range, opacity, glyph density, or camera and retain the existing mathematical result without recomputation.
3. Modify source/domain, observe the prior revision become stale, then recompute or compare revisions.
4. Compute Surface curves, features, and chart diagnostics; independently show, hide, select, frame, save, compare, export, recompute, or remove result layers.
5. Open the live derived SurfaceMesh in Mesh Analysis, inspect discrete quality/topology, and return to the mapped Surface selection and camera.
6. Bake a snapshot, edit the Mesh independently, and retain immutable source Surface and snapshot provenance.
7. Route a derived mesh to robust CGAL/VTK processing, inspect validation/backend evidence in Mesh Operations, and retain its Surface source revision.
8. Save and reopen the workspace while preserving Surface identities, saved-result references, derived relations, stale state, visibility, and compact regeneration history.
9. Cancel or retry a high-resolution Surface field while the last valid payload remains visible and late results cannot update another revision.
10. Use Gallery, New, Demo, formulas, spline/constructed/Weierstrass families, Workbook handoffs, and responsive drawers without changing the ownership model.

## Scientific regression matrix

The canonical inventory is versioned in `renderer/src/surfaceAnalysis/regressionMatrix.ts`. It contains plane, sphere, cylinder, cone, torus, saddle, paraboloid, ellipsoid, Mexican hat, Enneper, helicoid, Möbius, implicit sphere/torus, NURBS, constructed sweep, and Weierstrass cases.

The pathological inventory includes degenerate parameterization, implicit critical point, orientation reversal/seam, trim boundary, non-orientable chart, disconnected implicit extraction, undersampling, stale derived mesh, worker cancellation/failure, and unavailable backend.

Tolerance classes are deliberately separate:

| Method class | Absolute | Relative | Convergence required |
| --- | ---: | ---: | --- |
| exact | `1e-10` | `1e-10` | no |
| numerical | `2e-4` | `2e-4` | yes |
| sampled | `2e-2` | `5e-2` | yes |
| mesh approximation | `8e-2` | `1e-1` | yes |

The truth gates fix plane zero curvature; sphere `K=1/R²` and curvature magnitudes `1/R`; cylinder `K=0` with magnitudes `{0,1/R}`; negative saddle curvature; torus elliptic/parabolic/hyperbolic regions; intrinsic invariance under coordinate swap; and signed-curvature reversal with orientation.

## Performance contract

The current-build profile command measures canonical 10k and 100k curvature fields and records estimated typed-array memory. Reviewed budgets are 16 ms interaction, 50 ms point probes, 500 ms for 10k samples, 4 s for 100k samples, 100 ms overlay publication and cancellation, 250 ms module switching, and 2 s derived-mesh regeneration.

At 10,000 samples and above, canonical Curvature runs in the Surface Analysis Web Worker. The scheduler cache key includes Surface ID/revision, representation, domain, sampling resolution, analysis kind, parameters, method, and dependency revisions. Request-ID and exact-revision guards reject late publications.

## Maintained gates

- `npm run test:surface-analysis:v1:unit` — regression matrix, contracts, differential engine, curvature, probes, layers, charts, derived meshes, persistence, scheduler, and supporting exact/chart/spline/geodesic math.
- `npm run test:surface-analysis:v1:e2e` — Surface workflows, Gallery, workspace navigation, and injected worker/backend failures.
- `npm run verify:surface-analysis:v1:backends` — packaged Python worker, VTK smoke, CGAL geodesic, and real-mesh boolean verification.
- `npm run profile:surface-analysis:v1` — 10k/100k current-build performance and memory profile.
- `npm run test:surface-analysis:v1:acceptance` — all above plus typecheck, production build, and responsive layout smoke.

## Change policy

Changes that only improve implementation details may land when all maintained gates remain green and method/provenance labels are unchanged. Any change to result semantics, tolerance classes, Surface/Mesh ownership, primary action meaning, cache identity, persistence schema, or accepted journeys requires:

1. an explicit versioned contract change;
2. regression and migration coverage;
3. an update to this freeze document and the roadmap;
4. review of Surface↔Mesh round-trip behavior and unavailable-backend behavior.

New capabilities should extend the canonical result and provenance graph. They must not create a parallel result history, duplicate detailed Mesh processing controls in Surfaces, or silently substitute one scientific method for another.
