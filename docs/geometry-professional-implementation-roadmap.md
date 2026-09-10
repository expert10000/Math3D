# Geometry professional implementation roadmap

Assessment date: 2026-09-10

Reviewed checkout: `63559ee` — docs: mark mesh analysis commit 12 complete

Planning source: `MATH3D_GEOMETRY_MODULE_PROFESSIONAL_PLAN.md`

The numbered commits below are implementation plans. Their titles do not claim that corresponding Git commits are complete. This roadmap compares the professional Geometry sketch with the current application, records what already works, and defines additive work that preserves the existing Geometry module.

## Preservation rule

Existing Geometry capabilities remain available while this roadmap is implemented. Reorganization begins by placing current tools inside clearer, expandable groups. A tool may be renamed, moved, merged, or retired only after its replacement covers the same workflow and a later review explicitly accepts the change.

The following are protected compatibility workflows:

- Object Gallery and scene Gallery, including search, filters, quick add, scene opening, timelines, and autoplay.
- New-object and new-scene entry points.
- Demo preview and replayable demonstration scenes.
- Procedural Geometry.
- Scratch editor and Workbook scene modes.
- Construction Lab, including Task, Build, Inspect, Claims, Script, and Scene.
- Scene to Script and Script to Scene in both directions.
- Existing transforms, direct topology edits, construction relationships, dependency views, histories, saved presets, and Geometry↔Mesh handoffs.

When a planned tool does not fit the eventual professional layout, keep it in an expandable **Existing tools** or **More** group until a separate decision is recorded here.

## Current implementation assessment

The current Geometry module is already substantial:

- Procedural objects have stable IDs, names, parameters, transforms, materials, visibility, and groups.
- Object and scene galleries exist, with filtering, quick add, replay steps, demos, debug scenes, and canonical scenes.
- Geometry supports object, face, edge, and vertex picking with hover preview, committed selection, topology references, stale-reference checks, contextual commands, and Inspector readouts.
- Construct includes primitives, parametric polyhedron families, reference geometry, placement previews, mathematical relationships, a dependency graph, and Construction Lab.
- Modify includes transforms and direct face, edge, and vertex edits with previews and operation history.
- Sections, measurements, object comparisons, variants, saved section curves, quick analysis snapshots, topology summaries, and Mesh Analyze handoff exist.
- Derived products expose readiness, stale state, provenance, regeneration, deletion, and dependency inspection.
- Geometry↔Mesh promotion, source restoration, topology history, object/face/edge/vertex trace maps, and round-trip demonstrations exist.
- Geometry has adapters for the shared analysis registry and result store.
- Scene scripting has a parser, transactional executor, diagnostics, serializer, and stable Scene→Script→Scene tests.
- Canonical regression scenes and release/stability tests already protect important workflows.

The largest architectural gap is mathematical representation. Most current object metrics and differential-analysis handoffs operate on rendered or promoted triangle meshes. The professional target requires analytic or parametric source definitions, exact derivatives where available, explicit sampled fallbacks, and visible provenance. Planned exact Geometry results must not be implemented by relabeling mesh estimates as analytic results.

Baseline verification at this assessment:

- **98 Geometry unit tests across 19 files** pass with `npm --prefix renderer test -- src/geometry`.
- The repository checkpoint has **397 renderer tests across 74 files** passing.
- Existing E2E coverage includes Geometry picking, Gallery/object scenes, responsive layout, topology editing, Mesh↔Geometry handoff, round-trip demos, and release preset loading.

## Implementation progress

| Plan | Status | Already implemented | Main work remaining |
| --- | --- | --- | --- |
| 1 — Professional workflow and scene contracts | Partial | Shared application scene behavior, Geometry modes, galleries, Scene panels, Scratch/Workbook | Add additive professional shell, revisioned scene identity, and protected navigation migration |
| 2 — Navigation, picking, semantic selection | Partial | Object/face/edge/vertex picking, hover/commit, contextual parity with Mesh | Add body/shell/feature semantics, filters, advanced selectors, and shared selection mapping |
| 3 — Construct hierarchy | Partial | Object Gallery, primitives, polyhedra, construction graph, previews and relationships | Organize complete reference/curve/surface/solid/derived taxonomy without hiding existing tools |
| 4 — Selection-driven Modify | Partial | Transforms, face/edge/vertex direct edits, operation tree and replay | Add exact curve/surface/body operations and explicit applicability explanations |
| 5 — Metadata, lineage and dependencies | Partial | Dependency trees, histories, variants, stale products, Geometry↔Mesh trace provenance | Add canonical revisions, representation metadata, complete source/dependent lineage and freeze/detach actions |
| 6 — Shared analysis request/result pipeline | Foundation exists | Shared registry/result-store adapter and quick-analysis snapshot bridge | Route live Geometry analysis through shared requests/results, caching, invalidation and history |
| 7 — Exact curve differential analysis | Planned | Curve viewing and construction lines/circles exist in adjacent workflows | Add analytic curve representation, derivatives, Frenet quantities, characteristic points and tests |
| 8 — Exact surface differential analysis | Planned | Surface-like procedural objects and Mesh differential handoff exist | Add analytic surface derivatives, fundamental forms, shape operator, classifications and tests |
| 9 — Intrinsic geometry and geodesics | Planned | Mesh/parametric geodesic infrastructure exists elsewhere in the app | Add Geometry metric, distortion and continuous geodesic workflow with provenance |
| 10 — Characteristic and critical geometry | Partial | Intersections, sections, relation checks and scalable line/point overlays exist | Add analytic characteristics, contact classification, singularities and reusable result layers |
| 11 — Topology, trim, continuity and validity | Partial | Mesh-readiness/topology summaries, construction validity and problem scenes | Add Geometry-native shell/trim/continuity/parameter-domain diagnostics and shared severity |
| 12 — Measurements, sections and reports | Partial | Basic metrics, distances/angles, sections, saved section curves and comparisons | Add unit-aware canonical measurement results, exact methods and report/export coverage |
| 13 — Sampled fields, workers and overlays | Planned | Geometry fast/full rendering and Mesh worker patterns exist | Add Geometry field workers, progressive publication, cancellation and overlay budgets |
| 14 — Analytic-versus-discrete comparison | Foundation exists | Object/variant metrics and Geometry↔Mesh source comparison exist | Add exact-vs-sampled error fields, norms, worst regions and correspondence-aware visualization |
| 15 — Inspector, saved results and provenance | Partial | Selection/Actions/Dependencies Inspector, quick results, variants and stale products | Unify scientific result schema, saved result lifecycle, compare and complete provenance |
| 16 — Geometry↔Mesh navigation and round trips | Partial, advanced baseline | Promotion contracts, trace maps, reverse source navigation, edit history and demos | Generalize lineage, tessellation settings, selection correspondence and source regeneration |
| 17 — Regression scenes, tolerances and performance | Partial | Canonical scenes, 98 Geometry unit tests, E2E/release/stability coverage | Add analytic truth cases, tolerance classes, pathological B-rep cases and Geometry analysis performance gates |
| 18 — Professional workflow freeze | Planned | Mature workflows exist but are not governed by one Geometry acceptance contract | Run complete acceptance suite and freeze the reviewed professional UX |

Progress entries should receive a Git hash only after the relevant implementation, focused tests, full typecheck, production build, and required E2E checks pass.

## Provisional Geometry UI direction

The professional layout should resemble the Mesh workflow while preserving Geometry-specific authoring:

```text
Geometry
├── Panel: Scene | Object | View | Analyze | Services | Theory
├── Actions: Gallery | New | Demo | Compare | More
└── Tools: Construct | Modify | Analyze | Navigate
```

Provisional action behavior:

- **Gallery** opens the existing object Gallery and scene Gallery through one expandable entry.
- **New** offers a blank procedural scene, object creation, construction scene, Scratch, Workbook, and import choices.
- **Demo** opens the current demo preview and replayable demonstration catalog.
- **Compare** opens object, revision, saved-result, and later exact-versus-Mesh comparison.
- **More** keeps Script, presets, debug scenes, legacy tools, export, and other lower-frequency actions accessible.
- **Scratch** remains a first-class workspace. Its final placement can be reviewed after the new shell is usable.

Desktop scientific layout:

```text
left   = intent, target and parameters
center = geometry, selection and visual evidence
right  = selected entity, results, diagnostics and provenance
bottom = state, progress, units and execution engine
```

Responsive layouts may turn the left and right regions into drawers, but their responsibilities remain the same.

## Scene and script contract

Scene scripting is part of the Geometry product and must remain functional throughout every commit.

Required directions:

```text
Scene → Script → editable text → Scene
Script → validated preview → transactional apply → Scene
```

Required guarantees:

- Stable object IDs and deterministic output ordering.
- Parameters, transforms, material, visibility, name, group, and committed selection round-trip.
- Invalid scripts produce line-specific diagnostics and do not partially mutate the scene.
- Dataset-backed or protected objects cannot be accidentally cleared by an unsupported command.
- Construction dependencies and future analytic definitions gain explicit script forms instead of being silently discarded.
- Scene-generated comments can be preserved when the selected synchronization mode requests it.
- Round-trip tests expand whenever a new Geometry entity or metadata field becomes scriptable.

The existing procedural scene serializer/executor and Construction Lab script workflow may remain separate internally until a shared syntax and migration path are proven.

## Commit 1 — Professional Geometry workflow and shared scene contracts

Planned message: `geometry: establish professional module workflow and shared scene contracts`

**Status: partially implemented.**

Already implemented:

- One application workspace with Geometry, Mesh, Surfaces, Curves, Volume, Topology, and other modules.
- Procedural, Demo preview, Scratch editor, and Workbook scene modes.
- Object Gallery, scene Gallery, viewer, Scene panel, right Inspector, histories, and saved presets.
- Geometry and Mesh coexist through shared application state and explicit handoffs.

Remaining:

- [ ] Introduce the professional Geometry shell additively: Gallery, New, Demo, Compare, and More actions plus Construct, Modify, Analyze, and Navigate tool groups.
- [ ] Keep the current mode strip during migration and place existing panels into expandable groups.
- [ ] Define a shared scene identity contract with object revision, module kind, source kind, parent, derived-from, dependencies, and metadata.
- [ ] Adapt Geometry objects and dataset-backed objects without replacing their current payloads.
- [ ] Ensure visibility, isolation, selection, history, save/load, and module switching use scene-level identity.
- [ ] Preserve Scratch, Workbook, Procedural, Demo, Construction Lab, and Scene Script entry points.
- [ ] Add navigation and persistence tests proving no existing workspace becomes unreachable.

Acceptance: the new shell can be used for normal Geometry work while every current Geometry mode and saved scene still opens.

## Commit 2 — Unified navigation, picking and semantic selection

Planned message: `geometry: unify picking navigation and semantic selection with Mesh`

**Status: partially implemented.**

Already implemented:

- Canonical Geometry picks for object, face, edge, and vertex.
- Hover preview and committed selection.
- World point, normal/tangent information, topology summaries, stale-reference detection, viewer highlights, breadcrumb, and Inspector readout.
- Contextual object/face/edge commands and E2E parity checks with Mesh.

Remaining:

- [ ] Extract or adopt a shared base pick contract used by Geometry and Mesh adapters.
- [ ] Add Geometry semantic IDs for body, shell, analytic face/surface, edge/curve, vertex/point, feature, trim, parameter location, and construction role.
- [ ] Add selection-level controls and filters for curves, surfaces, solids, construction, hidden, derived, and trim boundaries.
- [ ] Synchronize selection across viewport, Scene tree, Navigate panel, Inspector, saved results, and derived Mesh mappings.
- [ ] Add frame, isolate, hide others, parent/child, connected, loop, chain, similar, source, and derivative commands.
- [ ] Add Geometry selectors for tangent/G0/G1 connectivity, same radius, coplanar, coaxial, same surface type, and trim loops.
- [ ] Preserve empty-click clearing and tool-owned selection capture semantics.

Acceptance: a semantic selection retains its identity across supported panel and Geometry↔Mesh transitions.

## Commit 3 — Construct organized by geometric entity hierarchy

Planned message: `geometry: reorganize Construct around geometry entity hierarchy`

**Status: partially implemented.**

Already implemented:

- Searchable object Gallery with primitives, polyhedra, surfaces/helpers, quick add, parameters, and placement.
- Construction Lab nodes, constraints, claims, graph evaluation, previews, script, Scene view, and history.
- Reference points, lines, planes, relationships, sections, and mathematical construction presets.

Remaining:

- [ ] Organize expandable Construct groups: Primitives, Reference, Curves, Surfaces, Solids, and Derived.
- [ ] Map every existing creation tool into the taxonomy before adding new tools.
- [ ] Add missing curve types: polyline, interpolation, Bézier, B-spline, NURBS, helix, and composite.
- [ ] Add missing surface types: ruled, extrude, revolve, sweep, loft, Bézier, B-spline, NURBS, and Coons patch.
- [ ] Add solid construction for extrusion, revolution, sweep, and loft.
- [ ] Add derived offset, projection, intersection, boundary, iso-curve, and normal-curve creation.
- [ ] Standardize choose tool → collect references → preview → edit parameters → commit.
- [ ] Keep previews out of permanent scene history until committed.
- [ ] Ensure Scratch and procedural authoring produce ordinary scene objects with preserved source metadata.

Acceptance: existing construction tools retain behavior and every new tool uses the same preview/commit lifecycle.

## Commit 4 — Selection-driven Modify and Operate

Planned message: `geometry: consolidate selection-driven Modify and Operate tools`

**Status: partially implemented.**

Already implemented:

- Translate, rotate, scale, alignment, duplication, visibility, and variants.
- Direct face extrude/inset/delete/subdivide; edge split/bevel/collapse; vertex move/weld.
- Contextual previews, source slots, operation history, editable operation tree, undo/restore, and replay.

Remaining:

- [ ] Make Modify respond to the selected semantic entity rather than expose a flat command inventory.
- [ ] Add curve trim, split, join, extend, offset, reverse, reparameterize, approximate, smooth, degree, and knot operations.
- [ ] Add surface trim/untrim, split/join/extend/offset/orientation, projection, intersection, degree, and knot operations.
- [ ] Add body boolean, split, section, shell, thicken, offset, mirror, and pattern operations using the appropriate exact or sampled backend.
- [ ] Add reference move/reorient/rebuild/align/project operations.
- [ ] Represent every command as available, available with warning, or unavailable with an explanation.
- [ ] Preserve current direct topology tools as an expandable discrete-edit group when they do not apply to exact Geometry.

Acceptance: the selected entity determines applicable tools, and current edit/history workflows remain usable.

## Commit 5 — Geometry metadata, lineage and dependency inspection

Planned message: `geometry: add Geometry object metadata lineage and dependency inspection`

**Status: partially implemented.**

Already implemented:

- Construction dependency tree, update chain, operation tree, histories, variants, derived products, stale states, and regeneration actions.
- Geometry↔Mesh provenance and object/face/edge/vertex trace maps.
- Source restoration before/after mesh edits and dependency overlays in the viewport.

Remaining:

- [ ] Add canonical object revision and representation/source metadata.
- [ ] Record primitive type, parameterization, degree, knots, control count, trim state, closed/periodic state, orientation, bounds, units, and precision when applicable.
- [ ] Unify construction, operation, analysis, and Geometry↔Mesh edges in an inspectable lineage model.
- [ ] Add Open parent, Open source, Show dependencies, Show dependents, Recompute, Freeze derivative, and Detach copy.
- [ ] Define revision propagation and stale reasons for parameter, transform, topology, dependency, and tessellation changes.
- [ ] Persist lineage through scene save/load, Gallery presets, Scratch/Workbook handoff, and scripts where representable.

Acceptance: every derived object can explain its source, revision, operation, dependencies, and stale state.

## Commit 6 — Shared AnalysisRequest and AnalysisResult pipeline

Planned message: `geometry: connect Geometry to shared AnalysisRequest AnalysisResult architecture`

**Status: foundation implemented; live integration remains.**

Already implemented:

- Domain-neutral analysis contracts, registry, dependency resolution, result store, history, revisions, variants, and invalidation.
- A thin Geometry adapter with basic-metrics and topology-summary definitions.
- Quick Geometry analysis snapshots, basic metrics, topology summary, section summary, JSON save, variants, and Mesh Analyze handoff.

Remaining:

- [ ] Define Geometry request metadata for target object, semantic selection, domain, sampling, parameters, precision, and requested outputs.
- [ ] Route live quick analyses through the shared Geometry registry/result store rather than parallel component state.
- [ ] Expand result kinds for curves, surfaces, intrinsic geometry, features, diagnostics, measurements, comparisons, and reports.
- [ ] Use exact dependency keys, parameter fingerprints, source revisions, cached variants, stale payload inspection, and computation history.
- [ ] Standardize scalar/vector/curve/point/table/summary/warning payloads and backend provenance.
- [ ] Keep Geometry algorithms in Geometry adapters and workers; do not move domain mathematics into the generic core.

Acceptance: adding a Geometry analysis family requires a registry definition and domain implementation, not new result lifecycle code in `App.tsx`.

## Commit 7 — Exact curve differential analysis

Planned message: `geometry: add exact curve differential analysis`

**Status: planned.**

Remaining:

- [ ] Introduce analytic/parametric curve definitions with parameter domain, units, revision, and derivative capability metadata.
- [ ] Compute position, first/second/third derivatives, speed, tangent, normal, binormal, curvature, radius of curvature, torsion, and arc length.
- [ ] Detect stationary points, degenerate derivatives, inflections, and curvature/torsion extrema with uncertainty and tolerance metadata.
- [ ] Add tangent/normal/binormal vectors, Frenet frames, curvature combs, osculating circles/planes, and plots.
- [ ] Publish pointwise and sampled results through the shared pipeline.
- [ ] Add exact line, circle, and helix tests plus degenerate and piecewise cases.
- [ ] Reuse Curves-module mathematics when its contracts and conventions match, while keeping Geometry scene identity and results intact.

Acceptance: exact curve quantities agree with analytic truth and state their parameter, orientation, units, and precision.

## Commit 8 — Exact surface differential analysis

Planned message: `geometry: add exact surface differential analysis`

**Status: planned.**

Remaining:

- [ ] Introduce analytic/parametric surface definitions with valid parameter domains, seams, trims, orientation, and derivative capability metadata.
- [ ] Compute `r_u`, `r_v`, normal, tangent plane, Jacobian, first and second fundamental forms, metric tensor, area element, and shape operator.
- [ ] Compute `k1`, `k2`, `H`, `K`, principal directions, normal curvature, and elliptic/hyperbolic/parabolic/planar/umbilic/degenerate classification.
- [ ] Establish orientation and sign conventions shared by Inspector, overlays, export, and exact-versus-Mesh comparison.
- [ ] Add tangent bases, normals, principal directions, normal sections, curvature glyphs, and scalar heatmaps.
- [ ] Add exact plane, sphere, and cylinder tests, then torus and saddle tests.
- [ ] Mark sampled fallback explicitly when an exact derivative is unavailable.

Acceptance: plane, sphere, and cylinder quantities match analytic truth under documented conventions.

## Commit 9 — Intrinsic geometry, metric and geodesics

Planned message: `geometry: add intrinsic geometry metric and geodesic analysis`

**Status: planned.**

Remaining:

- [ ] Add curve/surface arc length, metric tensor, Christoffel symbols, area, volume, normal curvature, and geodesic curvature.
- [ ] Add Jacobian magnitude, local scale, anisotropy, angle distortion, area distortion, parameter stretch, and metric condition number.
- [ ] Implement start/destination picking for continuous or parametric geodesics.
- [ ] Add parameter grid, metric ellipse, distance contours, path, fan, direction-field, and normal-section overlays.
- [ ] Reuse appropriate existing parametric, heat, and CGAL geodesic engines through Geometry adapters with explicit provenance.
- [ ] Support disconnected domains, seams, poles, trims, multiple paths, and unavailable-engine diagnostics.
- [ ] Save path and distance-field results with source revision and endpoint semantics.

Acceptance: analytic and numerical intrinsic results identify their engine and satisfy canonical plane/cylinder/sphere tests.

## Commit 10 — Characteristic curves, singularities and critical geometry

Planned message: `geometry: add characteristic curves singularities and critical geometry`

**Status: partially implemented.**

Already implemented:

- Line/plane and other construction relationships, plane sections, saved section curves, relation constraints, and point/polyline overlays.

Remaining:

- [ ] Add umbilics, parabolic curves, elliptic/hyperbolic regions, ridges, valleys, silhouettes, isophotes, and curvature extrema.
- [ ] Classify curve-curve, curve-surface, surface-surface, surface-solid, and self-intersections as transverse, tangent, overlap, near-contact, or degenerate.
- [ ] Detect rank-deficient Jacobians, poles, seams, trim singularities, and collapsed spans.
- [ ] Publish characteristic points, polylines, isolines, bands, glyphs, labels, confidence, and uncertainty as reusable result layers.
- [ ] Promote an overlay to editable Geometry only through an explicit action.
- [ ] Add analytic cases and perturbed near-contact tests.

Acceptance: characteristic and intersection results distinguish mathematical type, numerical uncertainty, and display layer.

## Commit 11 — Topology, trim, continuity and validity diagnostics

Planned message: `geometry: add topology trim continuity and validity diagnostics`

**Status: partially implemented.**

Already implemented:

- Triangulated readiness checks, basic topology summary, construction validity, stale dependency states, problem presets, and diagnostic scene patterns.

Remaining:

- [ ] Define Geometry-native bodies, shells, faces, loops, edges, and vertices independently from render triangles.
- [ ] Detect invalid parameter domains, degenerate curves/surfaces, invalid trims, self-intersections, open shells, non-manifold joins, orientation problems, zero-length edges, collapsed trims, and duplicate boundaries.
- [ ] Evaluate `C0/G0`, `C1/G1`, and `C2/G2` continuity with position gap, tangent angle, normal angle, and curvature mismatch.
- [ ] Diagnose singularities, seams, poles, excessive stretch, poor metric conditioning, and trim-domain pathologies.
- [ ] Reuse the application severity vocabulary and expose Frame, Select, Isolate, Open source, and Attempt repair actions.
- [ ] Separate exact Geometry validity from tessellated-display mesh health while allowing both to be inspected.

Acceptance: Geometry diagnostics identify semantic entities and never present a triangle-mesh check as exact B-rep validity.

## Commit 12 — Measurements, sections and quantitative reports

Planned message: `geometry: add measurements sections and quantitative reports`

**Status: partially implemented.**

Already implemented:

- Point coordinates, object metrics, topology counts, distances, angles, bounds, sections, section length/area, saved section curves, object comparisons, and JSON result export.

Remaining:

- [ ] Register point-point distance, curve/edge length, angle, dihedral, radius, diameter, area, volume, centroid, bounds, and principal extents as canonical analysis results.
- [ ] Prefer exact analytic values when available and label numerical/tessellated fallback.
- [ ] Add plane, axis, normal, parameter, iso-u, and iso-v sections with stable result identity.
- [ ] Apply scene units consistently to length, area, volume, curvature, Gaussian curvature, torsion, and angles.
- [ ] Add display precision, scientific/engineering notation, and absolute/relative tolerance controls.
- [ ] Add report tables and export that preserve source, revision, selection, units, engine, parameters, and timestamp.
- [ ] Map current measurement tools into one expandable Measure group without removing shortcuts.

Acceptance: every displayed measurement can be saved, reproduced, and traced to an exact or sampled method.

## Commit 13 — Sampled fields, workers and scalable overlays

Planned message: `geometry: add scalable sampled fields and worker-backed overlays`

**Status: planned; supporting patterns exist.**

Already implemented:

- Geometry interaction-quality controls, fast/full rendering, overlay primitives, Mesh analysis workers, cancellation patterns, and revision-safe result publication elsewhere in the app.

Remaining:

- [ ] Add Geometry worker requests for dense curve/surface sampling and supported analyses.
- [ ] Publish pointwise/basic, coarse preview, refined, and full results progressively.
- [ ] Support cancel, supersede, timeout, stale-result rejection, and source-revision validation.
- [ ] Reuse shared overlay types for scalar heatmaps, vector fields, points, polylines, contours, glyphs, frames, labels, and diagnostics.
- [ ] Add per-layer visibility, opacity, density, scale, legend, range, clamp, source result, and source object metadata.
- [ ] Set budgets for samples, glyphs, labels, polylines, upload size, and frame time.
- [ ] Keep viewport interaction responsive during 10k and 100k-sample analyses.

Acceptance: heavy Geometry analysis runs outside the UI thread, can be cancelled, and cannot publish onto a changed source.

## Commit 14 — Analytic-versus-discrete comparison

Planned message: `geometry: add analytic-versus-discrete comparison`

**Status: foundation exists.**

Already implemented:

- Object A/B comparison, variant comparison, Geometry source versus promoted-mesh topology summary, Geometry↔Mesh trace maps, and linked source history.

Remaining:

- [ ] Compare analytic Geometry with display tessellation, derived analysis Mesh, and saved Mesh results.
- [ ] Add position, normal, curvature, area/volume, boundary, geodesic, and feature comparison metrics where correspondence supports them.
- [ ] Compute signed/absolute error, relative error, RMS, percentile, maximum, and worst-region selection.
- [ ] Show side-by-side values, difference heatmap, correspondence lines, worst markers, and summary tables.
- [ ] Record both source revisions, tessellation parameters, mapping confidence, engines, units, and tolerances.
- [ ] Explain unavailable comparisons when semantic correspondence is missing.

Acceptance: exact and discrete values remain visibly distinct and the comparison can locate the largest approximation errors.

## Commit 15 — Inspector, saved results, provenance and comparison workflow

Planned message: `geometry: complete Inspector saved results provenance and comparison workflow`

**Status: partially implemented.**

Already implemented:

- Right-side Selection, Actions, and Dependencies workflows.
- Pick details, properties, operations, histories, quick analysis result cards, variant comparison, derived product provenance, stale summaries, regeneration, and JSON save.

Remaining:

- [ ] Establish Inspector sections for Selection, Geometry, Analysis, Diagnostics, Provenance, History, and Actions.
- [ ] Display quantity, method, domain, units, precision, statistics, warnings, source revision, engine, sampling, parameters, timing, and timestamp consistently.
- [ ] Route saved Geometry analysis results through the shared result lifecycle: running, preview, complete, saved, failed, cancelled, stale, and superseded.
- [ ] Add Save, Rename, Compare, Duplicate settings, Recompute, Open source, Open derivative, Promote overlay, and Export actions.
- [ ] Preserve stale result payloads for inspection while preventing them from driving the current viewport.
- [ ] Remove duplicated controls only after the new location is tested and accepted.

Acceptance: the left side answers what to do; the right side explains the selection and result without duplicating primary configuration.

## Commit 16 — Geometry↔Mesh navigation and round-trip source relationships

Planned message: `geometry: unify Geometry Mesh navigation analysis and cross-module round trips`

**Status: partially implemented with an advanced baseline.**

Already implemented:

- Geometry-to-Mesh promotion modes and validity metadata.
- Object, face, edge, and vertex trace maps with provenance.
- Mesh mutation trace propagation, Open Geometry Source, Open Mesh Source, topology-history restoration, linked source cards, and round-trip demos.

Remaining:

- [ ] Make derived analysis Mesh a first-class scene relation rather than only a handoff snapshot.
- [ ] Separate ephemeral display tessellation from saved derived Mesh.
- [ ] Add chord tolerance, angular tolerance, maximum edge length, parameter density, normal strategy, welding, and boundary-preservation settings.
- [ ] Store Geometry revision and tessellation preset on every derived Mesh.
- [ ] Transfer semantic selections in both directions with exact, heuristic, partial, or unavailable mapping confidence.
- [ ] Regenerate linked meshes after Geometry changes while preserving history and comparison targets.
- [ ] Generalize round trips beyond current procedural/dataset objects to analytic curves, surfaces, trims, shells, and solids.
- [ ] Keep module navigation, Scene selection, Inspector, and camera context coherent.

Acceptance: Geometry→Mesh→Analyze→Compare and Mesh→Open Geometry Source→Analyze work without losing identity or provenance.

## Commit 17 — Regression scenes, numerical tolerances and performance gates

Planned message: `geometry: add canonical regression scenes numerical tolerances and performance gates`

**Status: partially implemented.**

Already implemented:

- Canonical Geometry regression scenes, serialization checks, finite metric checks, object-reference cleanup, traceability tests, problem scenes, stability guards, Gallery/release tests, and responsive E2E coverage.

Remaining:

- [ ] Add canonical curves: line, circle, helix, Bézier, B-spline, and degenerate curve.
- [ ] Add canonical surfaces: plane, sphere, cylinder, cone, torus, saddle, ruled, trimmed, and singular surface.
- [ ] Add canonical solids and pathological shells/trims/continuity joins.
- [ ] Define tolerance classes: symbolic identity, machine-precision analytic, numerically evaluated analytic, sampled field, and mesh approximation.
- [ ] Add numerical convergence, perturbation/noise, orientation, units, and exact-versus-discrete tests.
- [ ] Measure scene load, selection, pointwise analysis, 10k/100k sampling, overlay upload, cancel latency, module switch, Geometry→Mesh regeneration, and comparison.
- [ ] Add worker failure, stale publication, memory, and responsiveness gates.
- [ ] Build one focused Geometry acceptance command analogous to Mesh Analyze v1.

Acceptance: canonical and pathological cases pass documented tolerances and heavy analysis stays within reviewed responsiveness budgets.

## Commit 18 — Professional Geometry workflow freeze

Planned message: `geometry: freeze professional Geometry workflow and cross-module UX`

**Status: planned.**

Remaining:

- [ ] Run the complete Geometry unit, integration, E2E, numerical, backend, round-trip, persistence, accessibility, and performance gates.
- [ ] Verify Construct → Select → Inspect → Analyze.
- [ ] Verify Construct → Modify → Analyze → Compare revisions.
- [ ] Verify Validate → select issue → frame issue → inspect or repair.
- [ ] Verify Geometry → derived Mesh → Mesh Analyze → exact-versus-discrete Compare.
- [ ] Verify Mesh derivative → Open Geometry Source → mapped selection → analytic analysis.
- [ ] Verify Analyze → Save → modify source → stale warning → recompute/compare.
- [ ] Verify Gallery, New, Demo, Procedural, Scratch, Workbook, Construction Lab, Scene→Script, and Script→Scene remain functional.
- [ ] Record the final UI decisions for expandable legacy groups and remove nothing without an explicit accepted replacement.
- [ ] Publish a Geometry professional workflow freeze document and mark this roadmap complete.

Acceptance: Geometry and Mesh feel like analytic and discrete views of one scientific scene, with no parallel identity, navigation, or analysis-result system.

## Deferred UI decisions

These choices remain deliberately open until the additive shell is tested:

- Whether the current Procedural/Demo/Scratch/Workbook mode strip stays permanently or becomes part of New/More.
- Whether object Gallery and scene Gallery share one screen, two tabs, or a split catalog.
- Whether Scratch remains a top-level action in addition to appearing under New.
- Whether Scene Script lives under Scene, More, or a dedicated Script action.
- Which current direct topology tools belong primarily in Geometry and which should be labeled as discrete edits.
- Which duplicated controls can be removed after parity tests prove the new location.

Until those decisions are made, use expandable groups and preserve the existing entry points.

## Validation commands

Run focused checks first, then the full gates appropriate to the commit:

```powershell
cd C:\Math3D
npm --prefix renderer test -- src/geometry
npm --prefix renderer test
npm run typecheck:noemit
npm run build:renderer
npx playwright test tests/e2e/geometry-picking.spec.ts tests/e2e/object-scene.spec.ts tests/e2e/mesh-topology-persistence.spec.ts --reporter=list
```

Commit 17 should replace this manual set with one maintained Geometry acceptance command.

## Main implementation references

- `renderer/src/App.tsx`: current Geometry modes, panels, actions, analyses, comparisons, persistence, and cross-module workflows.
- `renderer/src/components/GeometryViewer.tsx`: Geometry viewport, rendering, picking, transforms, overlays, and interaction-quality behavior.
- `renderer/src/components/GeometryPickReadout.tsx`: committed/hover selection and semantic readout.
- `renderer/src/components/ConstructionLabPanel.tsx`: construction graph, workspace tabs, and construction script/scene workflow.
- `renderer/src/geometry/proceduralObjects.ts`: current procedural object registry and tessellated builders.
- `renderer/src/geometry/construct.ts`: construction entities, constraints, and graph evaluation.
- `renderer/src/geometry/picking.ts`: canonical Geometry pick contract and topology summaries.
- `renderer/src/geometry/analysis.ts`: current geometric measurements and constraint analysis.
- `renderer/src/geometry/analysisBridge.ts`: quick analysis snapshots, metrics, topology summary, and Mesh handoff.
- `renderer/src/geometry/analysisInfrastructure.ts`: Geometry adapter for the shared analysis registry/result store.
- `renderer/src/analysis/`: domain-neutral analysis contracts, registry, result store, and dependency resolution.
- `renderer/src/geometry/constructionDependencyTree.ts`: construction dependencies and update chains.
- `renderer/src/geometry/GeometryDerivedProductsPanel.tsx`: derived products, stale state, provenance, and regeneration.
- `renderer/src/geometry/meshPromotionContract.ts`: Geometry-to-Mesh promotion modes and metadata.
- `renderer/src/geometry/geometryMeshTraceMap.ts`: bidirectional object/entity correspondence and provenance.
- `renderer/src/geometry/meshSection.ts`: section generation and measurements.
- `renderer/src/geometry/scripting/`: procedural Scene Script parser, executor, serializer, diagnostics, and tests.
- `renderer/src/geometry/sceneGalleryCatalog.ts`: replayable scene Gallery and demo timelines.
- `renderer/src/geometry/objectGalleryCatalog.ts`: object Gallery taxonomy and recipes.
- `renderer/src/geometry/canonicalRegressionScenes.ts`: canonical regression scene definitions and persistence cleanup.
- `tests/e2e/geometry-picking.spec.ts`: picking, Construct, scene Gallery, and responsive Geometry coverage.
- `tests/e2e/object-scene.spec.ts`: object Gallery, scene editing, persistence, and Scene Script coverage.
- `tests/e2e/mesh-topology-persistence.spec.ts`: shared selection semantics and Mesh↔Geometry round trips.
