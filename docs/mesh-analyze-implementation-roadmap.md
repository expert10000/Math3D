# Mesh Analyze implementation roadmap

Assessment date: 2026-09-10
Reviewed checkout: `2fad684` — mesh-analysis: add graph and surface geodesic analysis

The numbered commits below are implementation plans, not claims that corresponding Git commits are complete. This document records the current implementation and the remaining work against the supplied plans.

## Implementation progress

| Plan | Status | Git commit | Verification |
| --- | --- | --- | --- |
| 1 — Canonical AnalysisResult registry and cache | Complete | `3894943` | 344 renderer tests, TypeScript typecheck, and production renderer build passed |
| 2 — Canonical mesh health and CGAL integrity | Complete | `54e9a44` | 349 renderer tests, TypeScript typecheck, production renderer build, and 3 Mesh Analyze E2E tests passed |
| 3 — Differential geometry | Complete | `af13026` | 361 renderer tests, TypeScript typecheck, production renderer build, and 3 Mesh Analyze E2E tests passed |
| 4 — Mesh-quality scalar fields | Complete | `d894dee` | 364 renderer tests, TypeScript typecheck, production renderer build, and 3 Mesh Analyze E2E tests passed |
| 5 — Surface field calculus | Complete | `ebe8115` | 371 renderer tests, TypeScript typecheck, production renderer build, and 3 Mesh Analyze E2E tests passed |
| 6 — Geodesic methods | Complete | `2fad684` | 373 renderer tests, TypeScript typecheck, production renderer build, 3 Python protocol tests, CGAL dependency/mesh-generation/boolean smoke tests, and 6 native geodesic checks passed |
| 7–12 | Planned | — | See the detailed sections below |

The implementation commits follow the numbered plan sections. Progress entries record completed code only after its relevant tests and build checks pass.

## Current assessment

Commits 1–6 are implemented. The Mesh Analyze workbench now has canonical cached results, mesh-health and CGAL integrity checks, differential geometry, mesh-quality fields, surface field calculus, approximate edge-graph routes, accurate CGAL triangulated-surface shortest paths, and an explicitly experimental heat-distance field. Commits 7–12 retain partially implemented foundations and remain the next work.

Commit 6 validation completed locally with CGAL 6.2.1 from vcpkg, the Python CGAL worker environment, the native shortest-path helper, dependency and mesh-generation smoke checks, all three CGAL boolean operations, and numerical geodesic checks on plane, cylinder, sphere, graph-versus-surface, disconnected, and 5,776-vertex large-mesh cases. The full renderer suite also passed: **373 tests across 69 files**, plus TypeScript typecheck and the production renderer build.

```powershell
cd C:\Math3D
npm --prefix renderer test
npm run typecheck:noemit
npm run build:renderer
npm run test:cgal-geodesic
```

## Next priorities

1. Extract reusable cached surface-feature results for Commit 7.
2. Establish numerical readiness and acceptance criteria for spectral analysis in Commit 8.
3. Complete the performance, UI, backend-infrastructure, and regression work tracked by Commits 9–12.

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

**Status: implemented.** The supplied attachment includes this commit's title only.

Already implemented:

- Diagnostics payloads, severity classification, and defect visualization.
- CGAL validation infrastructure and topology checks.

Completed:

- [x] Established a canonical `MeshHealthResult` contract for local topology and CGAL validation.
- [x] Unified the analysis result store, State check toolbar badge, Inspector summary, topology rows, blockers, and backend provenance through that contract.
- [x] Bound CGAL results to exact mesh revision keys so validation cannot leak across meshes or edits.
- [x] Defined explicit severity rules for invalid geometry, manifoldness, orientability, inconsistent orientation, duplicate faces and vertices, self-intersections, and incomplete sampled validation.
- [x] Added focused unit tests and Mesh Analyze E2E coverage for the renamed State check UI.

## Commit 3 — Differential geometry

Planned message: `mesh-analysis: complete curvature and principal-direction analysis`

**Status: implemented.**

Already implemented:

- Cached K, H, k1, and k2 arrays.
- Angle-defect Gaussian curvature and cotangent mean-curvature computation.
- Statistics, histogram, extrema, palette/range controls, and vertex probe.
- Basic handling of boundaries and zero-area vertices.

Completed:

- [x] Extracted the canonical discrete implementation from `App.tsx` into a testable `meshDifferentialGeometry` module.
- [x] Defined barycentric vertex area, π boundary angle defect, input-winding behavior for open meshes, outward orientation for closed meshes, positive outward-convex mean curvature, and k1 ≥ k2 ordering.
- [x] Added K = k1·k2 and H = (k1+k2)/2 residual arrays and an uncertainty mask for clamped or inconsistent reconstruction.
- [x] Implemented weighted normal-section least-squares shape-operator fitting for principal directions.
- [x] Added cached shape-index and curvedness scalar arrays and canonical d1/d2 vector fields.
- [x] Added explicit validity and warning masks for boundary, non-manifold, degenerate, nearly flat, umbilic, inconsistently oriented, insufficient-neighborhood, and curvature-identity cases.
- [x] Routed fitted directions into mesh glyphs, curvature lines, ridge/valley extraction, Inspector readiness, and probe readouts with local warnings.
- [x] Added a VTK-reference comparison API that requires the caller to declare whether mean-curvature signs agree or are opposite.
- [x] Added plane, unit sphere, reversed sphere, cylinder, torus, refinement, noisy sphere, Fandisk, Stanford Bunny, and Armadillo verification.

Acceptance: stable cached scientific results with documented conventions and numerical verification, including reliable principal directions where defined.

## Commit 4 — Mesh-quality scalar fields

Planned message: `mesh-analysis: add VTK mesh-quality fields and bad-element selection`

**Status: implemented.**

Already implemented:

- Area, aspect ratio, edge length, valence, and dihedral statistics.
- Defect lists and overlays.
- Quality-report worker and cached reports.

Completed:

- [x] Added VTK/Verdict-compatible area, aspect ratio, edge ratio, minimum angle, maximum angle, radius ratio, and scaled Jacobian formulas with documented equilateral normalization.
- [x] Corrected the legacy aspect-ratio calculation, which previously computed longest-edge / shortest-edge, and retained edge ratio as its own field.
- [x] Preserved every triangle metric as a face-indexed `Float64Array`, with an explicit valid-face mask and face centroids; retained complete edge-length, dihedral-angle, and vertex-valence arrays as well.
- [x] Routed face metrics through the shared palette, inversion, automatic/manual range, whole/selected range, 2–98% percentile, legend, histogram, extrema, and probe controls.
- [x] Added flat per-face viewport coloring so shared vertices do not blur distinct triangle values.
- [x] Added bad-side threshold selection and stable worst 1% / 5% face selection, with selected-face markers and mapping into the shared Selection Inspector.
- [x] Added complete face arrays to JSON and CSV quality exports.
- [x] Added equilateral VTK/Verdict reference, elongated, near-degenerate, mixed-quality selection, non-manifold, and 33,282-face grid tests, plus Mesh Analyze E2E coverage.

Acceptance: Mesh Quality is a complete scientific scalar-field family.

## Commit 5 — Surface field calculus

Planned message: `mesh-analysis: add surface scalar and vector field operators`

**Status: implemented.**

Already implemented:

- Tangent-plane gradient, divergence, normal-curl, and composed Laplacian code.
- Scalar/vector controls and custom expressions.

Completed:

- [x] Added a registry-driven scalar-source family for x/y/z coordinates, height, origin distance, barycentric vertex area, valence, K/H/k1/k2, shape index, curvedness, face-quality fields mapped to vertices, imported attributes, derived fields, and custom expressions.
- [x] Added normals, validity-masked principal directions, generated gradients, imported/derived vectors, and three-component custom vector expressions projected to the tangent plane.
- [x] Added the canonical cotangent Laplace–Beltrami operator `Δf = M⁻¹Lf`, with `Mᵢᵢ = Σ Aₜ/3`, edge weights `(cot α + cot β)/2`, negative sphere-coordinate eigenvalues, and explicit NaN boundary values.
- [x] Defined the gradient as the piecewise-linear face gradient area-averaged at vertices and divergence as the weak FEM divergence after face-tangent projection.
- [x] Defined oriented normal-curl as `curlₙ X = divₛ(X × n)`, where `n` follows input triangle winding; the implementation does not depend on a chosen global tangent frame.
- [x] Cached every canonical operator result by mesh revision, operator, source, parameters, and variant, with exact curvature, quality, principal-direction, and composed-gradient dependency snapshots.
- [x] Registered normals and principal directions as explicit cache dependencies and cleared transient derived fields when the active mesh revision changes.
- [x] Added Mesh Analyze controls for the direct cotangent Laplacian and custom tangent-vector expressions, plus Inspector method, valid-domain, mass, boundary, curl, timestamp, and cache metadata.
- [x] Verified linear and constant plane fields, divergence, oriented curl on a rotated plane, unit-sphere coordinate eigenvalues, refinement convergence, registry coverage, dependency invalidation, cache reuse, and the complete Electron workflow.

Acceptance: a mathematically defined surface-calculus family with verified results.

## Commit 6 — Geodesic methods

Planned message: `mesh-analysis: add graph and surface geodesic analysis`

**Status: complete.**

Already implemented:

- Graph-routing utilities and tests.
- Heat-method implementation/backend access.
- Endpoint/path workflow and path-length reporting.

Completed:

- [x] Clearly labeled edge-graph routing as approximate graph routing.
- [x] Integrated CGAL triangulated-surface shortest paths as the accurate method through the worker and packaged native helper.
- [x] Exposed selected vertex, selected surface point, and selection-set multi-source semantics.
- [x] Returned method-specific polylines, lengths, chosen-source data, and source/target metadata consistently.
- [x] Kept heat distance explicitly experimental/advanced and preserved its scalar-field heatmap.
- [x] Added protocol/unit coverage plus a native verification suite for plane, cylinder, sphere, graph-versus-surface differences, disconnected endpoints, and large meshes.

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
