# Curves v1 workflow freeze

Status: frozen on 2026-09-13 after Curves roadmap Commit 15.

This document is the maintained user, scientific, UI, interoperability, and release contract for Curves v1. The aggregate acceptance gate is:

```powershell
npm run test:curves:v1:acceptance
```

## Ownership boundary

Curves owns one-dimensional geometric meaning: canonical Curve identity and revision, parameter domains, orientation, closure and periodicity, exact or sampled evaluation, arc length, derivatives, curvature, torsion, moving frames, continuity, intersections, probes, plots, diagnostics, curve editing, and derived Curve operations.

Neighboring modules retain their own meaning:

| Module | Responsibility at a Curves boundary |
| --- | --- |
| Geometry | Scene membership, construction relationships, transforms, and exact construction sources. |
| Surfaces | Surface charts, smooth surface invariants, geodesic solving, and contextual surface normals or normal/geodesic curvature supplied to a linked Curve. |
| Mesh | Discrete connectivity, element quality, mesh repair/processing, and analysis of a polyline, tube, ribbon, sweep, or other CurveMesh derivative. |

A received or derived object is not relabeled. Source identity, source revision, conversion method, correspondence quality, warnings, and return navigation remain visible.

## Canonical workflow

```text
Define / construct / receive Curve
                |
                v
       Canonical Curve revision
                |
        +-------+---------+
        |                 |
        v                 v
 Sample + analyze     Edit / derive
        |                 |
        +-- probe         +-- spline/control edits
        +-- frames        +-- trim/join/offset
        +-- plots         +-- projection/intersection
        +-- diagnostics   +-- Surface request
        |                 |
        +--------+--------+
                 v
          Saved Curve result
                 |
        +--------+---------+
        |                  |
        v                  v
   CurveMesh / Mesh    Return to source
```

The ordinary user journey is:

1. Choose a source in **Gallery**, create one in **New**, or receive one from Geometry, Surfaces, or Mesh.
2. Inspect the canonical definition, domain, orientation, dependencies, and revision in the left workspace and right Inspector.
3. Choose uniform, adaptive, curvature-aware, tangent-angle-aware, uniform-arc-length, or source sampling. Sampling is derived evidence, never the source definition.
4. Run differential analysis, select an analysis-layer preset, or open diagnostics. The center viewport and scalar plots show the active evidence.
5. Select from the viewport, parameter slider, arc-length slider, plot, or diagnostic. Each route moves the same semantic probe.
6. Pin, compare, save, export, hide/show, frame, recompute, or remove result layers without mutating the Curve.
7. Edit the source or create a derived Curve. Prior results remain inspectable but become stale and cannot overwrite current evidence.
8. Create a live or baked CurveMesh, request a Surface operation, or return to the linked source with correspondence and provenance intact.

## Supported Curve representations

| Representation | Canonical meaning | Typical evaluation authority |
| --- | --- | --- |
| Parametric 2D/3D | `r(t)` over a finite domain | supplied analytic function or numerical derivatives |
| Explicit | graph converted to a parameterized Curve | native Math3D adapter |
| Implicit | selected one-dimensional branch represented with explicit provenance | extraction adapter, then labeled samples when no evaluator exists |
| Polar | radius/angle definition normalized to a parameterized Curve | native Math3D adapter |
| Bézier | degree and ordered control points | exact Bernstein/De Casteljau evaluation |
| B-spline | degree, complete knot vector, control points, closure flags | Cox–de Boor/De Boor evaluation |
| NURBS | B-spline data plus positive weights | homogeneous De Boor evaluation |
| Polyline/imported chain | ordered source samples and closure | piecewise-linear evaluation |
| Curve on Surface | Curve definition plus explicit Surface dependency/chart correspondence | Curve evaluator with Surface context |
| Derived Curve | operation, parameters, branches, and source dependencies | native or optional backend operation with recorded fallback |

Spline basis, knot, weight, closure, continuity, editing, and serialization rules are frozen separately in [Curve spline conventions](curves-spline-conventions.md).

## Parameter, orientation, closure, and arc-length semantics

- A domain is an ordered finite interval `[tMin, tMax]` with `tMax > tMin`. Declared breakpoints identify locations requiring one-sided sampling and continuity evidence.
- Orientation follows increasing parameter for analytic/spline curves and stored point order for polylines. Reversing a Curve creates a derived revision; it does not silently reinterpret signed results.
- `closed` means the two domain endpoints represent the same topological point. `periodic` means evaluation and supported derivatives repeat across the seam. Closure does not imply periodic derivatives.
- Sampling uses a deterministic endpoint/seam policy. A closed render payload does not duplicate a seam vertex unless the consumer explicitly requires it.
- Arc length `s(t)` is monotone over the oriented domain. The normalized coordinate is `s/L` in `[0,1]`. Both `t -> s` and `s -> t` use the revision's arc-length table and preserve endpoint behavior.
- Uniform-parameter and uniform-arc-length samples are different data products. A renderer may decimate evidence, but it must not claim that render spacing changed the underlying analysis method.
- Units are carried with every definition and result. Speed uses position/parameter units, curvature and torsion use inverse-position units, and arc length uses position units.

## Frozen differential-geometry conventions

- Position and first through third derivatives are evaluated from exact/provided functions when available. Otherwise the result is labeled numerical, spline, polyline, sampled, or backend; unavailable values remain unavailable.
- A point is regular only when its evaluation and required derivatives are finite and speed exceeds the recorded scale-aware tolerance.
- The unit tangent follows increasing parameter. Unsigned curvature is nonnegative. Planar signed curvature uses the stored orientation and plane-normal convention; reversing orientation reverses its sign.
- Torsion uses the oriented three-dimensional derivative convention. Planar regular curves have zero torsion when the method can establish planarity; unavailable third-order evidence is not displayed as zero.
- The Frenet normal/binormal exist only where regularity and nonzero-curvature requirements hold. They remain undefined at straight portions, inflections, cusps, or derivative singularities.
- The Bishop/parallel-transport frame is the stable visualization fallback. Its deterministic initial normal, seam holonomy, and fallback provenance are explicit; it is never relabeled as a Frenet frame.
- Osculating circle, osculating/normal/rectifying planes, curvature comb, evolute, tangent/normal/binormal glyphs, and surface-context frames are evidence derived from the active result revision.
- Curve-on-Surface results keep ambient curvature, normal curvature, and geodesic curvature distinct and retain the Surface ID/revision supplying context.
- Polyline curvature, torsion, and frames are discrete estimates with uncertainty. They are not presented as exact smooth invariants.

## Exact, analytic, sampled, and backend behavior

Every result records method, units, tolerances, warnings, uncertainty, timing, backend, Curve identity/revision, and dependency revisions.

- **Exact/analytic** is authoritative only when the Math3D kernel or source definition actually supplies the required evaluator and derivative evidence.
- **Numerical** means finite-difference, quadrature, fitting, or another continuous approximation. Convergence and uncertainty belong in the result.
- **Sampled/polyline** means values depend on discrete source or tessellation resolution. Mathematical discontinuities remain distinct from coarse sampling warnings.
- **VTK/CGAL** identifies a real optional adapter result. A native fallback keeps `Math3D native` provenance and records why fallback occurred.
- A missing optional engine never disables ordinary Curves workflows. Unsupported capabilities remain visible and deterministic.

## Semantic selection and local probe

A Curve pick contains Curve ID/revision, `t`, normalized parameter, `s`, normalized arc length, segment/span, world point, source mapping, local differential values, frame kind, and selection source. Viewport click, parameter slider, arc-length slider, scalar plot cursor, diagnostic selection, and replay all resolve through this contract.

Pinned probes and annotations retain source revision. After an edit they are marked stale rather than silently projected onto the new Curve. Persistent annotation classes are distance along curve, segment length, point, parameter, curvature, torsion, radius of curvature, tangent, and frame.

## Diagnostics and continuity

Typed diagnostics use `OK`, `Info`, `Warning`, or `Error` severity and include identity, category, parameter interval, evidence, method, uncertainty, mathematical/tessellation/tolerance distinction, and a suggested action.

The frozen categories are Geometry, Sampling, Continuity, Singularity, and Intersection, with a combined warnings filter. Detection includes invalid/NaN evaluation, zero speed, derivative singularity, cusp, discontinuity, repeated point, degenerate span, extreme curvature, sampling under-resolution, robust 2D self-intersection, near self-intersection, and sampled 3D proximity candidates. Declared joins and knots report C0/C1/C2 and G1/G2 evidence.

Selecting an issue moves the shared probe and frames its evidence. Diagnostics never repair or mutate a Curve automatically.

## Source identity, dependencies, and stale-state rules

- A canonical definition has a stable Curve ID and a monotonically changing revision. Its fingerprint covers representation, domain, source data, sampling policy, orientation, units, and dependencies.
- Each derived Curve or CurveMesh stores source IDs/revisions, operation parameters, branch selection, correspondence, and warnings.
- Cache identity includes Curve ID/revision, operation, parameters, tolerance, dependency revisions, and backend version.
- Late, cancelled, superseded, or wrong-revision worker results cannot publish into the active revision.
- Live derivatives follow their source. Baked products remain independently editable snapshots. Detaching removes live recomputation but preserves immutable lineage.
- Missing sources, partial correspondence, ambiguous branches, and stale dependencies are explicit lifecycle states.

## Result lifecycle and reproducible exports

Result cards expose state, method, units, statistics, uncertainty, warnings, dependencies, timing, and backend. Show/hide changes evidence only; select changes Inspector context; frame fits evidence; pin carries current-revision evidence; save records a reproducible reference; recompute creates current-revision evidence; remove deletes the result layer without deleting the Curve.

Analysis-layer presets orchestrate canonical computations and never create a second result system:

- **Curvature lab**
- **Frenet evidence**
- **Bishop stable frame**
- **Planar inflection map**
- **Spline continuity**
- **Tube preparation**

JSON, CSV, and SVG exports retain Curve identity, source revision, definition, sampling policy, method, units, tolerances, warnings, software/backend version, and the visible evidence manifest. Comparisons align common domains and preserve both methods/revisions instead of overwriting one result.

## Cross-module round trips

- **Geometry -> Curves:** preserve construction/source identity and exact evaluator when serializable; otherwise use explicitly sampled fidelity.
- **Surface -> Curves:** preserve Surface ID/revision, chart coordinates, path/geodesic metadata, and correspondence.
- **Curves -> Surface request:** send the canonical Curve dependency and requested projection/intersection/sweep behavior; Surfaces owns the produced smooth Surface.
- **Curves -> CurveMesh -> Mesh:** preserve Curve ID/revision, frame method, sampling, cross-section settings, mapping, and live/baked state.
- **Mesh -> Curves:** extract ordered boundary/feature/section chains or fit a Curve with approximation method, tolerance, residual, and correspondence.
- **Return to source:** navigate through the dependency edge and restore mapped selection/camera when correspondence permits. Partial or unavailable mapping is stated.

## Backend and worker responsibilities

Math3D native remains authoritative for canonical evaluation, analytic derivatives, arc-length mapping, differential geometry, Bishop transport, spline basis/editing, ordinary diagnostics, and supported derived operations.

VTK is an optional provider for suitable polyline/spline processing and conversion tasks. CGAL is an optional provider for robust planar intersection/arrangement, simplification, and supported projection or feature operations. Advanced engine-specific parameters and logs belong in Services or Mesh Analysis; ordinary Curves actions choose a safe implementation automatically.

Large sampling, differential fields, diagnostics/intersections, spline fitting, and heavy derived jobs run through the Curve worker coordinator. Jobs support progress, cancellation, timeout, retry, progressive preview labeling, exact cache fingerprints, transfer bounds, and stale-result rejection.

## Frozen UI responsibilities

| Region | Curves v1 responsibility |
| --- | --- |
| Left | Choose Gallery/New source, Definition, Analysis, Derived, or CurveMesh workflow and primary computation parameters. |
| Center | Show the Curve, semantic selection, probes, scalar layers, frames, diagnostics, construction evidence, previews, and camera. |
| Right | Explain Object, Result, Probe, Diagnostics, Sampling, Dependencies, Backend, and History with lifecycle actions. |

The top Curves shell retains **Panel**, **Actions**, and **Tools** groups. Source-definition presets remain separate from analysis-layer presets. Viewport display controls change appearance and visibility, not mathematics. Advanced controls stay in their owning panel instead of duplicating the same parameters in the viewport and Inspector.

### Retained compatibility controls

- Existing Gallery, New, Demo, custom-expression, uniform/adaptive sampling, frame density/scale, parameter slider, screenshot, and camera controls remain reachable.
- Imported Geometry section behavior remains available as a labeled polyline source.
- Existing top-level module navigation and back/forward behavior remain unchanged.
- Compatibility controls may be consolidated after v1 only with replacement parity, migration coverage, and an updated freeze decision. No control is removed merely because a professional equivalent exists elsewhere.

## Accepted journeys

1. Define/open -> sample -> differential analysis -> linked probe -> pin/save/export.
2. Apply each analysis-layer preset -> inspect actual plot and viewport evidence -> independently hide/show/select/frame/remove.
3. Edit source -> prior result becomes stale -> recompute or compare revisions without late-result publication.
4. Diagnose cusp/discontinuity/intersection -> navigate to local evidence -> inspect method/tolerance without mutation.
5. Edit Bézier/B-spline/NURBS controls, knots, weights, and continuity -> preserve valid serialization and undo/revision behavior.
6. Build derived Curve branches -> preview -> commit -> regenerate/freeze/detach -> return to source.
7. Geometry <-> Curves and Surface <-> Curves round trips retain source identity and correspondence quality.
8. Curve -> live/baked CurveMesh -> Mesh Analysis -> boundary/feature extraction back to Curves retains lineage.
9. Cancel/retry worker work, reject stale output, reuse only an exact dependency-cache hit, and continue after worker/backend failure.
10. Save/reload result references, probes, annotations, derived relations, visibility, and history without serializing heavy typed arrays.
11. Use desktop, tablet, phone portrait, and phone landscape layouts without clipping primary navigation or losing touch containment.

## Curves QA checklist

Before a Curves v1-compatible release:

- [ ] Begin from a clean checkout with no unrelated working-tree changes.
- [ ] Run `npm run test:curves:v1:unit`; verify canonical/pathological truth, lifecycle, interop, persistence, worker, and fallback tests.
- [ ] Run `npm run typecheck:noemit` and `npm run build:core`.
- [ ] Run `npm run test:curves:v1:e2e`; verify all cross-module journeys pass in Electron.
- [ ] Run `npm run test:app:responsive:smoke` for phone portrait, phone landscape, tablet, and desktop layouts.
- [ ] Run `npm run verify:curves:v1:backends`; missing optional Curve endpoints must report unsupported/unregistered and native fallback must stay green.
- [ ] Run `npm run profile:curves:v1`; verify reviewed 1k/10k/100k, high-curvature, control-point, intersection, tube, transfer, and cache-memory budgets.
- [ ] Prefer the aggregate `npm run test:curves:v1:acceptance`, which runs all maintained gates above.
- [ ] Run `npm run capture:curves:v1:screenshots` after an intentional UI change and review all baseline images at 100% scale.
- [ ] Confirm result method/backend labels, source revision, units, warnings, stale state, and unavailable values in the Inspector.
- [ ] Confirm source edits, rapid switches, cancellation, and module changes cannot publish stale evidence.
- [ ] Confirm exports contain provenance and do not serialize large runtime fields or typed arrays into workspace state.

## Screenshot baseline

Generate the frozen reference views after `npm run build:renderer`:

```powershell
npm run capture:curves:v1:screenshots
```

| Baseline | Viewport | Review target |
| --- | ---: | --- |
| [Desktop analysis](assets/screenshots/curves-v1/math3d-curves-v1-desktop-analysis.png) | 1440 × 960 | Three-region professional shell, Analysis workflow, viewport evidence, scalar plots, and Inspector. |
| [Tablet workspace](assets/screenshots/curves-v1/math3d-curves-v1-tablet-workspace.png) | 900 × 1180 | Wrapped professional navigation, analysis entry, and horizontally reachable center/Inspector columns. |
| [Phone workspace](assets/screenshots/curves-v1/math3d-curves-v1-phone-workspace.png) | 390 × 844 | Compact module navigation, Gallery-first entry, persistent status, and horizontally reachable viewer/Inspector panels. |

The PNGs are review references, not pixel-perfect test oracles. The maintained E2E and responsive gates enforce behavior and geometry; regenerate images only for an intentional accepted UI change.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Blank development window with a missing ESM export | Reload after rebuilding and import runtime functions from their concrete module when a barrel creates a cycle. Do not hide the exception. |
| Frenet frame disappears | Inspect regularity and curvature. Use the explicitly labeled Bishop fallback; do not force undefined Frenet values. |
| Plot/probe locations disagree | Check Curve revision and the active `t <-> s` table. A stale pinned probe must not drive current evidence. |
| Curve looks coarse but diagnostics claim no discontinuity | Inspect Sampling separately and tighten tolerance; coarse tessellation is not a mathematical discontinuity. |
| VTK/CGAL action is unavailable | Open Backend/Services. Confirm capability status and native fallback; optional absence is supported. |
| Worker result never appears | Inspect request ID, cancellation/timeout, dependency fingerprint, retry details, and whether a newer revision superseded it. |
| Derived result does not update | Inspect live/baked/detached state and source dependency revisions. Baked or detached products intentionally do not follow source edits. |
| Surface or Mesh return selection is partial | Inspect correspondence method and confidence. Partial mapping is valid when explicitly labeled. |
| Workspace reload loses heavy fields | Expected: heavy arrays are recomputed. Definitions and lightweight result/probe/dependency references are the persisted contract. |

## Change policy

Implementation-only improvements may land when the aggregate gate remains green and scientific/provenance labels are unchanged. Any change to parameter/orientation semantics, differential conventions, continuity or diagnostic meaning, tolerance classes, cache identity, persistence schema, cross-module ownership, primary action meaning, or an accepted journey requires:

1. an explicit versioned contract and migration decision;
2. mathematical, lifecycle, and cross-module regression coverage;
3. an update to this freeze document and the roadmap;
4. review of missing-backend and stale-result behavior;
5. refreshed screenshot baselines when layout changes intentionally.

New capabilities extend the canonical Curve, result, selection, and dependency graph. They must not introduce parallel identities, hidden recomputation, unlabeled fallback, or a second result history.
