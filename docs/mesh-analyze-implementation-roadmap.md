# Mesh Analyze implementation roadmap

Assessment date: 2026-09-09
Reviewed checkout: `f15d89a` — Expand Mesh Analyze scientific results

The numbered commits below are implementation plans, not claims that corresponding Git commits are complete. This document records the current implementation and the remaining work against the supplied plans.

## Implementation progress

| Plan | Status | Git commit | Verification |
| --- | --- | --- | --- |
| 1 — Canonical AnalysisResult registry and cache | Complete | `3894943` | 344 renderer tests, TypeScript typecheck, and production renderer build passed |
| 2 — Canonical mesh health and CGAL integrity | Next | — | — |
| 3–12 | Planned | — | See the detailed sections below |

The implementation commits follow the numbered plan sections. Progress entries record completed code only after its relevant tests and build checks pass.

## Current assessment

Math3D already has a substantial Mesh Analyze workbench. Most planned commits are partially implemented; the interface is further along than mathematical validation. Existing work should be extended rather than rebuilt.

Validation during this review: **28 tests passed across six unit-test files** covering the result store, active-result summaries, quality reports, benchmark regression, Geometry analysis bridge, and graph geodesics. Full application/backend regression tests and new performance measurements were not run.

```powershell
cd C:\Math3D\renderer
npm exec -- vitest run src/mesh/analysisResultStore.test.ts src/mesh/activeAnalysisResult.test.ts src/mesh/meshQualityReport.test.ts src/mesh/meshBenchmarkRegression.test.ts src/geometry/analysisBridge.test.ts src/math/selection/geodesicGraph.test.ts
```

## Priority findings

1. **Principal directions are unfinished.** The probe displays a generic tangent basis. Its `direction-d1/d2` test IDs do not establish that those vectors are fitted principal directions.
2. **Curvature conventions need correction and validation.** Mean-curvature sign currently depends on direction from the mesh centroid. Negative `H² − K` is clamped to zero without an uncertainty warning, so the planned identities are not guaranteed.
3. **Curvature remains synchronous in React.** Deferring large-mesh analysis avoids initial work, but enabling it does not move computation to a worker.
4. **Some readiness states follow visibility.** Ridge/valley readiness currently follows overlay toggles rather than successful validated computation.

## Commit 1 — Canonical AnalysisResult registry and cache

**Status: implemented.** The supplied attachment includes this commit's title only; the implementation follows the stated registry/cache scope.

Already implemented:

- Revision-aware mesh result store with separate kinds and variants.
- Result timestamps, parameters, payloads, progress, and dependency metadata.
- Unit tests for revision separation and basic store behavior.

Completed:

- [x] General extensible analysis registry with family, domain, variant, and dependency definitions.
- [x] Dependency-cycle and missing-dependency validation.
- [x] Exact dependency snapshots and transitive stale-result propagation.
- [x] Explicit invalidation while preserving stale payloads for historical inspection.
- [x] Reliable full-buffer revision tracking for large meshes.
- [x] Stable parameter fingerprints and parameter-aware cache retrieval.
- [x] Parameter-aware cache reads for the current curvature and quality families.

## Commit 2 — Canonical mesh health and CGAL integrity

**Status: partial foundation.** The supplied attachment includes this commit's title only.

Already implemented:

- Diagnostics payloads, severity classification, and defect visualization.
- CGAL validation infrastructure and topology checks.

Remaining:

- [ ] Establish the canonical `MeshHealthResult` contract.
- [ ] Unify Inspector diagnostics and backend validation through that contract.
- [ ] Verify severity, orientation, manifold, and self-intersection semantics with explicit tests.

## Commit 3 — Differential geometry

Planned message: `mesh-analysis: complete curvature and principal-direction analysis`

**Status: partially implemented; recommended next implementation step.**

Already implemented:

- Cached K, H, k1, and k2 arrays.
- Angle-defect Gaussian curvature and cotangent mean-curvature computation.
- Statistics, histogram, extrema, palette/range controls, and vertex probe.
- Basic handling of boundaries and zero-area vertices.

Remaining:

- [ ] Extract the canonical discrete implementation from `App.tsx` into testable modules.
- [ ] Define orientation, mean-curvature sign, vertex area, and boundary conventions.
- [ ] Validate K = k1·k2 and H = (k1+k2)/2 where applicable; warn on inconsistent reconstruction.
- [ ] Implement and validate principal-direction estimation/fitting.
- [ ] Add shape index and curvedness as cached quantities.
- [ ] Add explicit validity/warning masks for non-manifold, degenerate, nearly flat, umbilic, and inconsistently oriented neighborhoods.
- [ ] Expose actual principal directions and warnings in the Inspector/probe.
- [ ] Add VTK comparison without inheriting its conventions silently.
- [ ] Add plane, unit sphere, cylinder, torus, refinement, noisy sphere, Fandisk, Bunny, and Armadillo verification.

Acceptance: stable cached scientific results with documented conventions and numerical verification, including reliable principal directions where defined.

## Commit 4 — Mesh-quality scalar fields

Planned message: `mesh-analysis: add VTK mesh-quality fields and bad-element selection`

**Status: quality-report foundation exists; scalar-field workflow incomplete.**

Already implemented:

- Area, aspect ratio, edge length, valence, and dihedral statistics.
- Defect lists and overlays.
- Quality-report worker and cached reports.

Remaining:

- [ ] Add the planned VTK-backed triangle metrics: area, aspect ratio, edge ratio, minimum/maximum angle, radius ratio, and scaled Jacobian.
- [ ] Preserve full face-domain scalar arrays rather than only summaries and listed defects.
- [ ] Use the shared palette/range/legend/histogram/percentile/probe pipeline.
- [ ] Add threshold selection and worst 1% / 5% selection through the shared Selection Inspector.
- [ ] Test equilateral, elongated, near-degenerate, mixed-quality, and large meshes.

Acceptance: Mesh Quality is a complete scientific scalar-field family.

## Commit 5 — Surface field calculus

Planned message: `mesh-analysis: add surface scalar and vector field operators`

**Status: working operators exist; canonical discretization and registry remain incomplete.**

Already implemented:

- Tangent-plane gradient, divergence, normal-curl, and composed Laplacian code.
- Scalar/vector controls and custom expressions.

Remaining:

- [ ] Complete registry-driven scalar sources: coordinates, curvature quantities, distance, vertex area, valence, mapped quality, imported attributes, and expressions.
- [ ] Complete vector sources: normals, validated principal directions, gradients, imported and custom fields.
- [ ] Add canonical cotangent Laplace–Beltrami with documented mass/area convention.
- [ ] Validate divergence and curl across changing tangent frames and document the surface rotation convention.
- [ ] Store operator outputs as cached analysis results with dependencies.
- [ ] Verify plane fields, sphere coordinates, constants, tangent vector fields, and refinement convergence.

Acceptance: a mathematically defined surface-calculus family with verified results.

## Commit 6 — Geodesic methods

Planned message: `mesh-analysis: add graph and surface geodesic analysis`

**Status: graph and heat foundations exist; method separation incomplete.**

Already implemented:

- Graph-routing utilities and tests.
- Heat-method implementation/backend access.
- Endpoint/path workflow and path-length reporting.

Remaining:

- [ ] Clearly label edge-graph routing as approximate graph routing.
- [ ] Integrate CGAL triangulated-surface shortest paths as the accurate method.
- [ ] Expose selected vertex, selected point, and selection-set source semantics.
- [ ] Return path polyline, length, and source/target metadata consistently.
- [ ] Keep heat distance explicitly experimental/advanced and integrate its scalar field.
- [ ] Test plane, cylinder, sphere, graph-versus-surface differences, disconnected endpoints, and large meshes.

Acceptance: graph routing, surface shortest paths, and heat distance have distinct, truthful semantics.

## Commit 7 — Cached surface-feature extraction

Planned message: `mesh-analysis: add reusable surface-feature extraction`

**Status: edge tools and overlays exist; reusable analysis pipeline incomplete.**

Already implemented:

- Sharp/feature-edge selection with tests.
- Curvature-line and feature overlays.

Remaining:

- [ ] Implement reusable dependencies from mesh → normals → curvature → directions → features.
- [ ] Add curvature-threshold, elliptic, hyperbolic, parabolic/developable, and umbilic candidate classifications.
- [ ] Expose classification tolerances and uncertainty.
- [ ] Support cached edge sets, vertex sets, face regions, polylines, and scalar strengths as appropriate.
- [ ] Integrate feature membership with shared selection and overlays.
- [ ] Verify cube, cylinder, Fandisk, torus, and Bunny.

Acceptance: feature extraction consumes cached analysis and uses the common result/selection system.

## Commit 8 — Ridges and valleys

Planned message: `mesh-analysis: add principal-curvature ridge and valley extraction`

**Status: algorithms exist; scientific readiness is not established.**

Already implemented:

- Detection and stitching algorithms.
- Thresholds, confidence values, and umbilic-suppression options.
- Ridge/valley overlays.

Remaining:

- [ ] Depend on validated mesh k1/k2/d1/d2 results.
- [ ] Complete principal-family, strength, minimum-line-length, and smoothing/neighborhood controls.
- [ ] Cache directional derivatives, candidates, and traced results with provenance.
- [ ] Suppress or mark uncertain output wherever directions are unstable.
- [ ] Derive Ready state from valid computation, not overlay visibility.
- [ ] Add quantitative Fandisk, torus, saddle, smooth-sphere negative, and Bunny tests.

Acceptance: mark ready only after quantitative tests pass.

## Commit 9 — Target isolation and large-mesh workers

Planned message: `mesh-analysis: add target focus and worker-backed large-mesh execution`

**Status: substantial performance infrastructure exists; acceptance remains open.**

Already implemented:

- Shared workspace and visibility controls.
- Large-mesh previews and deferred analysis.
- Quality worker, cancellation mechanisms, benchmark assets, and profiling scripts.

Remaining:

- [ ] Add Analyze target-display states: Focus target, Ghost others, Show scene.
- [ ] Default Analyze to Ghost others with construction overlays hidden unless requested.
- [ ] Move curvature and remaining expensive analysis/statistical work off the UI thread.
- [ ] Standardize queued/running/cancel/cancelled states and prevent stale or partial publication.
- [ ] Benchmark load/compute time, UI blocking, memory delta, overlay cost, and probe latency.
- [ ] Verify responsive Bunny, Armadillo, and Dragon analysis on the current implementation.

Existing profiling artifacts are historical measurements, not proof that current analysis meets this acceptance criterion.

## Commit 10 — Scientific Inspector and computation history

Planned message: `mesh-analysis: complete scientific Inspector result views`

**Status: substantial UI implementation; scientific completeness remains open.**

Already implemented:

- Result, Selection, Diagnostics, and History tabs.
- Detailed curvature statistics, histogram, extrema, and computation metadata.
- Local probe values, quality summaries, and operation/probe history.

Remaining:

- [ ] Provide consistent quantity/method/domain/statistics/percentiles/provenance/warnings across all result families.
- [ ] Display validated principal directions and complete vertex scalar/vector/mapped-quality values.
- [ ] Complete face and edge scientific fields, including feature membership.
- [ ] Use canonical MeshHealthResult for Diagnostics.
- [ ] Record analysis computations with parameters, backend, duration, status, timestamp, and revision.
- [ ] Allow inspection of stale results while clearly distinguishing them from current output.

Acceptance: the right Inspector is authoritative for scientific interpretation.

## Commit 11 — Geometry ↔ Mesh analysis infrastructure

Planned message: `analysis-core: share result semantics across Geometry and Mesh`

**Status: bridge exists; generic infrastructure extraction remains.**

Already implemented:

- Geometry↔Mesh promotion/analysis bridge and tests.
- Reusable mesh result helpers.

Remaining:

- [ ] Share generic AnalysisResult, registry, cache/invalidation, statistics, field and palette/range metadata, probe schema, histogram data, and provenance.
- [ ] Keep adapters, topology, quality, discrete curvature, geodesics, and feature edges Mesh-specific.
- [ ] Define compatibility for future analytical Geometry quantities without rewriting Geometry.

Acceptance: generic analysis infrastructure is not hard-coded into Mesh or the main application component.

## Commit 12 — Regression suite and Mesh Analyze v1 freeze

Planned message: `mesh-analysis: add end-to-end regression suite and freeze v1 workflow`

**Status: useful tests exist; full acceptance suite and freeze remain.**

Already implemented:

- Unit coverage for cache, summaries, quality, graph routing, and Geometry bridge.
- Scientific Mesh Analyze UI tests.
- Benchmark assets and regression scripts.

Remaining:

- [ ] Complete unit coverage for health severity, curvature conventions, calculus, geodesic labels, and dependency invalidation.
- [ ] Complete VTK and CGAL backend verification.
- [ ] Add clean-sphere, Fandisk, worker-backed Bunny, problem-mesh, and graph-versus-surface end-to-end scenarios.
- [ ] Run numerical, integration, and performance acceptance checks.
- [ ] Freeze the v1 workflow only after those checks pass.

Workflow constraints to preserve:

- Left: analysis configuration.
- Center: visualization and probe.
- Right: scientific results and diagnostics.
- One shared document scene.
- No engine-specific VTK/CGAL primary panels or restored equation-generation workflow in Mesh Analyze.

## Recommended implementation sequence

1. Finish commit 3, including numerical tests, validated directions, and truthful readiness states.
2. Bring forward the curvature-worker portion of commit 9 while extracting the computation.
3. Complete commits 4 and 5, extending the result/cache foundation as needed.
4. Complete geodesic method separation in commit 6.
5. Build cached feature extraction in commit 7, then validate ridges/valleys in commit 8.
6. Finish target isolation and remaining worker/performance work in commit 9.
7. Complete Inspector/history and shared infrastructure in commits 10–11.
8. Run the full acceptance suite and freeze v1 in commit 12.

## Main implementation references

- `renderer/src/mesh/analysisResultStore.ts`: mesh identities, cached results, dependencies, diagnostic payloads.
- `renderer/src/mesh/activeAnalysisResult.ts`: scientific summaries, statistics, method labels, readiness.
- `renderer/src/mesh/meshQualityReport.ts`: quality summaries and defect lists.
- `renderer/src/workers/meshQualityReportWorker.ts`: quality-report worker.
- `renderer/src/App.tsx`: current mesh curvature, calculus, probe, and Inspector integration.
- `renderer/src/math/ridgeValley.ts` and `ridgeValleyStitch.ts`: ridge/valley detection and tracing.
- `renderer/src/mesh/edgeSelection.ts`: sharp/feature-edge selection.
- `renderer/src/math/selection/geodesicGraph.ts`: graph routing.
- `py/geodesic/`: heat-method implementation.
- `renderer/src/geometry/analysisBridge.ts`: Geometry/Mesh analysis bridge.
- `tests/e2e/mesh-analyze-science.spec.ts`: current scientific UI regression scenarios.
- `scripts/mesh-profile-suite.mjs`: large-mesh profiling.
