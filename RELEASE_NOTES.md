# Math3D 1.5.0

## Type

Professional mathematics-workbench release.

## Highlights

- Professionalized the Mesh Analysis, Geometry, Surface Analysis, Curves, Volume, and Topology workspaces with explicit source identity, revision-safe results, provenance, diagnostics, and workflow-specific release gates.
- Completed Topology v1: canonical finite 2-complexes, structural validation, exact integer cellular boundaries, integral and mod-2 homology, Euler consistency, certified surface classification, finite-CW fundamental-group presentations, abelianization, source-authoritative v2 documents, invariant comparison, and read-only Mesh/Geometry adapters.
- Completed Volume v1 with synchronized orthogonal slicing, spatial context, transfer functions, derived isosurfaces, masks/labels, import/export, comparison, persistence, worker caching, and camera stability.
- Completed Curves v1 with canonical definitions, robust/adaptive sampling, differential geometry, linked probes, spline/NURBS editing, derived operations, cross-module round trips, optional backend adapters, result layers, and regression/performance gates.
- Consolidated Surface Analysis around exact and sampled differential geometry, curvature/features, geodesics, charts, derived SurfaceMesh lifecycle, backend bridges, layered presets, and workflow QA.
- Expanded Geometry into a provenance-aware professional workspace with object/scene workflows, construction and modification tools, selection, measurement, analysis, derived results, Mesh round trips, persistence, and release coverage.
- Expanded Mesh Analysis with diagnostics, exact source/result identity, curvature and principal directions, surface fields, quality workflows, geodesics, CGAL/VTK-backed operations where available, visual evidence layers, presets, and regression gates.

## Reliability and interoperability

- Module navigation preserves each workspace's current context instead of falling back to Surfaces.
- Cross-module handoffs retain source IDs, revisions, conversion method, fidelity, correspondence, warnings, and return navigation.
- Heavy computations use workers, cache/invalidation contracts, or explicit interactive budgets to keep the renderer responsive.
- Topology distinguishes authoritative quotient/incidence data from non-authoritative R³ realizations and refuses unsupported or ambiguous conversions instead of guessing.
- Release checks include typechecking, production builds, unit suites, desktop Electron E2E flows, responsive layouts, worker protocol checks, and Windows/Linux packaging workflows.

## Compatibility

- Existing Topology v1 documents remain loadable through the read-only migration path; v2 documents store authoritative source data and verify or rebuild derived caches.
- Existing Mesh, Geometry, Surface, Curve, and Volume workflows remain available through their module tabs and compatibility handoffs.
- CGAL, VTK, and Python-worker capabilities remain capability-gated. Missing optional providers are reported and reviewed fallbacks are used only where documented.

## Known limits

- Topology v1 is intentionally scoped to finite 2D CW complexes and triangulated 2D snapshots. Higher-dimensional complexes, cohomology/cup products, persistent homology, general group-isomorphism solving, and embedding proofs remain future work.
- Interactive Topology adapter analysis applies an explicit V/E/F budget; dense display tessellations must be exported as a coarser explicit snapshot for exact Smith-normal-form work.
- Large gallery and multi-module sessions can still have high renderer memory peaks; ongoing viewer-lifetime and code-splitting work remains recommended.

## Verification

- `npm run test:topology:v1:acceptance`
- `npm run typecheck:noemit`
- `npm --prefix renderer run test`
- `npm run build:core`
- `npm run test:app:startup:smoke`
- `npm run test:app:geometry:smoke`
- `npm run test:app:e2e:fast`
- `npm run test:release:smoke`

Release installers and archives are built by the tag-triggered GitHub release workflow for `v1.5.0`.
