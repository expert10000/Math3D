# Curves professional implementation roadmap

Assessment date: 2026-09-12

Reviewed checkout: `c6c1e1d` — feat(surface-analysis): add layered workflow presets

Planning source: supplied Curves-module professionalization proposal, extended after inspection of the current Curve Core, Curves workspace, exact Geometry curve analysis, Surface result layers, and Geometry/Surface/Mesh handoffs

The numbered commits below are implementation plans, not claims that corresponding Git commits are complete. The roadmap turns Curves into Math3D's canonical one-dimensional differential-geometry workbench while preserving the current Curve Core viewer and keeping clear ownership boundaries with Geometry, Surfaces, and Mesh.

## Product boundary

**Curves owns the definition, evaluation, sampling, analysis, editing, and derivation of one-dimensional geometric objects. Geometry owns scene-level construction semantics. Surfaces owns two-dimensional smooth-surface mathematics. Mesh owns discrete mesh topology, quality, and processing.**

A curve extracted from a Surface or Mesh remains linked to its source, but its one-dimensional mathematics is computed in Curves. A tube, ribbon, or polyline generated from a curve is a provenance-linked derived Mesh, not a second unrelated object.

| Curves owns | Neighboring module owns |
| --- | --- |
| Curve parameter domains, orientation, closure, and periodicity | Geometry scene membership, general construction relationships, and object-level transforms |
| Exact, analytic, spline, sampled, and polyline curve evaluation | Surface charts, tangent planes, shape operators, and smooth geodesic solving |
| Adaptive and arc-length-aware curve sampling | Mesh element quality, connectivity, repair, remeshing, and decimation |
| Tangent, curvature, torsion, Frenet frame, and Bishop frame | Surface K/H/k1/k2 fields and Mesh discrete curvature fields |
| Curve continuity, cusps, inflections, and self-intersections | Surface singularities and Mesh non-manifold or bad-element diagnostics |
| Curve-derived constructions such as offset, evolute, trim, join, and projection | Boolean solids, surface trimming bodies, and general topology editing |
| Bézier, B-spline, and NURBS curve editing | Surface spline patches and solid CAD feature history |
| Curve-level result layers, probes, plots, histories, and exports | Source-module results that produced an input curve |
| Curve-to-Surface and curve-to-Mesh requests plus lineage | Surface tessellation and Mesh processing after handoff |

For a curve on a Surface, Curves owns speed, arc length, curvature, torsion, frames, and curve diagnostics. Surface Analysis may supply contextual values along the path—surface normal, normal/geodesic curvature, chart coordinates, and source geodesic metadata—through an explicit dependency rather than duplicate the curve engine.

## Preservation rule

The professionalization is additive until parity is verified. Existing capabilities remain reachable throughout the roadmap:

- The current Curves module and `Curve Core` workspace.
- Parametric 2D/3D, polar-style, Bézier, B-spline, NURBS, control-based, derived, custom-expression, and special-curve presets.
- Circle, ellipse, Lissajous, hypotrochoid, helix, and the existing demonstration catalog.
- Uniform and adaptive sampling controls, domain controls, custom expressions, and closed-curve controls.
- Current T/N/B frame visualization, parameter slider, point probe, curvature/torsion readouts, arc-length summary, camera reset, and screenshot capture.
- Geometry section-to-Curves handoff and imported polyline behavior.
- Geometry exact-curve analysis and its analytic fixtures until Curves consumes the shared implementation with parity.
- Existing top navigation, responsive behavior, theme, persistence, back/forward navigation, and module switching.

Controls may be renamed, moved, merged, or retired only after their replacement covers the same workflow and the decision is recorded in this roadmap or the final Curves workflow freeze. Compatibility controls that do not yet fit the professional shell remain under an expandable **Existing tools** group.

## Current implementation assessment

The repository already contains a useful Curve foundation:

- `packages/core/src/geometry/curve-core` defines shared 2D/3D curve types, domains, evaluation, numerical first/second derivatives, curvature, torsion, Frenet frames, arc length, bounding boxes, validation, reparameterization, and uniform/adaptive sampling.
- `renderer/src/math/curvePresetFactory.ts` adapts formulas and special B-spline/NURBS demonstrations to the shared core model.
- `renderer/src/components/CurveViewer.tsx` renders 2D/3D sampled curves, closed seams, T/N/B glyphs, a local probe marker, axes, grid, orbit controls, touch gestures, camera fitting, and cleanup.
- The Curves workspace has family/category filtering, presets, custom x(t)/y(t)/z(t), domain editing, uniform/adaptive controls, frame controls, a parameter slider, local κ/τ values, arc length, and compact diagnostics.
- Curves accepts a Geometry section handoff as a closed or open 3D polyline with retained source name, section length, area, segment count, and a curve-local probe.
- `renderer/src/geometry/exactCurveAnalysis.ts` already implements exact line, circle, helix, and piecewise fixtures; first through third derivatives; speed; Frenet data; curvature; torsion; inflection/stationary/degenerate events; extrema; adaptive-Simpson arc length; osculating evidence; and uncertainty.
- Geometry already publishes exact curve results through the shared analysis request/result pipeline. Surface Analysis already publishes revision-safe curve result layers. These implementations should be reused rather than copied.
- The existing optional VTK/CGAL worker infrastructure and Mesh-operation registry can host curve adapters without making the Curve Core dependent on either engine.

The main gaps are consolidation, completeness, and workflow ownership:

- `CurveBase` has no canonical revision, source dependency, periodicity, units, coordinate system, sampling policy, or derivative-capability contract.
- Representation-specific metadata is incomplete; explicit, implicit, polar, curve-on-surface, derived, and imported polyline curves are not yet normalized through one adapter registry.
- Adaptive sampling currently uses midpoint chord error only and does not robustly handle seams, discontinuities, cusps, oscillations, derivative singularities, or uniform arc-length output.
- Curve results are calculated primarily inside the current workspace render state instead of a revision-safe Curve Analysis result store with cache, cancellation, stale state, history, and saved results.
- The exact Geometry curve engine and the Curve Core overlap. Curves should become authoritative while Geometry calls it through an adapter.
- Frenet behavior exists, but Bishop frames, stable inflection handling, signed planar curvature, full plane/osculating evidence, and scalar plots are incomplete.
- Diagnostics are currently compact render errors rather than typed, selectable issues with continuity and intersection evidence.
- Bézier/B-spline/NURBS presets evaluate, but there is no unified CAD-style control-point, knot, weight, and continuity editor.
- Derived curve operations and cross-module round trips are not yet one dependency-aware workflow.
- The Curves UI does not yet follow the professional left-compute / center-evidence / right-inspection hierarchy used by Geometry, Surface Analysis, and Mesh Analysis.
- There is no dedicated Curves acceptance command, functional E2E suite, performance profile, or frozen workflow contract.

Baseline verification at this assessment:

- **12 focused curve tests across 2 renderer files** pass for preset construction and exact curve analysis.
- The focused baseline command is `npm --prefix renderer test -- src/math/curvePresetFactory.test.ts src/geometry/exactCurveAnalysis.test.ts`.
- No Curves-specific E2E or maintained `test:curves:*` acceptance command exists yet.

## Implementation progress

| Plan | Status | Existing foundation | Main work remaining |
| --- | --- | --- | --- |
| 1 — Canonical Curve identity and result contract | Complete (`e5127b8`) | Revisioned identity, all representation adapters, shared request/result publication, exact Geometry bridge, compact persistence, visible provenance | None for Commit 1 |
| 2 — Robust sampling and arc-length kernel | Complete (`916c7a8`) | Deterministic multi-criterion sampling, bounded evaluation, seam-safe render payloads, monotone arc-length maps, visible diagnostics | None for Commit 2 |
| 3 — Professional workspace responsibility split | Complete (`c3f3baa`) | Professional shell, five focused work panels, viewport-only display controls, eight-tab Inspector, Curve-aware status bar | None for Commit 3 |
| 4 — Differential geometry and stable frames | Complete (`e82ca97`) | Unified differential field, third derivatives, honest Frenet validity, Bishop transport, evidence geometry, planar and Surface-linked invariants | None for Commit 4 |
| 5 — Linked local probe, plots, and annotations | Planned | Parameter slider, probe glyph, local κ/τ readout | Semantic picking, synchronized plots/evidence, pin/compare/export, persistent annotations |
| 6 — Diagnostics, continuity, and intersections | Planned | Basic core validation and exact events | Typed severity model, C/G continuity, robust intersections, issue navigation |
| 7 — Dependency-aware derived curves | Complete (`02e0f37`) | Derived preset category, Geometry construction recipes, canonical operations, dependency lifecycle, and explicit branches | None for Commit 7 |
| 8 — Bézier, B-spline, and NURBS editing | Complete | Canonical spline definitions/evaluation, CAD edits, construction evidence, continuity tools, and revision history | None for Commit 8 |
| 9 — Geometry and Surface interoperability | Complete | Canonical exchange envelopes preserve evaluators or labeled samples, identity, chart correspondence, stale navigation, and Curve-to-Surface requests | None for Commit 9 |
| 10 — Provenance-linked CurveMesh workflows | Planned | Curve samples and shared Mesh handoff infrastructure | Polyline/tube/ribbon/sweep outputs, source return, Mesh extraction into Curves |
| 11 — Optional VTK and CGAL adapters | Planned | Existing backend workers and Mesh operation registry | Curve operation adapters, capabilities, fallback, parity, provenance |
| 12 — Workers, dependency cache, and performance | Planned | Shared worker/result patterns in Geometry/Surface/Mesh | Curve jobs, cancellation, progressive publication, budgets, memory controls |
| 13 — Result lifecycle and analysis presets | Planned | Shared saved-result patterns and Surface layer presets | Curve result cards, visibility, save/compare/export, useful layered presets |
| 14 — Regression matrix and performance gates | Planned | Exact fixtures and repository-wide E2E infrastructure | Canonical/pathological matrix, cross-module journeys, tolerances, profiles |
| 15 — Documentation and professional workflow freeze | Planned | Geometry/Surface/Mesh freeze precedents | User workflow, conventions, engine ownership, QA checklist, screenshot baseline |

Progress entries receive a Git hash only after the relevant focused tests, typecheck, production build, and required E2E/backend checks pass.

## Target architecture

```text
Curve source
├── Parametric 2D / 3D
├── Explicit / implicit / polar
├── Bézier / B-spline / NURBS
├── Polyline / imported edge chain
├── Curve on Surface
└── Derived curve
        │
        ▼
Canonical Curve identity + revision + dependencies
        │
        ├───────────────────────────┬───────────────────────────┐
        ▼                           ▼                           ▼
Curve evaluation              Curve Analysis              Derived products
exact / analytic /            revision-safe results       curves / surfaces /
sampled / backend             and saved layers            CurveMesh
        │                           │                           │
        ├── sampling                ├── local probe             ├── source links
        ├── t ↔ s                   ├── frames and fields       ├── regeneration
        ├── derivatives             ├── diagnostics             └── module handoff
        └── uncertainty             └── plots/evidence
```

The canonical Curve layer owns identity and mathematical meaning. Render samples, plots, and derived meshes are revision-bound products. A backend result never replaces the source curve definition and never masquerades as an exact result.

## Canonical contracts

Commit 1 should extend the shared domain-neutral analysis infrastructure rather than introduce a second generic result store.

```ts
type CurveRepresentation =
  | "parametric"
  | "explicit"
  | "implicit"
  | "polar"
  | "bezier"
  | "b-spline"
  | "nurbs"
  | "polyline"
  | "curve-on-surface"
  | "derived";

type CurveMethod =
  | "analytic"
  | "symbolic"
  | "automatic-differentiation"
  | "numerical-derivatives"
  | "polyline-estimate"
  | "vtk"
  | "cgal";

type CurveIdentity = {
  curveId: string;
  curveRevision: number;
  sourceModule: "curves" | "geometry" | "surfaces" | "mesh";
  sourceId?: string;
  sourceRevision?: number;
};

type CurveDefinition = {
  identity: CurveIdentity;
  name: string;
  representation: CurveRepresentation;
  dimension: 2 | 3;
  domain: {
    parameter: string;
    min: number;
    max: number;
    closed: boolean;
    periodic: boolean;
    orientation: string;
  };
  units: { parameter: string; position: string; angle: "rad" };
  coordinateSystem: string;
  evaluator: unknown;
  derivativeCapabilities: readonly ("first" | "second" | "third")[];
  samplingPolicy: CurveSamplingPolicy;
  dependencies: readonly CurveDependency[];
};

type CurveAnalysisPayload =
  | CurveSamplePayload
  | CurveDifferentialFieldPayload
  | CurveProbePayload
  | CurveDiagnosticsPayload
  | CurveIntersectionPayload
  | DerivedCurvePayload
  | CurveMeshPayload;
```

Every published result additionally retains request parameters, result kind, method/backend, units, timing, warnings, uncertainty, source revision, dependency revisions, cache state, and typed payload. Typed arrays remain in the analysis cache; persisted documents store lightweight definitions and result references.

## Mathematical conventions to freeze

For a regular curve `r(t)` with derivatives `v = r'(t)`, `a = r''(t)`, and `j = r'''(t)`:

```text
speed       = ||v||
T           = v / ||v||
curvature   = ||v × a|| / ||v||³                  (3D)
signed κ    = (x'y'' - y'x'') / ||v||³            (oriented 2D)
B           = normalize(v × a)
N           = B × T
torsion     = ((v × a) · j) / ||v × a||²
radius      = 1 / |κ| when |κ| > tolerance
arc length  = integral ||r'(t)|| dt
```

The result must mark quantities undefined when `||v||` or `||v × a||` falls below a scale-aware tolerance. It must not silently replace undefined mathematical values with zero. Display fallbacks—especially a Bishop frame near zero curvature—must be labeled as display/transport choices rather than Frenet values.

For planar curves, positive signed curvature follows the configured plane normal and increasing parameter direction. Reversing the curve reverses signed curvature and tangent orientation but preserves unsigned curvature and total length. Closed curves use an explicit seam policy; periodicity and closure are related but distinct properties.

For polylines, curvature, tangent, and arc length are discrete estimates with vertex/segment conventions and endpoint policies recorded in the result. Curve-on-surface results distinguish ambient curvature `κ`, normal curvature `κn`, geodesic curvature `κg`, and geodesic torsion when Surface context is available.

## UI responsibility target

The Curves layout should follow the professional Geometry and Surface shells while remaining curve-specific:

```text
Curves
├── Panel: Scene | Object | View | Analysis | Services | Theory
├── Actions: Gallery | New | Demo | Compare | More
└── Tools: Construct | Edit | Analyze | Navigate

left   = choose or define a curve; choose computations and parameters
center = viewport, parameter selection, plots, previews, and visual evidence
right  = object, result, diagnostics, sampling, dependencies, backend, history
bottom = curve identity, representation, samples, result state, units, backend
```

The left Analysis panel chooses work: differential geometry, frames, diagnostics, continuity, intersections, derived curves, and CurveMesh generation. The viewport toolbar controls visibility only: curve, control polygon, samples, T/N/B or Bishop frame, curvature comb, osculating geometry, diagnostic markers, derived previews, and annotations. Visibility changes must never trigger recomputation.

The parameter selector remains near the viewport and synchronizes the viewport probe, scalar plots, Inspector, and selected diagnostic. The right Inspector explains results and lifecycle; it does not become a second computation form.

## Commit 1 — Canonical Curve identity, representation, and result contract

Planned message: `refactor(curves): define canonical curve workspace and result contract`

**Status: complete — `e5127b8`.**

Already implemented:

- Shared `AnyCurve`, `Curve2D`, `Curve3D`, `CurveDomain`, and evaluator contracts.
- Core evaluation/derivative utilities and Curve preset adapters.
- Shared analysis registry/result-store infrastructure used by Geometry and Surface Analysis.
- Exact Geometry curve definitions already carry revisions, units, orientation, formulas, and derivative capabilities.

Remaining:

- [x] Add canonical Curve identity, revision, representation, source, dependency, units, coordinate-system, domain, closure, periodicity, orientation, and sampling-policy contracts.
- [x] Normalize parametric, explicit, implicit, polar, Bézier, B-spline, NURBS, polyline, curve-on-surface, and derived curves through an adapter registry.
- [x] Define Curve analysis result kinds and typed payloads in the shared analysis registry.
- [x] Publish Curve results through revision-safe requests/results with queued, running, ready, cancelled, deferred, error, and stale states.
- [x] Reuse the exact Geometry curve implementation through a Curves-owned adapter and retain compatibility imports during migration.
- [x] Persist Curve definitions, lightweight result references, workspace state, and saved presets without serializing evaluator functions or large typed arrays.
- [x] Add contract tests proving Curve Core has no renderer, Surface, Mesh, VTK, or CGAL dependency.

Validation at `e5127b8`:

- **25 focused Curve/shared-analysis tests across 5 files** pass.
- The full renderer suite passes: **588 tests across 112 files**.
- `npm run typecheck:noemit` and `npm run build:core` pass.
- The first Curves functional E2E journey passes, including visible identity/revision provenance, formula-edit revision advancement, and compact workspace persistence.
- `npm run test:app:responsive:smoke` passes for phone portrait, phone landscape, tablet, and desktop layouts.

Acceptance: every supported curve family enters the same workspace and issues the same revision-bound analysis request; the Inspector can state what the curve is, where it came from, how it was evaluated, and whether its results are current.

## Commit 2 — Robust adaptive sampling and arc-length parameterization

Planned message: `feat(curves): add robust sampling and arc-length parameterization`

**Status: complete — `916c7a8`.**

Already implemented:

- Uniform parameter sampling.
- Recursive midpoint chord-error adaptive sampling.
- Numerical arc-length integration and a polyline length fallback.
- Domain clamping and basic curve validation.

Remaining:

- [x] Define deterministic uniform-parameter, chord-error, tangent-angle, curvature-aware, hybrid adaptive, and uniform-arc-length modes.
- [x] Add minimum/maximum sample count, tolerance, angular tolerance, curvature threshold, maximum depth, and evaluation-budget controls.
- [x] Split around declared breakpoints and refine invalid, singular, cusp-like, high-curvature, and discontinuity candidates under explicit budgets.
- [x] Handle closed seams and periodic domains without duplicate render segments or missing analytical end segments.
- [x] Prevent a highly oscillatory curve from passing only because its midpoint lies on the endpoint chord by using non-dyadic interior probes.
- [x] Produce monotone `t -> s` and `s -> t` lookup tables with local segment length, total length, normalized arc-length coordinate, validity masks, and error estimates.
- [x] Record invalid samples, subdivision reason counts, tolerance/depth saturation, sample/evaluation budget exhaustion, and seam warnings.
- [x] Publish one reusable typed sample payload for rendering and downstream analysis, Surface construction, and CurveMesh generation.

Validation at `916c7a8`:

- **35 focused Curve/shared-analysis tests across 6 files** pass; the robust sampler contributes **11 deterministic kernel tests**.
- The full renderer suite passes: **598 tests across 113 files**.
- `npm run typecheck:noemit` and `npm run build:core` pass.
- The Curves functional E2E journey passes and verifies visible sampled length, the `t <-> s` table, normalized probe arc coordinate, and predictable sample-count reduction when tolerance is relaxed.
- `npm run test:app:responsive:smoke` passes for phone portrait, phone landscape, tablet, and desktop layouts.

Acceptance: sampling is deterministic, seam-safe, and explainable; increasing tolerance predictably reduces samples, difficult regions receive more samples, and `t -> s -> t` round trips remain within the declared tolerance.

## Commit 3 — Professional Curves workspace and UI responsibility split

Planned message: `refactor(curves): separate construction display and inspection workflows`

**Status: complete — `c3f3baa`.**

Already implemented:

- Left preset/category browser, central definition panel, Curve viewer, selection slider, and compact diagnostics.
- Application-level Curves navigation, camera reset, screenshot capture, split panels, and touch support.
- Professional shell patterns in Geometry, Surface Analysis, and Mesh Analysis.

Remaining:

- [x] Add Panel, Actions, and Tools rows consistent with the other professional modules.
- [x] Organize the left region into Gallery, Definition/Edit, Analysis, Derived, and CurveMesh workflows.
- [x] Keep formula, domain, parameters, control data, units, and dependencies in Definition/Edit rather than mixing them with result readouts.
- [x] Add viewport-only toggles for curve, samples, control polygon, frames, comb, osculating evidence, diagnostics, annotations, and previews.
- [x] Add a right Inspector with Object, Result, Probe, Diagnostics, Sampling, Dependencies, Backend, and History tabs.
- [x] Retain the parameter slider beside the viewport and synchronize it with the Inspector probe.
- [x] Replace stale status-bar fields with Curve ID/name, representation, dimension, sample mode/count, result state, units, and backend.
- [x] Preserve every current preset, custom formula, imported Geometry section, camera action, and responsive layout.

Validation at `c3f3baa`:

- The full renderer suite passes: **599 tests across 113 files**.
- `npm run typecheck:noemit` and `npm run build:core` pass.
- The Curves functional E2E journey passes and verifies the professional shell, Analysis workflow, Sampling Inspector, viewport controls, and Curve-aware status bar.
- `npm run test:app:responsive:smoke` passes for phone portrait, phone landscape, tablet, and desktop layouts.

Acceptance: normal curve definition and analysis can be completed from the professional shell without opening compatibility controls, while all existing Curves workflows remain reachable.

## Commit 4 — Complete differential geometry and stable moving frames

Planned message: `feat(curve-analysis): complete differential geometry and stable frames`

**Status: complete — `e82ca97`.**

Already implemented:

- Core numerical derivatives, curvature, torsion, and Frenet frame calculations.
- Exact Geometry evaluation of position, first/second/third derivatives, speed, κ, τ, radius, events, and selected osculating evidence.
- T/N/B visualization and aggregate κ/τ readouts in Curves.

Remaining:

- [x] Create one Curve differential point/field schema for exact, analytic, numerical, spline, polyline, and backend methods.
- [x] Compute position, first through third derivatives, speed, arc-length coordinate, tangent, normal, binormal, curvature, torsion, radius of curvature, and regularity masks.
- [x] Add a Bishop/parallel-transport frame with deterministic initial normal, closed-loop holonomy reporting, and stable handling around inflections and straight segments.
- [x] Add osculating circle, osculating plane, normal plane, rectifying plane, curvature comb, and evolute evidence.
- [x] For planar curves, add signed curvature, turning angle/turning number, inflection points, and convex/concave intervals.
- [x] For curve-on-surface inputs, expose ambient, normal, and geodesic curvature with an explicit Surface dependency.
- [x] Add field statistics, extrema, units, uncertainty, validity/regularity masks, warnings, and method provenance.
- [x] Ensure undefined Frenet quantities remain undefined while the viewport uses an explicitly labeled Bishop-frame fallback.

Validation at `e82ca97`:

- **41 focused Curve tests across 6 files** pass, including analytic circle and helix truth cases, straight-line stability, planar inflection orientation, Surface curvature decomposition, and numerical cusp regularity.
- The full renderer suite passes: **605 tests across 114 files**.
- `npm run typecheck:noemit` and `npm run build:core` pass.
- The Curves functional E2E journey passes and verifies the differential summary, turning-number result, Frenet/Bishop frame label, and osculating-evidence display control.
- `npm run test:app:responsive:smoke` passes for phone portrait, phone landscape, tablet, and desktop layouts.

Acceptance: circle and helix truth cases pass, a straight line stays stable, planar orientation conventions are reproducible, and an inflection or zero-curvature segment never breaks rendering.

## Commit 5 — Linked local probe, scalar plots, and persistent annotations

Planned message: `feat(curve-analysis): add linked probes plots and osculating evidence`

**Status: complete in `96b0cd4`.**

Already implemented:

- Normalized parameter slider, probe position, T/N/B glyph, and local κ/τ values.
- Geometry exact-analysis visualization payloads include curves, frames, curvature combs, osculating evidence, and scalar plot rows.

Delivered:

- [x] Define a revision-safe semantic curve pick containing `t`, normalized parameter, arc-length coordinate, segment/span, world point, and source mapping.
- [x] Synchronize viewport click, parameter slider, arc-length slider, scalar plot cursor, selected diagnostic, and Inspector probe.
- [x] Plot speed, curvature, signed curvature, torsion, and sampling error against `t` or normalized arc length.
- [x] Add visible tangent/normal/binormal or Bishop axes and osculating evidence at the selected point; retain optional Surface-context evidence from Commit 4.
- [x] Add persistent distance-along-curve, segment-length, point, parameter, curvature, torsion, radius, tangent, and frame annotations.
- [x] Support pin, replay, compare, copy, save, and JSON/CSV export for probes.
- [x] Preserve source/revision identity and mark stale probes after curve edits.

Validation at `96b0cd4`:

- **14 focused tests across 3 Curve analysis files** pass for pick identity, staleness, scalar domains, comparison, export, and persistence round trips.
- `npm run typecheck:noemit` and `npm run build:renderer` pass.
- The Curves functional Electron E2E journey passes and covers plot and arc-length selection, linked Inspector evidence, three persisted probes, comparison, nine annotation classes, and local-storage restoration.
- The runtime-only `sampleCurveRobust` ESM import is resolved directly, avoiding the sampling barrel cycle that previously blanked the development window.

Acceptance: selecting a point from the viewport, plot, slider, or diagnostic resolves to the same curve location and visual evidence; pinned probes survive workspace reload with valid provenance.

## Commit 6 — Professional diagnostics, continuity, and intersections

Planned message: `feat(curve-analysis): add diagnostics continuity and intersections`

**Status: complete in `b37031d`.**

Already implemented:

- Core validation messages.
- Exact stationary, degenerate, inflection, piecewise-transition, and scalar-extrema events.
- Basic workspace sampling errors.

Delivered:

- [x] Define typed diagnostic identity, severity (`OK`, `Info`, `Warning`, `Error`), parameter interval, evidence, method, uncertainty, suggested action, and mathematical/tessellation/tolerance distinction.
- [x] Detect invalid evaluations, NaN/Infinity, zero-speed points, derivative singularities, cusps, discontinuities, duplicate points, degenerate segments/spans, extreme curvature, and sampling under-resolution.
- [x] Detect exact or robust 2D self-intersections and near self-intersections; provide candidate/tolerance reporting for sampled 3D proximity.
- [x] Report C0/C1/C2 and G1/G2 continuity at declared piecewise, spline-knot, and joined-curve breakpoints.
- [x] Distinguish mathematical discontinuity from a merely coarse tessellation and exact intersection from tolerance-based proximity.
- [x] Add Inspector summaries and filters for Geometry, Sampling, Continuity, Singularities, Intersections, and warnings.
- [x] Make every diagnostic navigable: selecting an entry places the shared parameter/arc-length probe and frames its local evidence.
- [x] Add save, compare, filter, JSON/CSV export, and recompute lifecycle actions.

Validation at `b37031d`:

- **39 focused Curve analysis tests across 6 files** pass, including regular circle, cusp/zero speed, duplicate and degenerate spans, C/G join continuity, mathematical discontinuity, exact sampled 2D crossing, and sampled 3D proximity fixtures.
- The full renderer suite passes: **615 tests across 116 files**.
- `npx tsc -p renderer/tsconfig.app.json --noEmit` and `npm run build:renderer` pass.
- The Curves functional Electron E2E journey passes and verifies typed summary counts, save/recompute/compare, diagnostic-to-probe navigation, and persisted result references.
- `npm run test:app:responsive:smoke` passes for phone portrait, phone landscape, tablet, and desktop layouts.

Acceptance: pathological fixtures produce typed, reproducible diagnostics; clicking an issue moves the shared probe to its evidence without changing or recomputing unrelated results.

## Commit 7 — Dependency-aware derived curve operations

Planned message: `feat(curves): add dependency-aware derived curve operations`

**Status: implemented.**

Already implemented:

- A Derived preset category.
- Geometry construction recipes for sampled offset, projection, intersection, boundary, iso-curve, and normal-curve concepts.
- Shared scene dependency and result-provenance infrastructure.

Remaining:

- [x] Implement offset, evolute, involute, normal curve, tangent indicatrix, curvature indicatrix, projection, transform, trim, reverse, split, join, and reparameterize.
- [x] Add planar tangent/normal constructions, curve/curve intersection, closest point, coordinate extrema, and bounding box.
- [x] Add 3D closest points, curve/plane intersection, curve/surface intersection request, projection to plane, and projection to Surface.
- [x] Standardize choose operation → collect semantic inputs → preview → configure tolerance/branch → commit.
- [x] Preserve source Curve IDs/revisions, operation parameters, branch choices, correspondence, and warnings.
- [x] Recompute downstream curves when dependencies change; support freeze snapshot, detach, regenerate, open source, and delete.
- [x] Represent multiple branches as a result collection instead of silently selecting one.
- [x] Define failure behavior for cusps, offset singularities, ambiguous joins, incompatible dimensions, and missing backend capability.

Validation:

- Focused derived-curve unit coverage verifies analytic constructions, sampled planar/3D queries, explicit branch and capability results, and every dependency lifecycle transition.
- The renderer TypeScript project and production renderer build pass.
- The Curves Electron journey previews and commits an offset, selects both split branches, and verifies an unavailable Surface projection remains inspectable and cannot be committed.

Acceptance: every derived curve is an ordinary canonical Curve with inspectable lineage, deterministic recomputation, explicit branch handling, and a reversible path to its source.

## Commit 8 — CAD-style Bézier, B-spline, and NURBS editing

Planned message: `feat(curves): add Bezier B-spline and NURBS editing workflows`

**Status: implemented.**

Already implemented:

- Bézier, B-spline, and NURBS preset categories.
- De Boor evaluation for demonstration B-spline and rational NURBS curves.
- Shared Geometry construction catalog entries for Bézier/B-spline/NURBS curves.

Remaining:

- [x] Add canonical spline definitions containing degree, control points, knot vector, weights, closure/periodicity, clamping, and valid parameter domain.
- [x] Implement stable basis, derivative, knot-span, endpoint, and rational evaluation in Curve Core.
- [x] Add selection modes for curve, segment/span, control point, knot, and weight handle.
- [x] Render and edit control polygons, control points, knot markers, weighted influence, and De Casteljau/De Boor construction evidence.
- [x] Support Bézier subdivision, degree elevation/reduction where valid, B-spline knot insertion/removal, and NURBS knot/weight editing.
- [x] Add endpoint position/tangent/curvature constraints and C0/C1/C2/G1/G2 join tools.
- [x] Keep mathematical definition separate from display tessellation and store edits in revisioned history with undo/redo.
- [x] Include a canonical rational NURBS circle fixture and round-trip serialization tests.

Validation:

- The focused Curves suite passes 54 tests across 9 files, including exact spline shape-preservation, rational-circle, continuity, revision history, and serialization fixtures.
- The renderer TypeScript project and production renderer build pass.
- The complete Curves Electron suite passes control-point and weight editing, undo/redo revisions, construction evidence, derived workflows, diagnostics, and canonical persistence.
- Responsive smoke coverage passes phone portrait, phone landscape, tablet, and desktop layouts.
- Basis, knot, weight, closure, continuity, and serialization conventions are recorded in `docs/curves-spline-conventions.md`.

Acceptance: editing a control point, knot, degree, or weight produces a new Curve revision; evaluation and continuity remain mathematically valid; the control representation round-trips without being reduced to samples.

## Commit 9 — Canonical Geometry and Surface interoperability

Planned message: `feat(curves): integrate Geometry and Surface curve round trips`

**Status: implemented.**

Already implemented:

- Geometry section curves can open in Curves as imported polylines.
- Geometry exact curves and Surface curve/feature result layers already exist.
- Geometry/Surface scene identity and dependency contracts are available.

Remaining:

- [x] Add **Open in Curves** for Geometry analytic curves, section curves, intersections, construction paths, boundaries, and extracted edge/path selections.
- [x] Add **Open in Curves** for Surface boundaries, iso-u/iso-v curves, geodesics, sections, principal curves, feature curves, and Surface/Surface intersections.
- [x] Preserve exact/parametric definitions when available; use an explicitly labeled polyline approximation only when a source has no evaluator.
- [x] Retain host Surface ID/revision, parameter-space mapping, branch identity, units, selection correspondence, and generation settings.
- [x] Route extrusion, revolution, sweep, ruled surface, loft input, and tube-surface requests from Curves to canonical Surface construction.
- [x] Map selected curve locations back to Geometry entities or Surface chart coordinates where correspondence exists.
- [x] Add source/derivative navigation and stale-state behavior in both directions.
- [x] Remove duplicate curve-analysis algorithms from Geometry/Surface only after parity tests pass.

Validation:

- Nineteen focused interoperability, Curve infrastructure, and Surface-layer tests pass, including exact evaluator parity, sampled multi-branch fallback, Surface chart mapping, stale/detach behavior, and all six Curve-to-Surface request kinds.
- The renderer TypeScript project and production renderer build pass.
- The Electron Curves journey verifies visible exact-versus-sampled provenance, source/chart selection mapping, Surface request routing, approximation warnings, and stale-input blocking.

Acceptance: exact definitions and sampled fallbacks remain visibly distinct, and a supported Geometry/Surface → Curve → Surface/Geometry journey preserves source identity, revision, selection correspondence, and return navigation.

## Commit 10 — Provenance-linked CurveMesh and Mesh interoperability

Planned message: `feat(curve-mesh): add provenance-linked curve mesh workflows`

**Status: planned.**

Already implemented:

- Canonical curve samples and frame glyph data.
- Provenance-linked SurfaceMesh live/snapshot/handoff model.
- Mesh Analysis source-return, correspondence, and worker infrastructure.

Remaining:

- [ ] Define `DerivedCurveMeshIdentity`, source revision, sampling/frame settings, correspondence, variant, state, and regeneration history.
- [ ] Support points/vertices, polyline, tube, ribbon, swept profile, and frame-glyph geometry outputs.
- [ ] Add tube radius, radial/longitudinal resolution, caps, profile, twist, and Frenet/Bishop frame policy.
- [ ] Add ribbon width, orientation, twist, frame, seam, and boundary policies.
- [ ] Expose **Mesh (live)**, **Bake to Mesh**, and **Open in Mesh Analysis** with the same semantic distinction used by Surface Analysis.
- [ ] Add **Open Curve Source**, regenerate, detach, freeze, delete, inspect provenance, and source/mesh selection mapping.
- [ ] Extract Mesh boundary loops, feature-edge chains, selected edge chains, cross-sections, and polylines into Curves.
- [ ] Offer optional spline fitting as a derived Curve with fitting tolerance and residuals—not as silent conversion.

Acceptance: Curve → Mesh and Mesh → Curve round trips preserve lineage, mapping, frame/sampling policy, and explicit approximation quality; Mesh-specific analysis remains in Mesh.

## Commit 11 — Optional VTK and CGAL curve-engine adapters

Planned message: `feat(curves): add optional VTK and CGAL engine adapters`

**Status: planned.**

Already implemented:

- Optional Python worker and VTK/CGAL infrastructure.
- Shared Mesh-operation registry, backend status, logs, validation, fallback, and provenance patterns.
- A Math3D analytical Curve Core that can remain authoritative.

Remaining:

- [ ] Add capability-based adapters rather than direct backend calls from React components.
- [ ] Evaluate VTK for resampling, smoothing, spline filters, tube/ribbon generation, and conversion to visualization datasets.
- [ ] Evaluate CGAL for robust 2D intersections, polyline simplification, arrangements, projection/intersection operations, and feature/polyline processing.
- [ ] Keep exact/analytic operations on the Math3D kernel unless an explicit backend comparison is requested.
- [ ] Record backend name/version, operation, input/output count, tolerance, runtime, warnings, validation, and fallback.
- [ ] Define missing-backend and unsupported-capability behavior without disabling the Curves module.
- [ ] Add native-versus-backend parity checks and preserve source/selection correspondence.
- [ ] Keep advanced backend parameters in Services or Mesh Analysis where they belong; ordinary Curves workflows choose a safe implementation automatically.

Acceptance: Curves works fully without VTK/CGAL; supported adapters are optional, inspectable, parity-tested accelerators or robust-operation providers with deterministic fallback.

## Commit 12 — Worker execution, dependency cache, and performance budgets

Planned message: `perf(curves): workerize heavy computations and cache curve results`

**Status: planned.**

Already implemented:

- Shared worker, cancellation, progressive-result, revision guard, and cache patterns in Mesh and Surface Analysis.
- Curve sampling/evaluation functions that can be extracted from React render state.

Remaining:

- [ ] Move large sampling, differential fields, diagnostics, intersections, spline fitting, and heavy derived operations off the UI thread.
- [ ] Define cache keys from Curve identity/revision, operation, parameters, tolerance, dependencies, and backend version.
- [ ] Reuse shared samples and derivative fields across plots, probes, diagnostics, derived curves, and CurveMesh generation.
- [ ] Add request IDs, cancellation, revision guards, stale-result rejection, progress, retry, timeout, and failure details.
- [ ] Publish coarse progressive previews only when they are labeled and cannot overwrite a later full result.
- [ ] Add reviewed budgets for 1k, 10k, and 100k samples plus high-curvature and many-control-point cases.
- [ ] Bound plot/render decimation, glyph counts, serialized state, cache memory, and worker transfers.
- [ ] Add memory/profile checks for repeated module switching, preset changes, edits, recomputation, and backend failure.

Acceptance: heavy Curve work remains responsive and cancellable; cached work is reused only for the exact dependency fingerprint; stale worker results never replace a newer Curve revision.

## Commit 13 — Scientific result lifecycle and layered analysis presets

Planned message: `feat(curves): add result lifecycle and layered analysis presets`

**Status: planned.**

Already implemented:

- Result/save/compare/export/history patterns in Geometry, Surface Analysis, and Mesh Analysis.
- Surface Analysis layered workflow presets.
- Curves preset gallery for source definitions.

Remaining:

- [ ] Add typed Result cards with state, method, units, statistics, uncertainty, warnings, dependencies, timing, and backend.
- [ ] Add independent show/hide, select, frame, pin, save, compare, export, recompute, and remove actions for result layers.
- [ ] Separate source-definition presets from analysis-layer presets.
- [ ] Add useful revision-safe analysis presets such as **Curvature lab**, **Frenet evidence**, **Bishop stable frame**, **Planar inflection map**, **Spline continuity**, and **Tube preparation**.
- [ ] Ensure preset application orchestrates canonical computations and visibility without creating a parallel result store.
- [ ] Add reproducible JSON/CSV/SVG export manifests containing Curve identity, source revision, definition, sampling, method, units, tolerances, warnings, and software/backend version.
- [ ] Add comparison between revisions, methods, sampling policies, and native/backend results with common-domain alignment.
- [ ] Clear or mark active presets stale when Curve identity/revision changes and prevent rapid-switch completion races.

Acceptance: a user can apply a useful analysis stack, inspect each layer, reproduce it from exported provenance, compare it with another result, and safely revisit it after edits or reload.

## Commit 14 — Analytic regression matrix, cross-module journeys, and performance gates

Planned message: `test(curves): add regression matrix and performance gates`

**Status: planned.**

Already implemented:

- Exact line, circle, helix, and piecewise-V fixtures.
- Preset factory tests for ordinary and spline/NURBS examples.
- Repository-wide Vitest, Playwright, responsive, packaged-worker, and memory-profile infrastructure.

Remaining:

- [ ] Add canonical fixtures: line, circle, ellipse, parabola, hyperbola, helix, clothoid, catenary, Lissajous, hypotrochoid, Bézier, B-spline, and rational NURBS circle.
- [ ] Add pathological fixtures: cusp, inflection, almost-straight segment, derivative singularity, discontinuity, self-intersection, near intersection, oscillation, tiny loop, repeated points, degenerate spline span, and large coordinate range.
- [ ] Verify known length, tangent, signed/unsigned curvature, torsion, turning number, bounds, intersections, continuity, and frame behavior with scale-aware tolerances.
- [ ] Test adaptive convergence, seam closure, `t ↔ s`, deterministic ordering, invalid masks, and uncertainty contracts.
- [ ] Test source-edit invalidation, cancellation, stale-result rejection, save/reload, presets, exports, and missing backend fallback.
- [ ] Add functional journeys for Curve definition/analysis, diagnostics navigation, spline editing, derived curves, Geometry↔Curves, Surface↔Curves, Curve↔Mesh, and responsive layouts.
- [ ] Add reviewed performance profiles for 1k/10k/100k samples, high curvature, many control points, intersections, and tube generation.
- [ ] Add maintained commands `test:curves:v1:unit`, `test:curves:v1:e2e`, `verify:curves:v1:backends`, `profile:curves:v1`, and `test:curves:v1:acceptance`.

Acceptance: the maintained acceptance command proves mathematical truth cases, pathological behavior, interoperability, responsive UI, backend fallback, and reviewed performance budgets.

## Commit 15 — Unified workflow documentation and Curves v1 freeze

Planned message: `docs(curves): document and freeze professional Curves workflow`

**Status: planned.**

Already implemented:

- Professional workflow and freeze precedents for Geometry, Surface Analysis, and Mesh Analysis.

Remaining:

- [ ] Document the canonical workflow: define/receive → sample → analyze → diagnose/edit/derive → Surface or CurveMesh → source return.
- [ ] Document supported representations, exact-versus-sampled behavior, parameter/orientation/periodicity semantics, and `t ↔ s` behavior.
- [ ] Freeze derivative, curvature, torsion, Frenet/Bishop, planar-sign, polyline, and curve-on-surface conventions.
- [x] Document Bézier/B-spline/NURBS basis, knot, weight, closure, continuity, and serialization conventions. (`docs/curves-spline-conventions.md`)
- [ ] Document source/dependency identity, stale-state rules, selection correspondence, result lifecycle, and reproducible exports.
- [ ] Document Math3D/VTK/CGAL responsibilities and missing-backend fallback.
- [ ] Add a Curves QA checklist, acceptance-command reference, troubleshooting notes, and desktop/tablet/phone screenshot baseline.
- [ ] Record final additive UI decisions and any intentionally retained compatibility controls.
- [ ] Freeze Curves v1 only after Commit 14 passes from a clean checkout.

Acceptance: a new contributor can understand ownership, contracts, mathematics, UI workflow, interoperability, validation, and release gates without reading `App.tsx`; the documented acceptance command passes from a clean checkout.

## Proposed maintained acceptance commands

The exact file lists may evolve during implementation, but the final command family should follow the established module pattern:

```json
{
  "test:curves:v1:unit": "npm --prefix renderer test -- src/curveAnalysis src/math/curvePresetFactory.test.ts src/geometry/exactCurveAnalysis.test.ts src/analysis/resultStore.test.ts",
  "test:curves:v1:e2e": "playwright test tests/e2e/curves-functional.spec.ts tests/e2e/workspace-navigation.spec.ts tests/e2e/worker-failure-injection.spec.ts --reporter=list",
  "verify:curves:v1:backends": "npm run test:worker:smoke && <focused VTK/CGAL curve parity checks>",
  "profile:curves:v1": "npm --prefix renderer test -- src/curveAnalysis/performanceProfile.test.ts",
  "test:curves:v1:acceptance": "npm run test:curves:v1:unit && npm run typecheck:noemit && npm run build:core && npm run test:curves:v1:e2e && npm run test:app:responsive:smoke && npm run verify:curves:v1:backends && npm run profile:curves:v1"
}
```

The backend command must skip or report an explicit unsupported state when an optional engine is intentionally absent; it must not misreport a missing optional adapter as a mathematical Curve Core failure.

## Final v1 workflow target

```text
Define / construct / receive Curve
                │
                ▼
       Canonical Curve revision
                │
        ┌───────┴────────┐
        ▼                ▼
 Sample + analyze     Edit / derive
        │                │
        ├── probe        ├── spline/control edits
        ├── frames       ├── trim/join/offset
        ├── plots        └── projection/intersection
        └── diagnostics          │
                │                │
                └───────┬────────┘
                        ▼
                 Saved Curve result
                        │
             ┌──────────┼──────────┐
             ▼          ▼          ▼
          Geometry    Surface   CurveMesh / Mesh
             └──────────┴──────────┘
                        │
                        ▼
              inspect source / return
```

The professional baseline is complete only when these paths share canonical Curve identity, revision-safe results, explicit approximation provenance, semantic selection correspondence, and one maintained acceptance gate.
