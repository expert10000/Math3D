# Mesh Analyze implementation roadmap

Assessment date: 2026-09-10
Reviewed checkout: `e2f2c42` — mesh-analysis: add end-to-end regression suite and freeze v1 workflow

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
| 7 — Cached surface-feature extraction | Complete | `a4844ad` | 380 renderer tests, TypeScript typecheck, production renderer build, cube/cylinder/torus/Fandisk/Bunny verification, and 3 Mesh Analyze E2E tests passed |
| 8 — Ridges and valleys | Complete | `0c0207b` | 388 renderer tests, TypeScript typecheck, production core build, quantitative torus/saddle/sphere/Fandisk/Bunny verification, and 3 Mesh Analyze E2E tests passed |
| 9 — Target isolation and large-mesh workers | Complete | `e151abf` | 381 renderer tests, TypeScript typecheck, production renderer build, 3 Mesh Analyze E2E tests, and current-build Bunny/Armadillo/Dragon profiling passed |
| 10 — Scientific Inspector and computation history | Complete | `6ac85fe` | 394 renderer tests, TypeScript typecheck, production core build, and 3 Mesh Analyze E2E tests passed |
| 11 — Geometry ↔ Mesh analysis infrastructure | Complete | `c27abfc` | 397 renderer tests, full TypeScript typecheck, production core build, and 3 Mesh Analyze E2E tests passed |
| 12 — Regression suite and Mesh Analyze v1 freeze | Complete | `e2f2c42` | 54 focused unit tests, 397 renderer tests across 74 files, full TypeScript typecheck, production renderer build, 8 Mesh Analyze E2E scenarios, VTK/CGAL verification, and Bunny/Armadillo/Dragon profiling passed |

The implementation commits follow the numbered plan sections. Progress entries record completed code only after its relevant tests and build checks pass.

UI walkthrough: [Mesh Analyze UI guide — Commits 5–9](mesh-analyze-ui-guide-commits-5-9.md).

## Current assessment

Commits 1–12 are implemented. The Mesh Analyze v1 workflow is frozen by the acceptance contract in [Mesh Analyze v1 workflow freeze](mesh-analyze-v1-freeze.md).

Commit 6 validation completed locally with CGAL 6.2.1 from vcpkg, the Python CGAL worker environment, the native shortest-path helper, dependency and mesh-generation smoke checks, all three CGAL boolean operations, and numerical geodesic checks on plane, cylinder, sphere, graph-versus-surface, disconnected, and 5,776-vertex large-mesh cases. The full renderer suite also passed: **373 tests across 69 files**, plus TypeScript typecheck and the production renderer build.

Commit 7 validation covers cached dependency invalidation, cube crease edges, cylinder developable classification, torus elliptic/hyperbolic/parabolic regions, Fandisk, Stanford Bunny, scalar strengths, uncertainty, face regions, edge sets, polylines, viewport overlays, and shared Selection Inspector integration. The full renderer suite passed: **380 tests across 70 files**, plus TypeScript typecheck, the production renderer build, and all three Mesh Analyze E2E tests.

Commit 8 validation covers principal-family selection, directional strength and contrast, neighborhood and smoothing controls, minimum line length and confidence, cached directional derivatives/candidates/traced curves with provenance, unstable-direction suppression, and computation-derived readiness independent of overlay visibility. Quantitative torus, saddle, smooth-sphere negative, Fandisk, and Stanford Bunny checks passed. The full renderer suite passed: **388 tests across 71 files**, plus TypeScript typecheck, the production core build, and all three Mesh Analyze E2E tests.

Commit 9 validation covers Focus target, Ghost others, and Show scene display states; the default ghosted analysis context; construction-overlay suppression; worker-backed curvature and surface-feature extraction; queued/running/publishing/cancelled result states; revision/job guards; and current-build analysis profiling. The full renderer suite passed: **381 tests across 70 files**, plus TypeScript typecheck, the production renderer build, and all three Mesh Analyze E2E tests. The current-build profile passed on Stanford Bunny, Armadillo, and Dragon with curvature worker compute at 31–69 ms, surface-feature worker compute at 14–26 ms, overlay readiness at 164–234 ms, and probe latency at 109–208 ms; the generated report also records load time, analysis/load blocking, and analysis memory delta.

Commit 10 validation covers the consistent quantity/method/domain/statistics/percentiles/provenance/warnings result schema; complete selected vertex scalar/vector fields; edge/face mapped fields and native quality values; feature membership; principal-direction validity; canonical `MeshHealthResult` diagnostics; queued-to-terminal computation records; parameter/backend/duration/status/timestamp/revision metadata; and inspectable stale snapshots. The full renderer suite passed: **394 tests across 72 files**, plus full TypeScript typecheck, the production core build, and all three Mesh Analyze E2E tests.

Commit 11 validation covers the domain-neutral registry and result contracts, Geometry and Mesh adapters, domain-generic dependency resolution, exact dependency snapshots, and transitive invalidation across a custom three-level analytical quantity. The architecture audit confirmed that the shared core imports neither Geometry nor Mesh and that `App.tsx` does not import the generic analysis core directly. Geometry metrics and topology calculations remain in `geometry/analysisBridge.ts`; mesh topology and numerical algorithms remain Mesh-specific. The full renderer suite passed: **397 tests across 74 files**, plus full TypeScript typecheck, the production core build, and all three Mesh Analyze E2E tests.

Commit 12 validation groups the health, curvature, calculus, quality, geodesic-label, dependency-invalidation, and graph-routing contracts into a 54-test focused gate. Five acceptance scenarios cover a clean sphere, Fandisk, worker-backed Stanford Bunny, an open-boundary problem mesh, and live graph-versus-CGAL surface routing. Independent VTK references verify unit-sphere curvature and equilateral-triangle quality; native CGAL verification covers analytic surfaces, disconnected inputs, a 5,776-vertex mesh, and real-mesh booleans. The current-build Bunny/Armadillo/Dragon profile passed, as did **397 renderer tests across 74 files**, full TypeScript typecheck, the production renderer build, and all **8 Mesh Analyze E2E scenarios**.

```powershell
cd C:\Math3D
npm --prefix renderer test
npm run typecheck:noemit
npm run build:renderer
npm run test:mesh-analyze:v1:acceptance
```

## Next priorities

Mesh Analyze v1 has no remaining planned implementation commits. Future changes should preserve the frozen workflow and acceptance scenarios or begin a separately reviewed v2 roadmap.

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

**Status: implemented.**

Already implemented:

- Sharp/feature-edge selection with tests.
- Curvature-line and feature overlays.

Completed:

- [x] Implemented the reusable mesh → normals → curvature → principal-directions → surface-features dependency chain with exact cache-version snapshots and stale-result propagation.
- [x] Added curvature-threshold, elliptic, hyperbolic, parabolic/developable, and umbilic candidate classifications.
- [x] Exposed Gaussian-zero, curvature, umbilic, uncertainty-band, and sharp-edge tolerances in Mesh Analyze.
- [x] Added explicit per-vertex uncertainty flags and confidence strengths derived from differential warnings and distance from decision thresholds.
- [x] Cached edge sets, vertex masks/index sets, majority-classified face regions, parabolic and feature polylines, and scalar-strength arrays in one canonical payload.
- [x] Integrated class membership with viewport point/line overlays and the shared sampled-vertex Selection Inspector, including downsampled meshes through source vertex indices.
- [x] Added cube, cylinder, torus, Fandisk, and Stanford Bunny verification plus dependency-invalidation and Electron workflow coverage.

Acceptance: feature extraction consumes cached analysis and uses the common result/selection system.

## Commit 8 — Ridges and valleys

Planned message: `mesh-analysis: add principal-curvature ridge and valley extraction`

**Status: complete.**

Already implemented:

- Detection and stitching algorithms.
- Thresholds, confidence values, and umbilic-suppression options.
- Ridge/valley overlays.

Completed:

- [x] Made extraction depend on the validated cached mesh k1/k2/d1/d2 result and its validity/warning masks.
- [x] Added principal-family, curvature-strength, directional-contrast, minimum-line-length, confidence, smoothing, neighborhood, sampling, decimation, and curve-limit controls.
- [x] Cached directional derivatives, candidate masks/confidence, display segments, traced polylines, summaries, parameters, and dependency provenance in the shared analysis-result store.
- [x] Suppressed invalid, non-manifold, degenerate, nearly-flat, umbilic, inconsistent-orientation, identity-failing, and underfit directions while reporting uncertainty counts.
- [x] Derived Ready from a successfully published result with validated principal directions, independently of ridge/valley overlay visibility.
- [x] Added quantitative torus, saddle, smooth-sphere negative, Fandisk, and Stanford Bunny tests plus result-readiness and Electron workflow regression coverage.

Acceptance: mark ready only after quantitative tests pass.

## Commit 9 — Target isolation and large-mesh workers

Planned message: `mesh-analysis: add target focus and worker-backed large-mesh execution`

**Status: implemented.**

Already implemented:

- Shared workspace and visibility controls.
- Large-mesh previews and deferred analysis.
- Quality worker, cancellation mechanisms, benchmark assets, and profiling scripts.

Completed:

- [x] Added Analyze target-display states: Focus target, Ghost others, Show scene.
- [x] Defaulted Analyze to Ghost others with construction overlays hidden unless requested.
- [x] Moved curvature and surface-feature extraction—including their validation summaries—off the UI thread; mesh quality remains worker-backed.
- [x] Standardized queued/running/publishing/cancel/cancelled states and guarded publication by job ID and exact mesh revision.
- [x] Added current-build profiling for load/compute time, UI blocking, memory delta, overlay cost, and probe latency.
- [x] Verified responsive Stanford Bunny, Armadillo, and Dragon analysis on the current implementation.

Acceptance: large-mesh analysis remains interactive while worker results publish atomically for the current mesh revision.

## Commit 10 — Scientific Inspector and computation history

Planned message: `mesh-analysis: complete scientific Inspector result views`

**Status: implemented.**

Already implemented:

- Result, Selection, Diagnostics, and History tabs.
- Detailed curvature statistics, histogram, extrema, and computation metadata.
- Local probe values, quality summaries, and operation/probe history.

Completed:

- [x] Provided consistent quantity/method/domain/statistics/percentiles/provenance/warnings across all result families.
- [x] Displayed validated principal directions and complete vertex scalar/vector/mapped-quality values.
- [x] Completed face and edge scientific fields, including feature membership and native face/edge quality values.
- [x] Used the canonical `MeshHealthResult` contract directly for Diagnostics.
- [x] Recorded analysis computations with parameters, backend, duration, status, timestamp, revision, dependencies, and compact result summaries.
- [x] Preserved stale computations for inspection and clearly distinguished them from current viewport output.

Acceptance: the right Inspector is authoritative for scientific interpretation.

## Commit 11 — Geometry ↔ Mesh analysis infrastructure

Planned message: `analysis-core: share result semantics across Geometry and Mesh`

**Status: implemented in `c27abfc`, completing checkpoint `e83fdd2`.**

Already implemented:

- Geometry↔Mesh promotion/analysis bridge and tests.
- Reusable mesh result helpers.

Completed:

- [x] Extracted domain-neutral result, identity, state, parameter, dependency, history, histogram, field, palette/range, probe, provenance, and scientific-summary contracts under `renderer/src/analysis/`.
- [x] Extracted the generic result cache, parameter hashing, exact dependency invalidation, revision-lineage staleness, computation history, and registry cycle validation.
- [x] Routed Mesh through thin result-store and registry adapters while keeping mesh identity hashing, backend inference, topology, quality, discrete curvature, geodesics, and feature extraction Mesh-specific.
- [x] Added a Geometry adapter and extensibility test showing that a future analytical quantity can use the shared registry/result store without rewriting Geometry.
- [x] Routed Mesh scalar statistics and selected-entity probe metadata through the shared contracts.
- [x] Added Geometry dependency resolution with exact result keys, state, and versions.
- [x] Made shared dependency resolution generic over domain-specific domain types, removing adapter casts.
- [x] Added a direct shared-core regression proving transitive invalidation for a custom source → derived quantity → report chain.
- [x] Audited Geometry call sites and kept object metrics/topology in `geometry/analysisBridge.ts`, workflow-specific section analysis in Geometry, and discrete numerical algorithms in Mesh.
- [x] Verified the generic core has no Geometry/Mesh imports and `App.tsx` has no direct generic-core dependency.
- [x] Passed the focused 32-test handoff suite, the expanded 33-test affected suite, 397 renderer tests across 74 files, `npm run typecheck:noemit`, `npm run build:core`, and all three `tests/e2e/mesh-analyze-science.spec.ts` scenarios.

Acceptance: generic analysis infrastructure is not hard-coded into Mesh or the main application component.

## Commit 12 — Regression suite and Mesh Analyze v1 freeze

Planned message: `mesh-analysis: add end-to-end regression suite and freeze v1 workflow`

**Status: implemented.** The v1 workflow and its acceptance contract are documented in [Mesh Analyze v1 workflow freeze](mesh-analyze-v1-freeze.md).

Already implemented:

- Unit coverage for cache, summaries, quality, graph routing, and Geometry bridge.
- Scientific Mesh Analyze UI tests.
- Benchmark assets and regression scripts.

Completed:

- [x] Grouped unit coverage for health severity, curvature conventions, calculus, geodesic labels, quality, graph routing, and dependency invalidation into a focused 54-test gate.
- [x] Added independent VTK curvature/triangle-quality verification and completed native CGAL geodesic/boolean backend checks.
- [x] Added clean-sphere, Fandisk, worker-backed Bunny, problem-mesh, and graph-versus-surface end-to-end scenarios.
- [x] Ran numerical, integration, and performance acceptance checks.
- [x] Froze the v1 workflow after all acceptance checks passed.

Workflow constraints to preserve:

- Left: analysis configuration.
- Center: visualization and probe.
- Right: scientific results and diagnostics.
- One shared document scene.
- No engine-specific VTK/CGAL primary panels or restored equation-generation workflow in Mesh Analyze.

## Completed implementation sequence

1. Commit 11 extracted the shared analysis infrastructure.
2. Commit 12 ran the full acceptance suite and froze v1.

## Main implementation references

- `renderer/src/mesh/analysisResultStore.ts`: mesh identities, cached results, dependencies, diagnostic payloads.
- `renderer/src/mesh/activeAnalysisResult.ts`: scientific summaries, statistics, method labels, readiness.
- `renderer/src/mesh/meshEntityScientificFields.ts`: vertex, edge, and face scalar/vector/quality/feature inspection.
- `renderer/src/mesh/meshQualityReport.ts`: quality summaries and defect lists.
- `renderer/src/workers/meshQualityReportWorker.ts`: quality-report worker.
- `renderer/src/workers/meshAnalysisWorker.ts`: differential-geometry and surface-feature worker.
- `renderer/src/App.tsx`: current mesh curvature, calculus, probe, and Inspector integration.
- `renderer/src/math/ridgeValley.ts` and `ridgeValleyStitch.ts`: ridge/valley detection and tracing.
- `renderer/src/mesh/edgeSelection.ts`: sharp/feature-edge selection.
- `renderer/src/math/selection/geodesicGraph.ts`: graph routing.
- `py/geodesic/`: heat-method implementation.
- `renderer/src/geometry/analysisBridge.ts`: Geometry/Mesh analysis bridge.
- `tests/e2e/mesh-analyze-science.spec.ts`: current scientific UI regression scenarios.
- `scripts/mesh-profile-suite.mjs`: large-mesh profiling.
- `scripts/mesh-analysis-profile-suite.mjs`: current-build Bunny/Armadillo/Dragon analysis profiling.
