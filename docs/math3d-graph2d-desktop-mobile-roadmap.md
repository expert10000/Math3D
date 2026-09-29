# MATH3D Graph2D — Desktop and Mobile Roadmap

**Status:** desktop/web baseline through G2D32, mobile MOB-G01–12 and automated G2D33–35 implemented; MOB-G13 physical release validation remains pending, with partial Android USB evidence. GGL01–06 desktop/web gallery is implemented and accepted. GGL07–09 native browsing/launch, all-catalog model parity and the physical Android/Electron walkthrough are accepted; iOS/tablet and full G13 evidence remain pending. G2D36 publication export is implemented and automated desktop/web/shared-native checks pass; physical native export acceptance is pending. Next: G2D38 parameters, sliders and deterministic animation.

**Priority:** P1 after the active mobile project-transfer sequence

**Scope:** shared Graph2D domain, desktop/web workspace, touch-first mobile client, deterministic desktop/mobile round trip, and a shared curated gallery of editable mathematical scenes

**Canonical authority:** this file owns Graph2D sequencing, architecture boundaries, acceptance criteria, and release gates. It complements the application-kernel roadmap and does not reopen completed kernel work.

### Delivery update — 2026-09-28

- Desktop promotion is now connected to the UI: Curve, revolution and extrusion previews, ordinary Curve/Surface documents, locate both ways, independent target edits, stale-source state, regenerate/fork, and mixed-workspace save/reopen. Creating or forking again preserves existing targets.
- Sampling runs in terminable Web Workers. Source/viewport replacement, completion, timeout and unmount release workers; generation guards reject stale results. Scene/piecewise budgets and parametric/polar deadlines are enforced.
- MOB-G01–04 now use the normal mobile project library and the same core Graph document and kernel command adapter. Included: empty/starter creation, checked import, offline save/reopen, compatibility cards, native Graph/Functions/Analyze destinations, transient pan/pinch, reset/fit, undo/redo, tap probing, overlap cycling and clear selection.
- MOB-G05–10 add saved explicit probes, explicit authoring/numerical analysis, display/diagnostics, shared sampling and editors for all seven core kinds, CSV/TSV local sidecars, and portable Curve/Surface promotion with bounded 3D wireframe previews. MOB-G11–12 add tablet layout and performance policies; MOB-G13 device acceptance remains pending. Advanced Curve/Surface worker analyses remain desktop-only. Mobile mixed-workspace duplication/colliding imports require a desktop identity fork; no companion documents are silently discarded. Sheets have no motion animations, and haptics are optional, capability-injected feedback.
- Surface validation is bounded numerical screening, not a proof of global continuity. Extrusion caps currently require a closed, nondegenerate convex profile with included endpoints; open profiles require `none`.
- G2D33 implements checkpointed desktop/mobile handoff with source/result/companion retention and revision conflict checks. G2D34 adds a shared seven-kind numerical/migration corpus and real browser Worker/UI parity checks. G2D35 publishes the [architecture, schema, algorithms and parity guide](graph2d-architecture-schema-algorithms-parity.md).
- Initial desktop/mobile checks are recorded in [the historical acceptance report](graph2d-acceptance-2026-09-28.md); current software evidence is in [G2D33 round trip](graph2d-g33-round-trip-acceptance.md) and [G2D34 parity corpus](graph2d-g34-parity-corpus.md). A connected SM-A566B Android 16 phone supplied [partial internal-build evidence](mobile-graphs-g13-readiness-2026-09-28.md). Full physical gesture, accessibility, rotation, memory/calibration, production signing and iOS signoff remain release gates.

This does **not** finish the entire roadmap: MOB-G13 physical acceptance, later GGL gallery work, native publication acceptance and professional G2D37–40 remain. Automated handoff, publication and corpus checks do not substitute for native release evidence. An existing installer/APK does not gain these changes until rebuilt.

### Gallery sequencing decision — 2026-09-28

Build a focused gallery **now, before G2D36**, using the already implemented seven-kind engine and canonical Graph documents. Deliver shared content and desktop/web discovery first, then mobile launch through the existing project library. Sliders/animation stay owned by G2D38, project exchange stays owned by the existing Graph/handoff contracts, and full physical acceptance stays owned by MOB-G13.

The [gallery, presets and showcase roadmap](graph2d-gallery-presets-showcase-roadmap.md) adapts the supplied 37-step proposal, maps every proposed GRPH-G ID, and specifies launch safety, 20 initial scenes, generated offline previews and focused acceptance. GGL IDs do not renumber G2D milestones. GGL01–06 are delivered; later GGL rows remain planned. See [desktop/web acceptance](graph2d-gallery-ggl01-ggl06-acceptance.md).

## 1. Outcome

Add **Graphs** as a first-class MATH3D module for mathematical 2D plotting, inspection, analysis, and promotion into existing Curve and Surface workflows.

The delivery order is deliberate:

```text
shared Graph2D contracts and algorithms
                 ↓
desktop/web authoring and validation
                 ↓
portable schema and desktop baseline freeze
                 ↓
mobile touch client using the same contracts
                 ↓
desktop ↔ mobile round-trip release gate
```

Desktop-first means that desktop proves the shared domain. It does **not** authorize a desktop-only expression evaluator, sampler, document, selection model, or analysis store that mobile later has to copy.

## 2. Product boundary

### Graph2D v1 includes

- multiple explicit Cartesian functions in one graph scene;
- safe expressions, domains, styles, visibility, viewport state, selection, and probes;
- adaptive sampling with discontinuity segmentation and bounded refinement;
- pan, zoom, reset, fit, axes, grid, ticks, labels, and nearest-curve picking;
- derivatives, tangents, roots, extrema, inflections, interval diagnostics, integration, intersections, and arc length;
- parametric, polar, implicit, inequality, piecewise, and point/data objects after the explicit-function vertical slice is stable;
- Graph → Curve and profile → Surface promotion with source provenance;
- one portable Graph2D project/document model used by desktop, web, and mobile.

### Explicit non-goals for v1

- a CAS replacement or unrestricted symbolic theorem prover;
- arbitrary JavaScript evaluation or executable expressions in saved documents;
- a generic drawing, slide, or annotation editor;
- live multi-user collaboration or cloud synchronization;
- silent recomputation that changes a frozen numerical result without source/revision provenance;
- a second mobile-only graph engine;
- treating sampled polylines as canonical mathematical source.

### Delivered desktop/web extension — curated gallery

After G2D35, GGL01–06 added 20 normal editable Graph scenes, generated offline previews, desktop/web Gallery and host-local favorites/recent entries. Open it through **Graphs → Gallery** or **Explore Graph Gallery** in an empty Graph. Its [desktop/web acceptance](graph2d-gallery-ggl01-ggl06-acceptance.md) is separate from the original v1 physical release gate. Mobile GGL07–09 is delivered; see [mobile acceptance](graph2d-gallery-ggl07-ggl09-acceptance.md) and the gallery sequence below.

## 3. Existing architecture this program must reuse

Graph2D is a new domain adapter on top of the completed MATH3D application-kernel contracts:

- stable document identity, revisions, canonical JSON, and structural hashes;
- typed commands, atomic transactions, bounded history, undo/redo, and deterministic replay;
- shared document relations, dependency invalidation, results, artifacts, scientific jobs, and backend capabilities;
- preview versus committed selection and locate-back semantics;
- mixed-workspace persistence and platform capability boundaries;
- mobile project creation, object transfer, native sharing, and revision-aware handoff work as it lands.

Graph2D must not create a parallel command bus, history store, artifact registry, result lifecycle, capability router, or project container.

## 4. Normative architecture

### 4.1 Ownership and dependency direction

```text
apps / renderer UI
        ↓
Graph2D workspace adapters and render projection
        ↓
@math3d/kernel — commands, history, jobs, results, artifacts, relations
        ↓
@math3d/core — Graph2D documents, validation, identity, serialization
        ↓
pure Graph2D expression / sampling / analysis algorithms
```

Core and domain algorithms cannot depend on React, React Native, DOM, Canvas, Three.js, Electron, Expo, or native filesystem APIs. Renderers consume detached sample artifacts and viewport projections; they do not own mathematical truth.

### 4.2 Canonical documents and artifacts

The Graph2D source document contains compact, serializable intent:

- document identity, schema version, and capability requirements;
- ordered graph objects with stable IDs and kinds;
- expression AST/source, variable declarations, assumptions, and domains;
- style/display intent and sampling policy, not generated samples;
- viewport and axes state classified as persistent display state;
- committed probes, interval selections, and compatible saved-result references;
- provenance and document relations for promoted or imported content.

Dense samples, contour segments, filled-region triangulations, spatial indexes, and render buffers are derived artifacts keyed by exact source generation plus sampling parameters. Missing artifacts never invalidate the source document.

### 4.3 Expression safety

Expressions are parsed into a versioned serializable AST. Evaluation uses an allowlist of variables, constants, operators, and functions with explicit domain diagnostics. `eval`, `Function`, property access, imports, assignment, loops, and host APIs are forbidden.

Canonical source preserves user intent while normalized AST and diagnostics make behavior deterministic. Parser/evaluator limits cover source bytes, AST depth/node count, evaluation count, wall-clock deadline, and non-finite output.

### 4.4 Sampling and discontinuities

Adaptive sampling is deterministic for the same source generation, viewport, policy, and budget. It must:

- seed every visible domain interval predictably;
- refine by screen-space error, curvature, and oscillation indicators;
- detect invalid/non-finite samples and suspected jumps/asymptotes;
- split polylines rather than drawing through discontinuities;
- preserve domain endpoints and piecewise open/closed endpoint semantics;
- cap recursion, samples, segments, output bytes, and processing time;
- publish diagnostics when the budget prevents convergence.

Interaction may use a lower-quality transient artifact. A settled viewport schedules a superseding full-quality artifact; stale jobs cannot publish after expression, viewport, or policy changes.

### 4.5 Viewport and input

One shared viewport model owns world↔screen transforms, visible domain, aspect policy, axes bounds, fit, and zoom-anchor math. Desktop pointer/wheel input and mobile pan/pinch gestures submit different input events to the same pure transformations.

The 2D viewport remains separate from the 3D camera abstraction. It may share common command/history policy, but must not encode 2D navigation as an artificial 3D camera.

### 4.6 Selection, probes, and analysis

Hover and gesture previews are transient. Committed selection identifies a graph object plus mathematical coordinates and optional artifact observation. Screen pixels and polyline indices are observations, not persistent identity.

Analyses publish status-qualified result envelopes with:

- exact source generation and selected interval/point;
- operation, parameters, algorithm/version, and engine;
- symbolic, numerical, or hybrid method classification;
- precision/tolerance, convergence, residual/error estimate, and warnings;
- derived artifact handles for overlays;
- stale/unavailable/unsupported states that remain inspectable.

Exact and approximate results must never be presented with the same confidence label.

### 4.7 Interoperability

Promotion creates normal Curve or Surface documents and a shared `promoted-from` relation. It is a snapshot of an exact source generation, not an implicitly live mutable view.

- `y=f(x)` promotes to `(x, f(x), 0)`.
- Parametric `(x(t), y(t))` promotes to `(x(t), y(t), 0)`.
- Revolve and extrude create normal Surface/procedural sources.
- Source changes mark relations and derived artifacts stale; they do not silently rewrite independently edited targets.

### 4.8 Persistence and compatibility

Graph2D uses a versioned document embedded in the normal MATH3D project/workspace envelope. Unknown future fields or unsupported required capabilities produce an explicit compatibility preview, never partial silent loss.

Migration is pure, bounded, deterministic, and fixture-tested. Desktop and mobile serialize the same canonical structural content; platform-only transient state is excluded.

## 5. Quality budgets

Initial budgets are review targets, not promises to hide regressions. Each performance commit records measured hardware and may revise them with evidence.

| Operation | Desktop target | Mobile target | Gate |
| --- | ---: | ---: | --- |
| Pan/zoom interaction | 60 fps typical; no input task > 16 ms | 45–60 fps; no input task > 24 ms | interaction-quality artifact only |
| Settled explicit resample | ≤ 100 ms for one normal function | ≤ 180 ms | cancellable and supersedable |
| Multi-function scene | 12 normal functions / 200k visible samples | 6 normal functions / 60k visible samples | graceful budget diagnostics |
| Tap/pointer probe | ≤ 50 ms | ≤ 80 ms | spatial index or bounded nearest search |
| Standard analysis | ≤ 250 ms local | ≤ 500 ms local | slower operations become jobs |
| Cancellation acknowledgement | ≤ 100 ms | ≤ 150 ms | stale publication forbidden |
| Saved source payload | compact JSON, no sample arrays | same | bounded schema validator |

Minimum accessibility targets: keyboard-complete desktop authoring, visible focus, screen-reader names/state, 44×44 pt mobile targets, reduced-motion behavior, high-contrast-safe palettes, and no color-only mathematical status.

## 6. Executable commit sequence

Every identifier is one reviewable commit. A commit is complete only when its focused tests, typecheck, and stated evidence pass.

### Phase A — Shared Graph2D foundation

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **G2D01** | `feat(graph2d): establish first-class Graphs module and workspace contract` | Register Graphs and a capability-described workspace shell. Define ownership boundaries and an empty explicit-function scene. Navigation and module switching work without Graph2D-specific lifecycle infrastructure. |
| **G2D02** | `feat(graph2d-core): add shared graph document and object model` | Add versioned identities, explicit and reserved object kinds, ordered objects, domains, display/sampling intent, selection/probe types, field policy, validators, and canonical hashing. Golden valid/invalid fixtures cover unknown fields, duplicate IDs, limits, and non-finite data. |
| **G2D03** | `feat(graph2d-core): add safe expression parsing validation and evaluation` | Add versioned AST, deterministic parser/formatter, allowlisted evaluation, source spans, diagnostics, and complexity/deadline limits. No dynamic host-language evaluation. Corpus covers precedence, constants, functions, malformed input, domain errors, and adversarial depth. |
| **G2D04** | `feat(graph2d-core): implement adaptive sampling and discontinuity segmentation` | Add deterministic bounded explicit-function sampling, screen-error refinement, non-finite/jump splitting, and convergence diagnostics. Tests cover smooth, oscillatory, removable, pole, step, and empty-domain cases. |
| **G2D05** | `feat(graph2d-core): add reusable 2d viewport transforms and navigation commands` | Add invertible world↔screen transforms, pan, anchored zoom, fit, aspect policy, bounds, and history classification. Property tests cover round trips, extreme zoom clamps, resize, and invalid dimensions. |
| **G2D06** | `feat(graph2d-projects): add versioned persistence migration and project adapter` | Embed Graph2D in normal projects, add pure migrations and capability preview, exclude artifacts/transient input, and prove canonical save/reopen/replay. Corrupt, oversized, old, and future fixtures fail safely. |

### Phase B — Desktop/web Graphs workspace

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **G2D07** | `feat(graph2d-desktop): add Graphs workspace function list viewer and inspector` | Add the three-region desktop layout using shared document/query state, responsive collapse rules, empty/loading/error states, and normal module navigation. |
| **G2D08** | `feat(graph2d-renderer): add axes grid ticks labels and explicit rendering` | Render clipped sampled artifacts with adaptive major/minor grid, stable tick formatting, origin/axes, labels, per-object style, and deterministic visual fixtures. Rendering never reparses expressions. |
| **G2D09** | `feat(graph2d-desktop): add smooth pan zoom reset and fit navigation` | Pointer pan, cursor-anchored wheel zoom, keyboard navigation, reset, fit-visible, and optional axis constraint all mutate the shared viewport model. Gesture previews coalesce into one history entry. |
| **G2D10** | `feat(graph2d-desktop): add complete function authoring workflows` | Create, edit, validate, rename, duplicate, reorder, hide/show, style, and delete through typed commands. Invalid drafts remain local; committed batches are atomic and undoable. |
| **G2D11** | `feat(graph2d-picking): add selection nearest-point probing and locate-back` | Add transient hover, committed click, empty-space clear, deterministic nearest visible curve, source-coordinate refinement, overlap cycling, keyboard selection, and shared selection queries. |
| **G2D12** | `feat(graph2d-inspector): add function probe diagnostics and sampling panels` | Inspector explains source, domain, style, probe coordinates, method, sampling budget/convergence, discontinuities, provenance, and actions without duplicating primary authoring controls. |

### Phase C — Mathematical analysis

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **G2D13** | `feat(graph2d-analysis): add first and second derivatives` | Add symbolic derivatives for supported AST nodes and reviewed numerical fallback. Results label method, domain, step/tolerance, and error diagnostics; analytic corpus and convergence tests pass. |
| **G2D14** | `feat(graph2d-analysis): add tangent normal and local differential overlays` | At committed `x0`, publish slope, tangent/normal equations, differentiability state, and overlay artifacts tied to exact source/probe generations. |
| **G2D15** | `feat(graph2d-analysis): add zeros extrema and inflection diagnostics` | Bracket/refine candidates with residuals, confidence/method labels, multiplicity limitations, deduplication, and source-linked selectable results. |
| **G2D16** | `feat(graph2d-analysis): add monotonicity concavity and interval diagnostics` | Publish bounded interval partitions with unknown/discontinuous boundaries separated from proven/numerical signs. Overlays and tables share result identity. |
| **G2D17** | `feat(graph2d-analysis): add interval integration and area overlays` | Select `[a,b]`, compute signed/absolute area as requested, report method/tolerance/error estimate, split invalid intervals, and publish a bounded fill artifact. |
| **G2D18** | `feat(graph2d-analysis): add pairwise intersection solving` | Solve selected pairs over visible or explicit intervals, refine/deduplicate candidates, report tangencies and unresolved intervals, and prevent quadratic all-pairs work without user selection. |
| **G2D19** | `feat(graph2d-analysis): add numerical arc-length measurement` | Integrate `sqrt(1+f'(x)^2)` over valid intervals with convergence/error metadata and explicit unavailable status at unresolved discontinuities. |

### Phase D — Additional graph families

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **G2D20** | `feat(graph2d): add parametric graph objects` | Add `x(t), y(t)`, parameter domains, adaptive 2D curve sampling, probe parameter identity, self-intersection picking, and shared Curve-domain reuse where contracts fit. |
| **G2D21** | `feat(graph2d): add polar graphs and polar grid mode` | Preserve `r(θ)` as source, add angular domains, negative-radius semantics, polar grid projection, and Cartesian probe readout without rewriting source as Cartesian samples. |
| **G2D22** | `feat(graph2d): add implicit contour graphs` | Add bounded adaptive contour extraction for `F(x,y)=0`, ambiguous-cell policy, segment stitching, singular diagnostics, and contour artifacts behind shared jobs. |
| **G2D23** | `feat(graph2d): add inequalities and filled regions` | Add strict/non-strict boundaries, boolean region semantics, bounded fill artifacts, open/closed boundary styling, and explicit unresolved/complexity states. |
| **G2D24** | `feat(graph2d): add point series tables and connected data plots` | Add bounded typed datasets, missing-value policy, point/line modes, import preview, stable row identity, and coexistence with functions. Large tables use managed artifacts rather than document duplication. |
| **G2D25** | `feat(graph2d): add piecewise expressions and restricted domains` | Add ordered pieces, overlap/gap validation, interval syntax, independent sampling, and correct open/closed endpoint rendering and probing. |

### Phase E — Graph ↔ MATH3D interoperability

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **G2D26** | `feat(graph2d-interop): promote graphs into Curve workspace` | Promote explicit and parametric sources to normal Curve documents, preserve exact expressions/domains, record source generation and trace mapping, and support locate-back. |
| **G2D27** | `feat(graph2d-interop): revolve graph profiles into surfaces` | Create normal Surface/procedural definitions with axis/domain/orientation preview, reject invalid profiles atomically, and record `promoted-from` provenance. |
| **G2D28** | `feat(graph2d-interop): extrude graph profiles into surfaces` | Reuse Surface infrastructure for direction/length/cap policy and source relations; no Graph2D-specific 3D scene type. |
| **G2D29** | `feat(graph2d-interop): add source lineage staleness and regeneration` | Source edits stale promotions, locate both directions, compare generations, and explicitly regenerate or fork without silently overwriting independently edited targets. |

### Phase F — Desktop contract freeze

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **G2D30** | `test(graph2d): freeze desktop functional and accessibility baseline` | Freeze create/edit, multiple functions, viewport, sampling/discontinuities, selection/probe, analysis, undo/redo, save/reopen, keyboard flow, focus, and responsive desktop/tablet layouts. |
| **G2D31** | `test(graph2d-projects): freeze portable graph schema and migration corpus` | Publish canonical v1, legacy, corrupt, oversized, unsupported-capability, and future-version fixtures. Independent desktop/mobile readers must produce the same structural hashes and diagnostics. |
| **G2D32** | `perf(graph2d): establish sampling rendering analysis and cancellation benchmarks` | Record smooth, oscillatory, discontinuous, multi-function, implicit, fill, and analysis scenes against reviewed budgets; include stale-job and memory/resource cleanup gates. |

### Phase G — Mobile Graphs workspace

Mobile starts only after G2D30–G2D32 are green. The first mobile slice is explicit-function open/view/probe/save; broader kinds follow shared capability availability.

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **MOB-G01** | `feat(mobile-projects): add Graphs project type and graph project cards` | Add Graph2D create/open/import cards and compatibility summaries through the normal project model. Do not expose kinds the installed shared core cannot edit safely. |
| **MOB-G02** | `feat(mobile-graphs): add touch-first full-screen graph workspace` | Add graph-first phone layout with compact top context and Graph/Functions/Analyze bottom-sheet destinations; safe areas and small-height states pass. |
| **MOB-G03** | `feat(mobile-graphs): add pan pinch zoom reset and fit gestures` | One-finger pan, anchored pinch, reset/fit, gesture cancellation, simultaneous-input rules, reduced-motion behavior, and one committed history step per gesture. |
| **MOB-G04** | `feat(mobile-graphs): add tap probe and nearest-curve selection` | Add finger-sized adaptive hit thresholds, overlap cycling, selected curve/point state, compact coordinates, haptics capability gate, and empty-space clear. |
| **MOB-G05** | `feat(mobile-graphs): add bounded persistent probes and annotations` | Implemented: eight bounded, source-linked annotated probes, accessible labels, comparison, rename/delete/reorder/locate and portable reversible persistence. See `mobile-graphs-g05-g07-acceptance.md`; physical-device acceptance pending. |
| **MOB-G06** | `feat(mobile-graphs): add function authoring bottom sheet` | Implemented: command-backed explicit add/edit/validate/rename/duplicate/reorder/visibility/style/delete, session drafts, keyboard-aware scrollable sheet and native rotation enabled. Shared-model tests passed; device walkthrough pending. |
| **MOB-G07** | `feat(mobile-graphs): add touch-first analysis bottom sheet` | Implemented: requested shared derivatives, features, tangent/normal, integral, pair intersections and arc length with method/tolerance/provenance/stale states and source-linked navigation. Unit parity and Android emulator walkthrough recorded in `mobile-graphs-g05-g07-acceptance.md`. |
| **MOB-G08** | `feat(mobile-graphs): add compact display sampling and overlay controls` | Implemented: collapsed display/diagnostics, command-backed axes/grid/labels/quality and bounded current-result tangent/area/feature overlays. See `mobile-graphs-g08-g10-acceptance.md`. |
| **MOB-G09** | `feat(mobile-graphs): add parametric polar implicit inequality piecewise and data flows` | Implemented: shared-kind chooser/editors, bounded sampling and native region/data rendering, checked local CSV/TSV sidecars with previews and missing-data guidance. Explicit-only analysis/pins; cross-device sidecar packaging and physical/iOS QA pending. See `mobile-graphs-g08-g10-acceptance.md`. |
| **MOB-G10** | `feat(mobile-graphs): add Curve and Surface promotion actions` | Implemented: pure Graph/Parametric → Curve and Revolve/Extrude previews, explicit Create with storage capability checks, ordinary mixed-workspace targets/relations, 3D wireframe target/source location, stale-source labels and lossless save/export/reopen. Preview/cancel commit nothing. Advanced worker analyses and target regeneration/fork remain desktop-only; physical/iOS QA pending. See `mobile-graphs-g08-g10-acceptance.md`. |
| **MOB-G11** | `feat(mobile-graphs): add tablet split-pane workspace` | Implemented: measured/font-scale-aware ≥840×480 logical-pixel breakpoint, scrollable side tools and graph-first phone fallback; shared draft/selection/history ownership and resize gesture cancellation. See `mobile-graphs-g11-g13-acceptance.md`; physical/iOS QA pending. |
| **MOB-G12** | `perf(mobile-graphs): enforce adaptive device sampling and rendering budgets` | Implemented: scheduled/coalesced preview/refinement, measured-workload adaptive policy tiers, cooperative deadlines, sample/artifact/native-geometry/point-cache ceilings, stale cancellation and lifecycle cleanup. Manual reduced-workload recovery; no thermal sensor claim. Physical low/mid/high calibration pending; see `mobile-graphs-g11-g13-acceptance.md`. |
| **MOB-G13** | `test(mobile-graphs): freeze physical-device and iOS companion baseline` | Gate prepared, **baseline not frozen**: exact-artifact/source-linked physical Android low/mid/high/tablet + iPhone/iPad evidence validator, pending template, shared fixture/aggregate-kind regressions and partial Android emulator checks. Complete create/edit/gesture/probe/analysis/persistence/lifecycle/rotation/tablet/native transport/accessibility matrix and measured physical calibration remain required; see `mobile-graphs-g11-g13-acceptance.md`. |

### Phase H — Round trip and release

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **G2D33** | `test(graph2d): freeze desktop mobile project round trip` | Implemented automated checkpoint/handoff baseline: desktop `f,g` → mobile probe/pin/add `h` → desktop reopen with IDs, viewport, source hashes, commands, saved-result inputs and companions preserved. Existing handoff v2 adds workspace revision ancestry and rejects local divergence; built Electron file regression passes. Physical two-app release signoff remains pending MOB-G13. See `graph2d-g33-round-trip-acceptance.md`. |
| **G2D34** | `test(graph2d): add cross-platform visual numerical and migration corpus` | Implemented 13 shared seven-kind fixtures, 16 Node numerical/migration/promotion/corruption/cancellation tests, identical timezone reports, real Chromium worker comparisons and rendered geometry/captures under English/UTC and Polish/Auckland. Half-undefined path refinement is bounded with explicit unresolved diagnostics. Mobile projection runs in Node; physical Hermes/iOS parity remains pending MOB-G13. See `graph2d-g34-parity-corpus.md`. |
| **G2D35** | `docs(graph2d): publish architecture schema algorithms and parity guide` | Implemented maintained guide covering ownership, schemas, AST, sampling guarantees/limits, result confidence, accessibility, performance profiles, interoperability/handoff v2, migration, troubleshooting, and software versus pending physical release evidence. Linked from docs index/navigation and the handoff contract. See [the guide](graph2d-architecture-schema-algorithms-parity.md). |

### Gallery insertion — after G2D35, before Phase I

Detailed contracts, content and later GGL10–18 follow-ons live in the [gallery roadmap](graph2d-gallery-presets-showcase-roadmap.md). Delivered rows are marked explicitly; other rows remain planned. Desktop/web acceptance precedes mobile delivery; physical checks remain separately reported.

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **GGL01** | `feat(graph2d-presets): add shared versioned catalog contract and instantiation` | Implemented shared core contract, immutable registry, canonical template/sidecar validation and fresh launch-token identities. Four contract tests and strict shared typecheck pass. |
| **GGL02** | `feat(graph2d-presets): add curated seven-kind starter scenes` | Implemented 20 canonical seven-kind scenes, at least eight multi-object comparisons and six Featured entries. Reference-math, gaps/endpoints/strict fills, 512/1024 sample bounds, low-profile projection and portable editable-copy checks pass (25 catalog/contract tests); strict typecheck passes. Generated visual review follows GGL03. |
| **GGL03** | `feat(graph2d-gallery): generate reproducible offline preview assets` | Implemented 20 generated SVG/PNG pairs from shared sampling/transforms with source/recipe/asset hashes, safe text, gaps/open/strict markers and a 235087-byte compressed bundle. Contact sheet reviewed; domain adjustments and interval-coverage checks prevent truncated starters. Preview/catalog tests and strict types pass; deterministic regeneration checked. |
| **GGL04** | `feat(graph2d-gallery): add desktop web browse preview and safe project launch` | Implemented visible desktop/web toolbar and empty-state Gallery, static Featured/all/category/search/detail views, fresh project launch and preserved-workspace resume. Transaction rollback retains live state on failures and saves imported companions/results/ancestry in normal checkpoints. 30 focused tests, full renderer/focused types, production build and real Electron edit/switch/resume/save/focus scenario pass; gallery screenshot reviewed. |
| **GGL05** | `feat(graph2d-gallery): add local favorites recent items and discovery states` | Implemented host-local bounded Favorites/Recent collections, star state, empty/search states, unavailable-entry handling and explicit corrupt-settings reset. Recent IDs join the launch transaction; no Graph payload or parallel user save store is added. 33 focused tests, focused types and two Electron browse/edit/resume/favorites/reload scenarios pass. |
| **GGL06** | `test(graph2d-gallery): freeze desktop web catalog launch and rendering baseline` | Implemented desktop/web baseline: all 20 scenes exercise actual browser Worker/UI in two locale/timezone contexts; Electron preview/open/edit/undo/save/handoff/reopen, retained companions/results, rollback and checkpoint capacity pass. 34 focused tests, broader desktop/mobile regressions, types/builds and preview regeneration pass. See [desktop/web acceptance](graph2d-gallery-ggl01-ggl06-acceptance.md). |
| **GGL07** | `feat(mobile-graphs): add shared offline gallery browse and previews` | Implemented native Projects/New Project and Graph Workspace entries, static bundled PNG cards from the shared catalog, Featured/all/category/search/detail browse, native labels and scrolling phone/short-height/tablet/large-text layout policy. 229 mobile model tests (including two gallery discovery/layout tests) and mobile types pass; production Android Metro export includes all 20 previews. Preset launch is recorded under GGL08; native acceptance under GGL09. |
| **GGL08** | `feat(mobile-graphs): launch presets through ordinary project persistence` | Implemented one-tap fresh ordinary saved Graph projects, staged/checksum-validated sidecars with rollback, duplicate-launch protection and one atomic library write preserving current Graph/scene edits and retained Graph companions/ancestry. Existing save/reopen/share/export controls remain in use; failed first saves cannot resurrect a new project from backup. All 256 mobile tests and strict mobile/shared types pass. Native acceptance is recorded under GGL09. |
| **GGL09** | `test(graph2d-gallery): freeze mobile launch and desktop return parity` | Implemented all-20 model round trips, 276 mobile/131 desktop tests, three Electron Gallery cases and actual Android-export/Electron-return acceptance. Internal APK installed; six native examples cover seven kinds and saved project/import-copy behavior. Basic landscape/large-text captures recorded; full focus/iOS/tablet and MOB-G13 release evidence remain pending. See [mobile acceptance](graph2d-gallery-ggl07-ggl09-acceptance.md). |

### Phase I — Post-v1 professional extensions

The preceding gallery insertion comes before these professional extensions. Their identifiers remain stable; revised execution order is **G2D36 → G2D38 → G2D37 → G2D39 → G2D40**, with GGL10 integrating the shared controls after G2D38. These extensions and the gallery are not substitutes for the physical v1 round-trip gate.

| ID | Planned commit | Scope and acceptance evidence |
| --- | --- | --- |
| **G2D36** | `feat(graph2d-export): add SVG PNG CSV and accessible report export` | Implemented shared bounded/frozen publication snapshot, SVG/PNG/CSV/offline accessible HTML, desktop/web worker controls and native verified save/share services. Shared scene sampling/transforms retain seven-kind semantics, styles, gaps/endpoints and declared unit/method/tolerance/provenance metadata; exports remain separate from editable projects. 162 desktop/core and 285 mobile tests, 23 Electron and 8 two-context browser cases pass; Android bundle compiles. Physical native export/iOS/print signoff remains pending. See [publication evidence](graph2d-g36-publication-export.md). |
| **G2D37** | `feat(graph2d): add linear logarithmic and equal-scale axis policies` | After G2D38: add validated scale policies, invalid-domain guidance, tick formatting, fit behavior, persistence, and analysis restrictions without changing source expressions. Capability-check gallery examples using new policies. |
| **G2D38** | `feat(graph2d): add parameters sliders and deterministic animation` | Execute after G2D36, before G2D37. Add bounded named parameters, units/ranges, command-backed values, transient scrubbing, deterministic frame export, and cancellation; animation state is never hidden source truth. Shared authoring/history/scheduler contracts serve workspace and presets; GGL10 supplies catalog control hints and host integration. |
| **G2D39** | `feat(graph2d-analysis): add regression fitting and uncertainty bands` | Add reviewed models, residuals, confidence/uncertainty semantics, dataset provenance, and explicit statistical assumptions using shared result contracts. |
| **G2D40** | `test(graph2d): freeze professional publication and accessibility gate` | Freeze exports, scale policies, parameter workflows, statistical results, keyboard/screen-reader coverage, high contrast, and print/report reproducibility. Include gallery-launched parameter scenes and preservation of gallery-source semantics in exports. |

## 7. Dependency graph and parallel work

```text
G2D01 → G2D02 → G2D03 → G2D04 → G2D05 → G2D06
                    │        │        │        │
                    │        └────┐   │        └─ project fixtures
                    └─ analysis ──┼───┘
                                 ↓
G2D07 → G2D08 → G2D09 → G2D10 → G2D11 → G2D12
                    │                  │
                    ├─ G2D13–G2D19 ───┤
                    ├─ G2D20–G2D25 ───┤
                    └─ G2D26–G2D29 ───┘
                                 ↓
                         G2D30 → G2D31 → G2D32
                                 ↓
                      MOB-G01 → … → MOB-G12
                                 ├──────────────→ MOB-G13 exact-device gate
                                 ↓                         │
                         G2D33 → G2D34 → G2D35
                                 ├── software evidence ───┤
                                 ↓                         ↓
                         GGL01 → … → GGL06          v1 release signoff
                                 ↓
                         GGL07 → GGL08 → GGL09
                                 ↓
                       G2D36 → G2D38 → G2D37 → G2D39 → G2D40
                                  │
                                  └─ GGL10 interactive presets

Later GGL11–18 follow their individual dependencies; they do not block
the initial gallery. New runtime changes require updated exact-device evidence.
```

Safe parallelism after contracts land:

- desktop layout and renderer work can proceed in parallel after G2D05;
- analysis operations can split by result family after G2D13 establishes shared method/provenance vocabulary;
- parametric/polar can proceed together after graph-object unions and sampler interfaces stabilize;
- implicit/inequality work shares contour/fill infrastructure but must retain separate semantic contracts;
- mobile layout prototypes may run before G2D30, but production mobile commits cannot fork or pre-freeze shared behavior.
- catalog mathematics, previews and controls must use the shared Graph domain; desktop/web GGL06 proves gallery launch before mobile GGL07–09, and G2D38 owns parameter/animation behavior for both authoring and presets.

## 8. Verification matrix

| Layer | Required evidence |
| --- | --- |
| Core contracts | schema fixtures, canonical hashes, bounds, migrations, property tests, no platform imports |
| Expressions | parser corpus, AST snapshots, evaluation parity, domain errors, complexity/adversarial limits |
| Sampling | convergence and segmentation corpus, deterministic budgets, stale cancellation, no bridge lines |
| Viewport | transform round trips, anchored zoom, resize/aspect, extreme bounds, input-independent command parity |
| Analysis | analytic references, numerical convergence, residual/error metadata, exact-vs-approximate labels |
| Desktop | focused unit/integration tests, responsive E2E, keyboard/accessibility, save/reopen/replay |
| Mobile | typecheck, model/service/component tests, compact layout, gestures, lifecycle/memory, exact-device smoke |
| Interop | relation/source hashes, selection mapping, stale/regenerate/fork, Curve/Surface open-and-locate |
| Round trip | desktop/core/mobile canonical fixtures, migration and divergence matrix, visual/numerical tolerances |
| Gallery | template/capability/sidecar validation, fresh identities, current-work preservation and rollback, offline previews, all-kind numerical/visual checks, host launch/edit/save/return, keyboard/native discovery and bounded preview retention |

Focused gates are preferred during implementation. G2D30, G2D32, MOB-G13, G2D34, GGL06, GGL09 and G2D40 are the broader program gates. GGL09's native walkthrough does not waive any missing G13 release evidence.

## 9. Principal risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Curves bridge across poles or missed oscillations | screen-error plus jump heuristics, explicit segmentation, unresolved diagnostics, canonical pathological corpus |
| Expression behavior differs by runtime | shared AST evaluator, fixed numeric semantics, no host eval, cross-runtime golden values |
| Samples become accidental source truth | samples live only in generation-keyed artifacts; documents retain expressions/domains/policies |
| Analysis overstates certainty | method/tolerance/residual required; exact and numerical states visibly distinct |
| UI stalls under refinement or implicit contours | cancellable jobs, interaction tiers, deadlines, output limits, stale publication guards |
| Mobile becomes a second implementation | freeze shared schema/algorithms first; mobile owns input/layout only; parity fixtures are mandatory |
| Promotion creates hidden live coupling | snapshot relations, explicit stale state, regenerate/fork actions, no silent target mutation |
| Graph projects bloat | bounded documents, artifact handles, managed data imports, no persisted sample arrays |
| Locale changes canonical data | locale-neutral parsing/serialization; locale affects presentation only |
| Scope expands into a CAS or drawing tool | v1 non-goals and capability-driven backlog remain normative |
| Gallery creates a second Graph format or overwrites user work | canonical Graph templates, fresh identities, ordinary project persistence, atomic launch and retained companion/result checks |
| Gallery browsing overloads mobile or previews misrepresent mathematics | static bundled previews, bounded selected jobs/caches, shared geometry, visible limitations and reviewed low-profile content |

## 10. Definition of done

Graph2D v1 is complete when a user can:

1. create a normal Graphs project on desktop with multiple explicit and supported advanced graph objects;
2. edit, navigate, select, probe, analyze, undo/redo, save, reopen, and inspect provenance without direct file editing;
3. see discontinuities and numerical limitations represented honestly;
4. promote supported graph sources into normal Curve/Surface workflows with traceable relations;
5. open the same project on mobile, use touch-first authoring/analysis, save, and resume it on desktop without identity or semantic loss;
6. pass the canonical schema, numerical, visual, performance, accessibility, migration, and exact-device gates;
7. demonstrate that desktop and mobile use the same Graph2D contracts, evaluator, sampler, analysis operations, and project model.

The central rule remains:

> **Desktop first does not mean desktop-specific core.** Build the shared Graph2D domain first, prove it through desktop, freeze its contracts, and make mobile a touch-first client of the same mathematical workspace.
