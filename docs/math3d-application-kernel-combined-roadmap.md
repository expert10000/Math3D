# MATH3D Application Kernel — Combined Architecture and Execution Roadmap

**Status:** approved / active
**Type:** major architecture initiative
**Priority:** P0 / strategic
**Prepared from:** the original Application Kernel A1-G3 proposal; the completed
F01-F08 foundation and K01-K51 application-kernel program; the completed Topology
T01-T13 and Complex Analysis C01-C12 vertical migrations; and the planned
cross-module GK01-GK20 extension rollout.
**Canonical-roadmap authority:** this file is the source of truth for architecture
boundaries, historical traceability, and the post-C12 GK01-GK20 extension rollout.
The detailed completed F/T/C delivery evidence remains in
`docs/math3d-topology-complex-kernel-program-roadmap.md`; where its older post-C12
wording differs, this combined roadmap prevails.

## Program decisions

1. Keep `GK01-GK20` as the only executable post-C12 commit identifiers.
2. Keep `G01-G08` as milestone groups, never as commit identifiers.
3. Treat the older `A1-G3` plan as architecture requirements and traceability input,
   not as another implementation sequence.
4. Treat `K01-K51` as completed inherited application-kernel work that must not be
   reopened or reimplemented by GK commits. The detailed K catalogue and
   `docs/application-kernel-scene-script-migration-plan.md` are absent from the
   repository and its reachable Git history, so record K at phase level rather than
   inventing item-by-item completion evidence. If the reviewed catalogue is
   recovered, restore it as a non-renumbering historical appendix and trace its
   entries to the delivered baseline and GK extensions.
5. Add shared selection semantics explicitly to GK03, GK05, GK08, and GK16, and
   make Scratch ↔ Scene Script an explicit bidirectional structural-parity gate.
6. Separate general platform capabilities from F08 scientific-backend capabilities
   and cover both in GK19.
7. Include the existing mobile shell in capability conformance. Treat a future
   workspace server as a capability-compatible extension target, not a current
   release dependency.
8. Preserve the small-kernel rule: reuse the existing command, transaction, history,
   result, artifact, job, and broker foundations; do not create a second lifecycle
   framework or a monolithic all-module state object.
9. Treat every gate in the earlier G01-G08 generalization table as normative. The
   legacy-to-current map explains renumbering, while the executable GK commit scope
   and acceptance criteria below own delivery and verification.

## 1. Objective and definition of the kernel

MATH3D spans Geometry, Mesh, Surfaces, Curves, Volumes, Topology, Complex Analysis,
workbooks, browser, desktop/Electron, mobile, workers, Sage, CGAL, VTK, WASM, and
future native, GPU, or remote compute. The Application Kernel is the small stable
coordination layer shared by those modules and runtimes.

```text
                         MATH3D APPLICATION KERNEL
┌─────────────────────────────────────────────────────────────────────┐
│ Commands │ Queries │ Events │ History │ Documents │ Relations       │
│ Selection │ Results │ Artifacts │ Jobs │ Capabilities │ Replay      │
└─────────────────────────────────────────────────────────────────────┘
          ↑                         ↑                         ↑
          │                         │                         │
 Geometry / Mesh /          UI and runtime shells       Compute adapters
 Surface / Curve /          desktop / web / mobile     worker / WASM /
 Volume / Topology /                                  native / Sage / remote
 Complex Analysis
```

The kernel owns lifecycle contracts and deterministic coordination. Domain packages
own mathematical definitions, algorithms, and source-specific validation. Renderers
own visual projection. Runtime adapters own platform APIs and transport.

The target outcomes are:

- one authoritative mutation path for each migrated workflow;
- revision-safe documents, results, artifacts, and derived lineage;
- deterministic command replay, history, and save/reopen behavior;
- explicit dependency invalidation and recomputation;
- backend-independent scientific operations with inspectable capabilities;
- uniform selection, status, provenance, and locate-back semantics;
- preserved released workflows and legacy-file compatibility throughout migration.

## 2. Numbering and source-of-truth policy

| Identifier | Meaning | Status |
| --- | --- | --- |
| F01-F08 | Minimal shared lifecycle-kernel foundation | Complete |
| K01-K51 | Application-kernel, Scene Script, Geometry, resource, job, and migration program | Complete inherited baseline; detailed catalogue source currently unavailable |
| T01-T13 | Topology v1 vertical migration and formal gate | Complete |
| C01-C12 | Complex Analysis MVP/v1 vertical migration and gate | Complete |
| A1-G3 | Original architecture proposal labels | Historical traceability only |
| G01-G08 | Cross-module milestone groups | Planned/in progress through GK commits |
| GK01-GK20 | Executable post-C12 integration commits | Planned; GK01 is next |

There is one canonical sequential plan. Historical labels may explain intent, but
they cannot reopen completed work or create duplicate infrastructure. Completion
notes cite prior F/K/T/C evidence and the relevant original A-G requirement. Until
the detailed K source is recovered, K is cited as a completed phase rather than by
unverifiable individual K identifiers.

## 3. Current implementation baseline

### 3.1 Complete F/K shared foundations and kernel baseline

F and K are inherited implementation baseline, not pending GK work. The concrete
repository evidence available for that baseline includes:

- `packages/core/src/documentIdentity.ts`: stable IDs, monotonic revisions,
  canonical JSON, SHA-256 structural hashes, and field-authority policies.
- `packages/core/src/commands.ts`: versioned JSON command envelopes, origins,
  validation, deterministic normalization, and pure atomic projection.
- `packages/kernel/src/inMemoryDocumentKernel.ts`: read-only queries, ordered
  completed events, subscriptions, bounded reversible history, undo, and redo.
- `packages/core/src/scientificJobs.ts`: revision/generation-bound scientific-job
  requests, progress, cancellation, deadlines, limits, and outcomes.
- `packages/core/src/analysisResults.ts`: compact status-qualified result envelopes,
  provenance, precision/tolerance, diagnostics, and artifact handles.
- `packages/kernel/src/artifactRegistry.ts`: revisioned artifact bytes/metadata,
  ownership, availability, lifecycle, checksum, and deterministic full invalidation.
- `packages/kernel/src/scientificExecutionBroker.ts`: capability discovery,
  deterministic backend routing, admission, cancellation, bounded safe retry,
  fallback, and stale/protocol rejection.

### 3.2 Complete vertical proofs

- Topology T01-T13 proves versioned source documents, deterministic finite-complex
  canonicalization, structural gates, exact boundary matrices, Z2 and constrained
  Sage homology, status-qualified Algebra publication, surface classification,
  command replay, persistence, and Mesh snapshot lineage.
- Complex Analysis C01-C12 proves versioned expression documents, serializable AST,
  commands/replay, revision-safe preview artifacts, numerical and constrained Sage
  results, exact residue/contour workflows, persistence, branch continuation,
  monodromy, and Riemann-surface lineage.

### 3.3 Remaining extension and cross-module generalization gap

The following items are extensions beyond the completed K/T/C programs. They adapt
additional modules to proven contracts and close cross-module/runtime gates; they do
not restart those completed programs.

- Geometry, Mesh, Surface, Curve, and Volume professional workflows still own
  substantial module/UI-local lifecycle, history, selection, persistence, result,
  and relation state.
- Existing Geometry/Mesh and Curve/Surface relation types are domain-local and do
  not form one versioned cross-document lineage contract.
- Artifact invalidation is correct but document-local and deliberately coarse; no
  shared dependency graph spans documents, relations, results, and artifacts.
- Kernel completed events cover document transactions/history, while artifact and
  job events have separate domain contracts. Cross-document lifecycle facts and
  traversal queries are not unified.
- Selection remains primarily renderer-owned. Topology and Complex have committed
  selection commands, but no general selection document/service contract spans
  object, face, edge, vertex, source mapping, invalidation, and Inspector queries.
- F08 describes scientific backend capabilities, not the complete platform feature
  surface such as filesystem, native dialogs, persistence, SharedArrayBuffer,
  WebGPU, remote compute, and touch.
- Mixed-module workspace persistence/replay and shared lineage navigation are not
  yet implemented.
- Browser/desktop/mobile/worker conformance and final dependency-direction
  enforcement are not yet release gates.

## 4. Non-negotiable architecture principles

### 4.1 Commands own committed mutation

UI components, scripts, importers, and compute adapters do not mutate canonical
document state directly. They submit the same typed command families. A committed
command follows:

```text
normalize → validate complete batch → resolve declared dependencies
          → pure project → validate inverse/checkpoint policy
          → commit once → invalidate dependents → emit completed facts → history
```

Failed validation or execution commits nothing and emits no completed fact. Hover,
drag, typing, camera motion, temporary picks, and low-quality preview stay transient
until an explicit commit boundary.

Compute requests are jobs rather than disguised state commands. View changes enter
history only when a document explicitly classifies them as persistent display state.

### 4.2 Documents own source truth; artifacts are caches

Each module owns a versioned, canonical-JSON source document with stable identity,
revision, structural hash, and classified persistent/transient fields. Large grids,
matrices, meshes, samples, images, and binary buffers live behind artifact handles.
Missing cache data never invalidates the source document and never becomes silently
available after reopen.

The workspace is a graph of module documents and compact references, not one giant
union object containing every module payload.

### 4.3 Relations preserve cross-document lineage

A relation records how one or more exact source generations produced or promoted a
target document, result, or artifact. It does not make promoted targets live-linked
mutable views. Editing a source stales the relation and derived cache references but
does not rewrite an independently promoted downstream source document.

Required relation kinds:

- `derived-from`
- `generated-by`
- `snapshot-of`
- `analysis-of`
- `realization-of`
- `promoted-from`

The relation contract must support multiple sources for loft, intersection, boolean,
and other multi-input operations. Structural relation data contains no timestamps.
Optional wall-clock or UI labels belong to diagnostic metadata and never affect the
relation identity or replay hash.

### 4.4 History is bounded and semantic

Use inverse commands or structural patches for small edits, checkpoints for large
transitions, and recomputation for ephemeral analysis. Never put unconditional mesh,
volume, grid, or sampled-field copies into command/history JSON. An irreversible
checkpoint is explicit and clears incompatible redo state.

### 4.5 Dependency invalidation is correct before it is local

GK02 begins with full deterministic propagation over the explicit relation graph.
Only requested resources are recomputed. Local one-ring/two-ring or changed-cell
invalidation remains disabled until GK18 proves equivalence with full recomputation
and benchmarks a material benefit. The full strategy always remains a fallback.

Shared lifecycle vocabulary:

- `clean`
- `dirty`
- `computing`
- `failed`
- `unavailable`
- `stale`

GK18 may add `dirty-local` and `dirty-global` only for resources whose local strategy
has passed the oracle/parity gate.

### 4.6 Jobs describe semantics, not execution location

Feature modules submit namespaced operations, exact source generations, parameters,
limits, precision/tolerance, and required capabilities. They do not branch on
Electron, browser, mobile, worker, native process, or remote server. The broker
selects an advertised adapter and returns inspectable routing/provenance metadata.

### 4.7 Platform and compute capabilities are separate

Compute capabilities describe supported operations and resource limits. Platform
capabilities describe runtime facilities:

- filesystem and native dialogs;
- worker and transferable-buffer support;
- SharedArrayBuffer and isolation requirements;
- WebGL/WebGPU availability and limits;
- local persistence;
- remote compute policy;
- touch/mobile interaction;
- native-process/service availability.

No feature module should retain scattered `isElectron`, `isMobile`, or equivalent
backend selection once its GK migration is complete.

### 4.8 Selection has preview and committed forms

The shared selection contract covers object, face, edge, and vertex identity plus
optional mesh/resource key, source mapping, world observation, normal/tangent basis,
and label. Mathematical identity uses stable object/cell references; world points and
indices are observations and cannot silently become persistent authority.

- Hover and provisional picks are transient.
- Committed selection is a typed command with an explicit history policy.
- Empty-space clearing is consistent across modules.
- A structural edit deterministically preserves, remaps, or invalidates selection.
- Inspector subscriptions query committed selection and source lineage through the
  kernel rather than reading tool-local stores.

### 4.9 Events announce completed facts

Commands express intent, documents hold canonical truth, and events announce facts
that already committed. Events are immutable, ordered within a transaction, compact,
and independent of component lifecycles. Cross-document additions may include:

- relation created/staled/removed;
- dependency invalidated;
- result/artifact status changed;
- committed selection changed/invalidated;
- workspace checkpointed/replayed.

The event system is not an unrestricted global message bus. Every event type has an
owner, schema, ordering rule, payload limit, and replay relevance declaration.

### 4.10 Queries never mutate

Queries return detached immutable projections for document identity, committed
selection, resource status, relation parents/children, result provenance, and
locate-back. Query execution cannot transact or mutate a registry. A string-based
global query registry is optional; typed selectors remain acceptable when they pass
the same isolation and cross-runtime conformance rules.

### 4.11 Replay is the integration oracle

For migrated workflows, GUI actions, Scene Script, import, save/reopen, and replay
must converge on the same canonical documents, IDs, relations, and structural hashes.
Backend differences may alter an explicit availability/status/engine record, not the
meaning of the source document or command.

## 5. Dependency direction and target package shape

```text
apps/*
  ↓
UI shells and feature adapters
  ↓
@math3d/kernel       lifecycle coordination
  ↓
@math3d/core         serializable contracts and pure domain-neutral primitives
  ↓
domain algorithms   Geometry / Mesh / Surface / Curve / Volume / Topology / Complex

Execution adapters plug into the kernel job/capability boundary from the side.
```

Forbidden dependencies after the relevant migration gate:

- `core → React | Three.js | Electron | DOM | Node process APIs`
- `kernel → React | Three.js | Electron | module UI`
- `Geometry feature → Mesh UI`
- `Mesh feature → desktop shell`
- `worker/service → React component`
- module-local code creating a second command bus, history owner, artifact registry,
  scientific broker, relation graph, or invalidation framework

Keep the existing `packages/core` and `packages/kernel`. Add focused modules within
them for relations, dependency traversal, selection, and capabilities. Do not create
`packages/contracts` merely to rename existing core contracts. Create a workspace
package in GK17 only when mixed-document persistence has a proven API boundary.
Moving domain algorithms into dedicated packages may happen incrementally, but it is
not a prerequisite for lifecycle migration.

## 6. Historical source traceability

### 6.1 Original A1-G3 architecture proposal

| Original requirement | Current evidence | Remaining executable work |
| --- | --- | --- |
| A1 kernel boundary | F02-F08; `@math3d/core`, `@math3d/kernel` | GK20 freezes final surface |
| A2 typed commands/registry | F03; T05; C04 | GK04-GK15 module adoption |
| A3 events and queries | F04 plus artifact/job events | GK02, GK03, GK16, GK17 |
| B1 object/relationship graph | Domain-local Geometry/Topology/Complex relations | GK01, GK02, GK17 |
| B2 provenance | F06; T09/T12; C06/C11 | GK01 and GK16 unify lineage presentation |
| C1 dependency resources | F07 artifact registry; module-local dependencies | GK02 and GK06-GK15 |
| C2 deterministic invalidation | F07 document-source invalidation | GK02 graph propagation |
| C3 incremental invalidation | Deliberately not enabled | GK18 only behind oracle parity |
| D1 history/undo/redo | F04; T05; C04 | GK05, GK08, GK10, GK12, GK14 |
| D2 replay | F03/F04; T11/T13; C09/C12 | GK17 mixed workspace |
| D3 replay suite | Topology/Complex gates | GK03 reusable adapter harness; GK19 runtimes |
| E1 backend-independent jobs | F05 | GK06, GK09, GK11-GK15 adoption |
| E2 capabilities | F08 compute capabilities | GK19 platform capabilities/conformance |
| E3 routing/admission | F08 broker | Domain adapters and GK19 proof |
| F1 Geometry migration | Released professional UI, not shared lifecycle | GK04-GK06 |
| F2 Mesh migration | Released Mesh/Analyze, not shared lifecycle | GK07-GK09 |
| F3 Surface/Volume migration | Released professional workflows | GK10-GK11, GK14-GK15 |
| F4 Curve/procedural migration | Released Curves and Scene Script | GK05, GK12-GK13 |
| G1 invalidation conformance | F07 unit oracle | GK02, GK03, GK18 |
| G2 cross-runtime conformance | Module release smoke/E2E evidence | GK19 |
| G3 architecture freeze | Current docs are partial | GK20 |

### 6.2 Earlier G01-G08 generalization table

An earlier program summary also used `G01-G08`, but with different boundaries from
the current post-C12 milestone grouping. It remains requirements input, not a second
sequence. The mapping below prevents its gates from being lost or mistaken for the
current group numbering.

| Earlier group requirement | Covered by current plan | Preserved gate |
| --- | --- | --- |
| legacy G01 Scene Script lowering, execution parity, snapshot and operation-log exports | GK05; GK17 for mixed-workspace envelopes | Scene → Script → Scene, Scratch → Scene Script → Scratch, and Scene Script → Scratch → Scene Script structural parity; exported canonical snapshot and compact operation log replay to the same structure |
| legacy G02 Geometry/Viewer commands, selection, edits, and history bridge | GK04-GK05; GK16 | Viewer, Inspector, Script, committed selection, history, and undo agree |
| legacy G03 derived-resource graph and invalidation | GK01-GK03 | No stale dependent relation, result, or artifact is presented as current |
| legacy G04 first Mesh analysis migration and worker adapter | GK07-GK09 | Revision, cancellation, deadline, stale-publication, and provenance conformance |
| legacy G05 Geometry construction and Surface/Curve/Volume slices | GK04-GK06; GK10-GK15 | Per-module replay, provenance, save/reopen, and locate-back gates |
| legacy G06 local invalidation | GK18 | Measured improvement with full global-oracle correctness parity |
| legacy G07 browser/desktop runtime conformance | GK19 | Contract parity on supported runtimes, extended to mobile and worker adapters |
| legacy G08 contract freeze and adapter removal | GK20 | One mutation/lifecycle route per completed workflow |

The word `legacy` in this table qualifies only the superseded grouping labels. The
requirements and acceptance gates remain active.

## 7. Executable rollout: G01-G08 / GK01-GK20

### G01 — Shared relations, dependencies, selection contract, and conformance

#### GK01 — `feat(core): add cross-document relation and lineage contracts`

**Goal.** Establish one compact immutable lineage language before any additional
module migration.

**Scope.** Add strict schema-v1 relation IDs and kinds; one-or-more exact source
document generations; target document/result/artifact references; producing
command/job/result references; namespaced operation, canonical parameters, engine or
tool version reference where relevant; current/stale/broken/unavailable status; and
two-way traversal helpers. Model Geometry → Mesh, Surface → Mesh, Curve →
Surface/Geometry, Volume → Surface/Mesh, Mesh → Topology, and Complex →
Riemann-surface/Surface/Mesh without payloads.

**Compatibility.** Adapt T12 and C11 lineage in memory. Keep their persisted formats
and module UI unchanged. Domain-local relations remain readable until their module
gate migrates them.

**Acceptance.** Canonical JSON and relation IDs are deterministic; source order is
normalized where semantics are unordered; every source generation is exact; stale
sources cannot produce a current relation; multi-source operations are supported;
forward/reverse traversal agrees; cycles are not introduced by relation creation;
records stay under a reviewed compact-size limit; no source or artifact payload is
embedded.

#### GK02 — `feat(kernel): add derived-document dependency graph and invalidation`

**Status:** complete

**Goal.** Extend F07 correctness from artifacts of one document to the complete
cross-document relation graph.

**Scope.** Add a compact graph over document generations, relations, result records,
artifact references, and promoted snapshots. Implement deterministic full downstream
invalidation, topological traversal, cycle diagnostics, idempotent repeated
invalidation, immutable invalidation reports, and ordered compact completed events.
Never mutate promoted downstream source documents.

**Acceptance.** Editing one source stales exactly its dependent relation/result/
artifact generations; unrelated branches remain current; multi-source dependencies
invalidate when any source changes; cycles are rejected or explicitly quarantined;
event order and reports are deterministic; F07 remains the byte-store owner; local
invalidation is absent; no stale dependent resource can be queried or presented as
current.

**Completion evidence.** Implemented as the kernel-owned
`InMemoryDependencyGraph`, consuming K46 and the GK01 relation contract. Full
downstream invalidation, cycle rejection, multi-source propagation, stable reports,
ordered completed events, promoted-snapshot preservation, and F07-owned artifact
invalidation are gated by `npm run test:kernel:gk02`. Local invalidation remains
deferred to GK18.

#### GK03 — `test(kernel): add domain-adapter and selection conformance harness`

**Goal.** Make kernel migration a reusable contract gate, not a UI claim.

**Scope.** Build one adapter harness for identity/revision, field authority, command
validation, atomic batches, inverse/checkpoint history, undo/redo, replay, query
isolation, event ordering, result provenance, artifacts, job cancellation/deadline,
stale publication, relations, invalidation, persistence, and capabilities. Add a
shared selection contract harness for transient hover, committed selection, clear,
history policy, structural invalidation/remap, source locate-back, and Inspector
query isolation.

**Acceptance.** Reference Topology and Complex adapters pass first. Geometry, Mesh,
Surface, Curve, and Volume must pass before their migration group closes. The same
fixture vocabulary is usable in browser/desktop test adapters. UI-only tests cannot
declare lifecycle migration complete.

**Completion evidence.** Implemented in `@math3d/kernel` as the reusable
`runDomainAdapterConformance` and `runSelectionConformance` fixtures. Production
Topology and Complex command adapters pass the same identity, preview, atomicity,
history, replay, persistence, and query-isolation matrix; the released unified
selection model passes hover, commit, clear, history, structural invalidation,
locate-back, and Inspector-isolation checks. Existing artifact, job, cancellation,
stale-publication, relation, invalidation, persistence, and capability suites are
composed by `npm run test:kernel:gk03`. Contract details are recorded in
`docs/kernel-domain-adapter-conformance.md`.

### G02 — Geometry and Scene Script

#### GK04 — `refactor(geometry): introduce kernel-owned GeometryDocument adapter`

**Scope.** Adapt construction graphs, geometry objects, constraints/relationships,
parameters, and persistent scene intent into a strict versioned document. Classify
mathematical, persistent metadata, persistent display, and transient viewer fields.
Preserve released files through explicit read adapters and normal user-controlled
save/export decisions.

**Acceptance.** Source edits advance revision/hash exactly once; view-only changes do
not; IDs survive replay; canonical documents contain no React/Three objects or large
mesh buffers; save/reopen/replay preserves construction structure and identity;
legacy projects open without silent rewrite; GK03 document gates pass.

**Completion evidence.** Added the strict v1 `GeometryDocument` with explicit
structural source, persistent metadata, persistent display, provenance, and a
separate transient-view contract. The legacy SceneDocument read adapter preserves
objects, surfaces, constructions, relationships, parameters/extensions, presentation,
and stable IDs without mutating the opened value; compatibility export is explicit.
`GeometryDocumentAdapter` now owns source/display replacement through shared kernel
transactions, inverse history, undo/redo, replay, and isolated queries. Runtime
buffers and non-JSON UI/Three values are rejected. `npm run test:kernel:gk04` runs
the GK03 fixture plus round-trip/legacy/authority gates documented in
`docs/kernel-geometry-document-adapter.md`.

#### GK05 — `refactor(geometry): unify Scene Script, Scratch, and GUI commands`

**Scope.** Add a Geometry/Scene Viewer command adapter and lower equivalent Scene
Script, Scratch, and GUI add/set/remove/show/hide/construction, constraint,
topology-edit, and committed-selection operations to shared typed command families.
Inspector reads use kernel queries. Kernel transactions own commit/history/undo/
redo/replay and bridge existing module history during migration. Hover, drag,
temporary picks, and script/editor previews remain transient. Preserve explicit
exports for canonical Scene snapshots and compact versioned operation logs; those
exports use shared command/document serialization rather than a parallel script-only
history format. Adapt the Scratch construction graph and its editor script through
the same canonical GeometryDocument and command families. Support both Scratch →
Scene Script and Scene Script → editable Scratch for the common representable
construction subset; preserve stable entity IDs, parameters, constraints,
dependencies, authoring metadata, and committed selection where representable.
Return structured conversion diagnostics for unsupported or lossy constructs and
keep the authoritative source unchanged—never silently drop or approximate them.

**Acceptance.** Scene → Script → Scene and GUI ↔ Script structural parity hold;
failed heterogeneous batches are atomic; one pointer gesture creates at most one
committed edit; committed selection and empty-space clear obey the GK03 contract;
an exported snapshot plus operation log replays to the same canonical scene
structure. Scratch → Scene Script → Scratch preserves the canonical construction
graph, constraints, dependencies, IDs, and parameters. Scene Script → Scratch →
Scene Script produces the same normalized Scene Script for every construct advertised
as Scratch-compatible.
Unsupported conversion produces actionable diagnostics without partial mutation.
Viewer, Inspector, Scene Script, Scratch, GUI edits, history, and undo resolve the
same committed document revision and selection.
The old mutation/history path is either removed or listed with a specific parity and
removal gate.

#### GK06 — `feat(geometry): publish revision-safe derived geometry resources`

**Scope.** Route expensive tessellations, measurements, sections/intersections,
diagnostics, and generated Geometry → Mesh outputs through shared result/artifact/job
contracts where appropriate. Permit bounded synchronous exact operations only with a
documented cost/authority reason. Record GK01 lineage for derived or promoted data.

**Acceptance.** Every output records exact source generation, operation, algorithm,
status, engine, and precision/tolerance where applicable; dense data is artifact-
backed; late output cannot publish; Geometry → Mesh locate-back works; GK03 passes.

### G03 — Mesh and Mesh Analyze

#### GK07 — `feat(mesh): introduce versioned MeshDocument and resource identity`

**Scope.** Give imported/generated meshes stable document/resource/object identity,
revision/hash/generation, compact metadata, and artifact-backed vertex/index/
attribute buffers. Preserve importers and released save behavior through adapters.

**Acceptance.** Import/save/reopen/replay preserves identity and GK01 lineage; bulk
buffers never enter commands, history, events, or document JSON; source edits advance
once and invalidate dependent analysis; unavailable cache data is explicit; GK03
document/persistence gates pass.

#### GK08 — `refactor(mesh): route committed mesh edits and selection through kernel transactions`

**Scope.** Migrate object/face/edge/vertex edits, split, offset, subdivide, repair,
smoothing/remeshing, controlled imports, and committed selection. Preserve hover and
pick preview as transient. Define selection preservation/remap/invalidation for every
topology-changing operation.

**Acceptance.** GUI edit, history, undo/redo, replay, and save produce the same source;
invalid mixed batches change nothing; a gesture produces one commit; professional
selection semantics and source locate-back remain compatible; redundant module-local
history/selection paths have named removal gates.

#### GK09 — `feat(mesh): migrate Mesh Analyze to shared jobs results and artifacts`

**Scope.** Move normals, curvature, principal directions, Gauss maps, topology,
quality diagnostics, and other heavy Mesh Analyze outputs to shared jobs/results/
artifacts. Retain summaries only in compact records. Adapt the first production Mesh
analysis worker to the shared job protocol and reuse F08 capability routing for
CGAL/VTK/native/worker backends without exposing transport details to the command.

**Acceptance.** Stress fixtures cancel safely; changed meshes reject late results;
large fields stay outside React and document/history JSON; UI distinguishes computing,
current, stale, failed, unavailable, and scientific authority; backend decisions are
inspectable; the worker adapter proves revision binding, cancellation, deadlines,
failure semantics, provenance, and resource-state transitions; GK03 analysis gates
pass.

### G04 — Surfaces and derived Mesh

#### GK10 — `feat(surface): introduce kernel-owned SurfaceDocument adapter`

**Scope.** Adapt parametric/explicit definitions, AST/expression source, domains,
parameters, construction links, branch/assumption policy where relevant, and
persistent analysis settings. Keep samples, camera, hover, and temporary chart state
non-authoritative.

**Acceptance.** Definition edits deterministically change identity; display/sampling
preview changes do not; save/reopen/replay preserves mathematics; old files load
through explicit adapters; GK03 document/command/persistence gates pass.

#### GK11 — `feat(surface): make Surface-to-Mesh a revisioned derived handoff`

**Scope.** Make tessellation an explicit operation publishing a revision-bound mesh
artifact. Promotion creates a stable Mesh snapshot plus GK01 relation with parameters,
tolerance/resolution, engine/version, and correspondence/locate-back metadata.

**Acceptance.** Derived Mesh locates back to the exact Surface generation and
operation; Surface edits stale the relation/artifact without mutating promoted Mesh;
missing cache data is unavailable/recomputable; multi-surface operations use GK01
multi-source relations; Surface save/reopen/replay preserves the handoff operation,
source generation, parameters, and lineage.

### G05 — Curves and construction handoffs

#### GK12 — `feat(curves): introduce kernel-owned CurveDocument and analysis adapter`

**Scope.** Adapt Bézier, spline/NURBS, parametric definitions, controls, knots,
weights, parameters, and supported construction links. Route sampling, arc length,
frames, curvature, torsion, and dense fields through shared result/artifact/job
contracts where appropriate. Handle dragging is preview-only until commit.

**Acceptance.** Edits, committed control selection, replay, save/reopen, invalidation,
status publication, and backend routing pass GK03; exact and numerical authority stay
distinguishable; no dense samples enter persistent command history.

#### GK13 — `feat(curves): add revisioned sweep extrusion and surface lineage`

**Scope.** Represent Curve → Surface/Geometry sweep, extrusion, revolution, ruled
surface, loft participation, and other supported handoffs as typed operations with
GK01 relation and artifact/document references.

**Acceptance.** Generated targets retain exact source generation(s) and parameters;
promoted documents never update implicitly; correspondence-based locate-back reaches
source curve elements; multi-curve lofts prove normalized multi-source lineage;
Curve save/reopen/replay preserves construction operations and provenance.

### G06 — Volumes and extraction handoffs

#### GK14 — `feat(volumes): introduce kernel-owned VolumeDocument adapter`

**Scope.** Adapt volume definitions, scalar/implicit/boundary semantics, transforms,
parameters, construction state, transfer-function persistence policy, and analysis
settings. Sampling buffers, temporary slices, hover probes, and camera remain
non-authoritative.

**Acceptance.** Source is deterministic and replayable; source edits advance once and
invalidate boundary/sampling/mesh resources; view-only edits do not change the source
hash; bulk voxels use resource/artifact identity; save/reopen preserves source and
analysis settings; GK03 passes.

#### GK15 — `feat(volumes): add revisioned boundary-surface and mesh handoffs`

**Scope.** Route supported Volume → Surface/Mesh extraction through shared jobs,
artifacts, and GK01 relations with operation parameters, tolerance/resolution,
engine/version, diagnostics, and exact source generation.

**Acceptance.** Derived output cannot remain current after a Volume source change;
promoted documents are stable snapshots with explicit stale lineage; extraction
correspondence supports locate-back where available; memory admission rejects unsafe
work before launch; Volume save/reopen/replay preserves extraction parameters,
source generation, and provenance.

### G07 — Shared Viewer Inspector and workspace

#### GK16 — `feat(viewer): unify provenance status selection and locate-back`

**Scope.** Provide shared UI contracts/presentation for document identity/revision,
committed selection, result authority, operation/method/engine, tolerance/precision,
artifact availability, staleness, and GK01 lineage. Support navigation across all
module relations through pure queries.

**Acceptance.** Status vocabulary means the same thing everywhere; transient hover
cannot appear as committed selection; selected derived objects/results navigate
through relation → operation → artifact/result → canonical object → source where
mapping exists; UI components do not own competing provenance or selection truth.

#### GK17 — `feat(workspace): persist cross-module replay and lineage records`

**Scope.** Define the mixed workspace envelope containing compact module checkpoints/
logs, active document references, current result/artifact handles, committed
selection policy, Scratch/Workbook construction sources and normalized script
representations, and GK01 relations. Bulk artifacts remain cache data. Add explicit
legacy adapters and replay diagnostics.

**Acceptance.** A mixed project saves, reopens, and replays Geometry, Surface, Mesh,
Curve, Volume, Topology, and Complex documents with matching source hashes and
relation IDs; missing artifacts reopen unavailable; no capability is fabricated;
browser/desktop formats agree; workspace persistence does not own domain algorithms.

### G08 — Optimization platform conformance and lifecycle freeze

#### GK18 — `perf(kernel): add dependency-local invalidation behind full-oracle parity`

**Scope.** Add optional changed-object/cell/face/edge/vertex sets and affected-region
contracts for large workloads only when mathematics permits. Compare every local
strategy with GK02 full deterministic invalidation/recomputation and retain global
fallback.

**Acceptance.** Property tests prove local/full output and staleness parity; no stale
resource survives; benchmarked workloads show material improvement; unproven resource
types stay global; `dirty-local` and `dirty-global` remain explicit.

#### GK19 — `test(platform): prove platform capability and execution conformance`

**Scope.** Add one immutable general platform-capability snapshot alongside F08
compute capabilities. Exercise command, query, event, history, replay, result,
artifact, job, relation, invalidation, selection, and persistence contracts across
supported browser, desktop, mobile, and worker adapters. Test native/WASM/Sage/CGAL/
VTK adapters where installed. Keep a future workspace-server/remote adapter as a
contract fixture unless a service is actually shipped. Validate the forbidden
dependency directions and ensure runtime-specific imports remain behind adapters.

**Acceptance.** Supported operations are contract-equivalent; platform facilities
are centrally inspectable; unsupported capabilities fail before transport or UI
action; cancellation/deadline/stale semantics match; no feature module branches on
runtime identity after migration; mobile limitations and optional native backends are
explicit rather than silently degraded; browser/desktop dependency and contract
conformance pass on every supported runtime.

#### GK20 — `refactor(kernel): remove redundant lifecycle paths and freeze architecture`

**Scope.** After GK03-GK19 gates, remove only lifecycle implementations proven
redundant. Freeze versioned shared contracts, enable dependency-direction checks in
CI, document remaining adapters with owners/removal criteria, and publish the final
architecture overview, command/query/event contracts, document/relation/provenance
model, history/replay policy, result/artifact/job/capability model, selection rules,
extension guide, security boundary, and migration matrix.

**Acceptance.** Every completed workflow has one production mutation/lifecycle path;
domain modules own mathematics rather than frameworks; dependency checks pass;
legacy files remain readable; cross-module save/reopen/replay/lineage E2E gates are
green; public extension rules are versioned; no unresolved duplicate owner lacks a
documented exception and removal gate.

## 8. Rollout dependencies

```text
F02-F08 shared kernel foundation                         COMPLETE
Topology T01-T13 + Complex C01-C12                       COMPLETE
                    |
                    v
GK01 relations → GK02 dependency graph → GK03 harness/selection
                    |
        +-----------+-----------+-----------+-----------+
        v                       v           v           v
 GK04-GK06 Geometry       GK07-GK09 Mesh  GK10-11   GK12-15
 + Scene Script            + Analyze       Surface   Curve/Volume
        +-----------------------+-----------+-----------+
                                v
                       GK16 Viewer/Inspector
                                |
                                v
                       GK17 mixed workspace
                                |
                                v
                  GK18 local invalidation (proved only)
                                |
                                v
                    GK19 conformance → GK20 freeze
```

After GK03, Geometry and Mesh may progress independently when files do not overlap.
Surface, Curve, and Volume handoffs must consume GK01/GK02 rather than creating direct
module coupling. GK16 requires migrated provenance/selection adapters; GK17 requires
stable module documents and relations. GK18 cannot precede the full graph oracle.
GK20 is terminal and cannot remove an adapter before its parity evidence exists.

## 9. Per-commit verification policy

Every GK commit includes:

- focused UI-independent contract or adapter tests;
- strict canonical-JSON/unknown-field/size validation where persistent data changes;
- source revision/generation and stale-publication tests;
- compatibility tests while a legacy adapter exists;
- relevant domain professional/release suites;
- `typecheck:noemit` and affected production builds;
- dependency checks for changed package boundaries;
- an explicit statement of UI and persistent-format impact;
- a roadmap completion note mapping the original A-G requirement and reused F/T/C
  evidence.

Additional gates:

- GK01: all relation kinds, multi-source normalization, two-way traversal, compactness.
- GK02: property tests for exact invalidation sets, cycles, idempotence, event order.
- GK03: reusable adapter matrix and selection lifecycle fixtures.
- GK04-GK15: each module's existing professional unit/E2E/performance/backends gates.
- GK16: cross-module status, selection, provenance, and locate-back UI tests.
- GK17: mixed-workspace save/reopen/replay fixtures and unavailable-artifact behavior.
- GK18: local/full oracle property tests plus reviewed benchmark reports.
- GK19: browser/desktop/mobile/worker capability matrix and optional-backend fixtures.
- GK20: dependency graph audit, duplicate-lifecycle inventory, extension docs, and full
  cross-module acceptance suite.

## 10. Security reliability and performance policy

- Renderer code never launches shells, Node subprocesses, native libraries, or Sage
  directly. Narrow runtime adapters enforce allowlisted operations and typed IPC/RPC.
- Sage/native/remote adapters receive structured operations and normalized inputs,
  never unrestricted source code in ordinary analysis requests.
- Every job declares deadline, cancellation, source generation, output/memory/work
  limits, and an isolated execution policy appropriate to its backend.
- Retry/fallback follows F08 idempotence policy. Scientific failures, protocol errors,
  cancellation, deadlines, and stale-source outcomes are never silently retried as a
  different scientific claim.
- Large payloads use artifact storage and transferable/streaming transport. React
  state, events, documents, relations, and command history remain compact.
- Expensive work receives preflight size/memory admission. Unsafe work returns an
  actionable alternative rather than beginning optimistically.
- A relation or result cannot claim a stronger authority than its source, operation,
  assumptions, correspondence, engine, and validation evidence support.
- Native dependencies require license, packaging, and platform audits before a public
  feature depends on them.

## 11. Compatibility and migration rules

1. No big-bang rewrite. Migrate one vertical workflow at a time behind an adapter.
2. Old documents load through explicit versioned adapters and are not rewritten merely
   because they were opened.
3. New writers do not overwrite old files in place without normal user save/export.
4. Legacy results without complete provenance remain legacy/limited.
5. Missing artifacts reopen unavailable or needing recomputation; never current.
6. Promoted derived documents are stable snapshots, not live implicit coupling.
7. Old and new mutation paths may coexist only with a named owner, parity fixture, and
   removal criterion.
8. Rendering and visual regression verify presentation, never mathematical truth.
9. Optional backends remain capabilities; their absence cannot corrupt source state.
10. A module migration closes only after GK03 conformance and its released professional
    workflow gates pass.

## 12. Cross-module definition of done

The Application Kernel rollout is complete only when:

1. Geometry, Mesh, Surface, Curve, Volume, Topology, and Complex source documents use
   stable kernel identity, revision, and structural hash.
2. Every migrated committed edit, import, selection, and save-relevant operation has
   one typed transaction path; previews stay transient.
3. Shared history owns undo/redo/checkpoints without retaining large payload copies.
4. Expensive computation uses shared jobs/results/artifacts or has a reviewed bounded
   synchronous exception.
5. Cross-module derived data retains exact multi-source generation, operation,
   parameters, result/artifact, and locate-back lineage.
6. Source changes deterministically stale dependent relations/results/artifacts without
   mutating promoted downstream source documents.
7. Mixed save/reopen/replay preserves source hashes, command order, relation IDs,
   result references, selection policy, and artifact availability.
8. Viewer/Inspector selection, authority, status, provenance, and locate-back semantics
   are uniform across modules.
9. Platform and compute capability decisions are centralized, inspectable, and
   contract-equivalent across supported runtimes.
10. No completed module owns a duplicate command bus, history service, job broker,
    result/provenance model, artifact registry, relation graph, selection service, or
    dependency-invalidation framework.
11. Static dependency rules prevent core/kernel from importing UI/runtime layers.
12. The kernel remains small lifecycle infrastructure; domain algorithms remain owned
    by their mathematical modules.

## 13. Explicitly deferred work

- Local/incremental invalidation before GK18 parity and benchmarks.
- A production workspace server or remote-compute product unless separately approved.
- Mandatory GPU/native dependencies.
- Real-time collaboration, distributed command logs, or conflict-free replicated data.
- Replacing module algorithms merely to move them into a new package.
- A monolithic `Math3DDocument` containing every source and artifact payload.
- Removal of any compatibility adapter without saved-file and workflow parity evidence.

## 14. Execution status and next action

The combined roadmap is approved. Execute it as follows:

1. Retain the detailed F/T/C completion evidence in
   `docs/math3d-topology-complex-kernel-program-roadmap.md` without reopening it.
2. Treat A1-G3 and the earlier G01-G08 table as historical requirements mapped by
   Section 6, not as parallel execution sequences.
3. Execute the first extension, **GK01 — `feat(core): add cross-document relation and
   lineage contracts`**.
4. Do not begin module migrations until GK01-GK03 establish relations, deterministic
   dependency behavior, adapter conformance, and shared selection semantics.
