# MATH3D Topology, Complex Analysis, and Kernel Program Roadmap

## Status and decision

**Type:** strategic architecture and module-delivery program
**Delivery order:** minimal kernel seed -> Topology v1 -> Complex Analysis MVP/v1 -> general application-kernel rollout
**Primary objective:** make mathematical source documents, scientific results, and viewer state reproducible, revision-safe, and portable across MATH3D runtimes.

This roadmap is additive.  It does not replace or delete earlier plans, existing
workflows, file formats, tests, or visual laboratories.  It provides the complete
program view and fixes the execution order between them.

## Companion plans that remain in force

| Document | Role |
| --- | --- |
| `docs/application-kernel-scene-script-migration-plan.md` | Detailed implementation catalogue for the application kernel, Scene Script, Geometry, resources, jobs, and later module migration. |
| `docs/topology-complex-kernel-delivery-order.md` | Canonical sequential commit order: F01-F07, T01-T13, C01-C12, then generalization. |
| `docs/architecture-layered-workspace.md` | Existing shared-package and cross-runtime boundary rules. |
| `docs/geometry-professional-implementation-roadmap.md` | Existing Geometry and Scene Script requirements that must not regress. |
| `Math3d - strategiczna mapa dalszego rozwoju modułów Complex Analysis i Topology.pdf` | Strategic research and product context; it is reference material, not an executable instruction set. |

Where labels differ, use the following rule:

```text
F / T / C labels = program delivery order and unique commit identities
K01-K51 = detailed application-kernel implementation catalogue
```

The K catalogue is consumed after C12 unless a narrowly scoped K capability is
explicitly required by an active F, T, or C commit.  Do not create a second command,
job, provenance, artifact, or history system merely to satisfy a module deadline.

## Background

MATH3D already contains substantial interactive work:

- Geometry has procedural Scene Script, scene-to-script serialization, transactional
  script application, selection, construction, and viewer workflows.
- Topology has teaching-oriented polygon/quotient editing, triangulation,
  realization, diagnostics, and a versioned topology format.
- Complex Analysis has Function Explorer, Mobius, Riemann Sphere, Residue, Branch,
  and Covering laboratories, plus a controlled TypeScript complex-expression
  evaluator.

The issue is not absence of visual features.  It is that feature state, derived
results, execution lifecycles, and provenance are not yet one shared mathematical
contract.  Direct UI state mutations and module-local result handling become unsafe
when operations need undo/redo, replay, exact computation, long-running workers,
cross-module handoffs, or reliable inspection.

Topology is the first formal vertical slice because its canonical finite complex,
boundary identity, and homology give strong correctness oracles.  Complex Analysis
is next because it needs the same revisions, jobs, artifacts, result states, and
provenance, while preserving instant visual exploration.  The generalized kernel is
then based on demonstrated needs rather than speculation.

## Product outcomes

At the end of this program a user can:

1. Create or import a Topology source, see its canonical finite complex, calculate
   exact homology when eligible, inspect the proof chain, save it, reopen it, and
   replay the same operation history.
2. Define a complex function, explore it immediately, request numerical or exact
   analysis, understand the status/precision/limitations of the result, and replay
   the work later.
3. Inspect a Riemann-surface or Mesh/Topology visualization and navigate back to
   the source document, revision, operation, parameters, and result that produced it.
4. Use Scene Script, GUI actions, imports, and worker results without creating
   competing state-mutation paths.
5. Run the same persistent documents and command/replay contracts in desktop and
   web environments where the required capability is available.

## Scope and non-goals

### In scope

- Kernel transactions, query/event contracts, bounded history, command replay,
  revisioning, provenance, artifact lifecycle, and backend-independent jobs.
- Topology canonical finite 2D complexes, validation, exact boundary operators,
  H0-H2 over Z and Z2, eligibility-gated classification, and Mesh handoff.
- Complex canonical AST documents, safe preview, numerical/exact result distinction,
  constrained Sage analysis, contour workflows, branch continuation, monodromy, and
  Riemann-surface handoff.
- Progressive Scene Viewer migration as a renderer of canonical documents and
  revision-safe artifacts.

### Explicitly out of scope until the stated release boundaries

- Collaboration/CRDTs, remote computation scheduling, GPU scheduling, and generic
  distributed execution.
- Persistent homology, Rips/Alpha/CECH workflows, zigzag/vineyards, and higher
  dimensional TDA.
- General algebraic Riemann surfaces, conformal/Riemann mapping research tools, and
  a broad notebook execution environment.
- A big-bang `App.tsx` rewrite, a new general event bus, or replacement of all
  existing viewer code.
- Treating a rendered shape as formal evidence of a topological or analytic claim.

## Target architecture

```text
                         UI shells and viewers
       Topology editor / Complex labs / Scene Viewer / Inspector
                                     |
                                     v
                         feature adapters only
                                     |
                                     v
 +----------------------------------------------------------------+
 |                         MATH3D KERNEL                          |
 | commands | transactions | queries | completed events | history |
 | replay   | provenance   | artifacts | jobs           | policy  |
 +----------------------------+-----------------------------------+
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
   domain documents and algorithms      execution adapters
   Topology / Complex / Geometry        JS worker / Sage / CGAL /
   Mesh / Surfaces / Volumes / Curves   browser / desktop
             |                                 |
             +---------------+-----------------+
                             v
              versioned documents and artifacts
```

### Responsibility boundaries

| Layer | Owns | Must not own |
| --- | --- | --- |
| `@math3d/core` | Serializable schemas, IDs, revisions, hashes, command/result/provenance contracts, validation primitives. | React state, Three.js objects, Electron APIs, worker process ownership. |
| `@math3d/kernel` | Transaction lifecycle, queries, completed-fact events, history/replay, artifact generations, job lifecycle. | Domain mathematical algorithms, renderer components, unrestricted expression evaluation. |
| Topology domain | Source interpretation, canonicalization, cell structure, matrices, validation, homology/classification mappings. | UI-only truth or generic worker scheduling. |
| Complex domain | Parser/AST, preview compiler, contour/branch algorithms, AST-to-Sage request mapping, Riemann-surface semantics. | Private lifecycle/provenance/artifact framework. |
| Viewer/UI | Editing intent, transient drag/hover state, rendering, presentation of diagnostics and result status. | Canonical document mutation, mathematical authority, direct worker process control. |
| Execution adapter | Structured requests, resource limits, cancellation, compact result/artifact publication. | UI imports, direct document mutation, arbitrary user code execution. |

## Architectural invariants

1. Commands express intent; state holds canonical truth; events announce facts only
   after a successful transaction.
2. Every persisted source and scientific result has a stable ID, revision, and
   structural hash.  Result publication requires a matching source generation.
3. Command payloads and result summaries are serializable.  Large grids, matrices,
   meshes, and binary data are artifact handles, not React/store payloads.
4. Every result exposes its epistemic status: `exact`, `certified`, `numerical`,
   `recognized`, `heuristic`, `unsupported`, `failed`, or `cancelled`.
5. A transaction validates fully before commit.  Failure produces no partial source
   mutation, history record, or completed domain event.
6. Preview is allowed to be approximate and transient.  Analyze/Apply publishes a
   revision-bound result with method, parameters, precision/tolerance, diagnostics,
   engine, and engine version.
7. Existing file formats remain readable.  New schema versions upgrade explicitly;
   unsupported data is diagnosed, never silently discarded.
8. Core/kernel imports never depend on React, Three.js, Electron, browser globals,
   or a particular worker implementation.
9. Full deterministic invalidation comes before local incremental invalidation.
10. A compatibility adapter has an owner, a parity gate, and a removal commit.

## Requirements

### Shared kernel requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| KR-01 | Execute typed, versioned commands atomically. | Unit tests: validation, failure, ordering, immutable input. |
| KR-02 | Support deterministic replay from checkpoint plus command sequence. | Structural hash fixtures and first-divergence diagnostics. |
| KR-03 | Offer read-only queries and ordered completed-fact events. | Transaction/event conformance tests. |
| KR-04 | Maintain bounded undo/redo history with explicit irreversible policy. | Heterogeneous command undo/redo tests. |
| KR-05 | Guard every artifact and job result by source revision/generation. | Stale/cancelled late-publication tests. |
| KR-06 | Represent provenance, status, precision, engine/version, diagnostics and artifacts consistently. | Schema validation and inspector tests. |
| KR-07 | Provide controlled job submission, progress, cancellation, deadlines and output limits. | In-process and worker-adapter contract tests. |
| KR-08 | Preserve persistent compatibility and explicit migrations. | Legacy fixture load/save/reload tests. |

### Topology requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| TR-01 | Model source separately from canonical complex and visual realization. | Source/canonical/realization fixtures. |
| TR-02 | Canonicalize finite 2D cells with stable IDs and source maps. | Deterministic hash and locate-back tests. |
| TR-03 | Validate attachments, references, incidence, links and eligibility before analysis. | Valid/invalid corpus and property tests. |
| TR-04 | Construct sparse integer d1/d2 and prove `d1 * d2 = 0`. | Matrix fixtures and property tests. |
| TR-05 | Compute H0-H2 over Z2 locally and over Z through the constrained exact backend. | Reference corpus plus Sage differential tests. |
| TR-06 | Show torsion, coefficient field, source mapping, and result status in Algebra view. | Inspector/E2E assertions. |
| TR-07 | Classify surfaces only after defined eligibility gates pass. | Rejection tests for invalid or non-manifold inputs. |
| TR-08 | Handoff a read-only revisioned Mesh snapshot with locate-back references. | Source mesh mutation -> stale result tests. |

### Complex Analysis requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| CR-01 | Treat normalized serializable AST plus assumptions/branch policy as authority. | AST round-trip and parser diagnostics. |
| CR-02 | Preserve current immediate TypeScript visual preview. | Preview regression and interaction latency tests. |
| CR-03 | Keep sampled grids outside React/localStorage and revision-safe. | Artifact lifecycle and memory tests. |
| CR-04 | Distinguish numerical, exact, and certified/qualified outcomes in every result UI. | Result-status UI and schema tests. |
| CR-05 | Use structured AST requests for Sage; disallow raw user Sage/shell execution. | Protocol validation and security tests. |
| CR-06 | Support symbolic derivatives, singularities, residues, Laurent/Taylor series, contours, and argument principle in MVP. | `1/z`, `1/(z^2+1)`, `sin(z)/z`, and `exp(z)` corpus. |
| CR-07 | Persist function, AST, parameters, branch semantics, operation history and result references. | Define -> Analyze -> save -> reopen -> replay. |
| CR-08 | Support qualified adaptive continuation and monodromy before Riemann-surface handoff. | `log`, `sqrt`, cube-root, and algebraic branch fixtures. |
| CR-09 | Keep Riemann-surface meshes related to source function, sheets, seams, branch policy and result revision. | Cross-module provenance/locate-back E2E. |

### Verified current Complex laboratory baseline

The Complex roadmap starts from existing product capability, not a blank module.  The
current implementation has these live laboratory surfaces:

| Laboratory surface | Existing capability that migration must retain | Kernel migration destination |
| --- | --- | --- |
| Function Explorer | Controlled complex expression preview; domain coloring; Z/W, Re, Im, modulus and argument panels; grid deformation; vector fields; contour bands; U/V level curves; Cauchy-Riemann/conformal overlays. | Function/AST source plus revisioned preview artifacts. |
| Path and Residue Lab | Circle, annulus, rectangle, segment, polyline and freehand paths; path mapping; winding, poles, residues, contour diagnostics. | Canonical contour records plus numerical/exact result records. |
| Branch Lab | Branch profiles, branch cuts, selected branch points, sheet preview, loop animation and monodromy display. | Branch-policy records, continuation jobs and qualified monodromy results. |
| Covering Map Lab | Covering examples, fibers, deck transformations and power controls. | Covering-map definition/results related to the same function document. |
| Mobius Lab | Mobius parameters, map/grid/fixed-point/pole views, composition/decomposition and animation. | Mobius transformation object and derived preview/result artifacts. |
| Riemann Sphere | Stereographic/sphere presentation and function-map visualizations. | Sphere view adapter over the canonical function/result state. |
| 3D value-surface and gallery | Sheet-aware value-surface previews and Riemann-surface gallery handoff. | Revisioned mesh artifacts with function/branch/result lineage. |

Most of these settings currently live as local `App.tsx` state.  The migration
preserves the UI and interaction quality while separating durable mathematical intent
from transient layout, animation, hover and drag state.

### Viewer requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| VR-01 | Render committed document state and revision-safe artifacts only. | Late-artifact and source-change visual tests. |
| VR-02 | Separate hover/drag preview from committed selection and history. | Interaction tests and history record counts. |
| VR-03 | Display stale, computing, failed, unavailable, exact and numerical status unambiguously. | Inspector/viewer status tests. |
| VR-04 | Enable locate-back from a visual object/result to source, operation and provenance. | End-to-end cross-panel navigation tests. |
| VR-05 | Remain a projection: no direct mathematical state mutation or backend decision logic. | Dependency checks and adapter tests. |

## Program dependencies

```text
F01-F07
   |
   +--> T01-T13  Topology v1
   |       |
   |       +--> C01-C12  Complex MVP/v1
   |                       |
   +-----------------------+--> K catalogue generalization
                                   |
                                   +--> Scene Script / Geometry / Viewer
                                   +--> resources / Mesh / workers
                                   +--> Surfaces / Volumes / Curves
```

The dependency is intentional.  A Complex Sage result relies on the same F05 job
contract and F06 provenance envelope first proven by Topology.  A Riemann surface
relies on F07 artifact lifecycle, then later contributes a real use case for Mesh
resource invalidation.  Generalization follows evidence from both modules.

## Full preserved commit ledger

This section is intentionally detailed.  It is the program-level source for the
F/T/C commits; no commit has been reduced to a title-only item.  The existing
K01-K51 catalogue remains detailed in its companion plan and is retained unchanged.

### Phase F - minimum kernel seed

#### F01 - `test(platform): freeze topology and complex baseline workflows`

**Scope.** Add a compact, reviewed corpus for current Topology documents, editor
workflows, diagrams, realizations, Complex laboratories, parser diagnostics, and
representative visual/numerical outputs.  Each fixture records its existing behavior
rather than changing it.

**Compatibility boundary.** No production code or persistent format changes.

**Acceptance.** Baseline tests pass unchanged, invalid input is characterized, and
every later F/T/C change names the fixtures it must preserve or deliberately migrate.

#### F02 - `feat(core): add stable document identity revision and structural hash`

**Scope.** Add shared stable IDs, monotonic source revisions, canonical JSON ordering,
and structural hash primitives for source documents.  Define precisely which fields
are mathematical/persistent and which are display-only/transient.

**Compatibility boundary.** Add fields as optional/read-compatible; do not rewrite
existing documents merely because they are opened.

**Acceptance.** Same canonical source yields the same hash across runs; an intended
source change advances revision/hash; view-only state does not affect the hash.

#### F03 - `feat(core): add versioned command envelopes and pure transactions`

**Scope.** Define JSON-only command envelopes, schema version, command ID, origin,
validation, normalized command form, and pure atomic state projection.  Separate
diagnostic metadata from execution inputs and reject normal interactive use of
whole-scene replacement commands.

**Compatibility boundary.** Normalize legacy command envelopes where present; do not
replace existing UI mutation paths yet.

**Acceptance.** Validation completes before projection; failed batches leave input
unchanged; deterministic replay fixtures pass without time/random/UI dependencies.

#### F04 - `feat(kernel): add in-memory document query event and history service`

**Scope.** Implement the small runtime kernel: commit-after-validate transactions,
read-only queries, ordered completed-fact events, subscription cleanup, and bounded
reversible transaction records.  Keep it synchronous and in-memory initially.

**Compatibility boundary.** No React store replacement and no broad viewer migration.

**Acceptance.** Event order is deterministic; failed transactions emit no completed
event/history record; subscribers cannot mutate kernel state; undo/redo tests run
without UI.

#### F05 - `feat(kernel): add revision-safe scientific job contracts`

**Scope.** Add structured job submit/progress/cancel/result/failure contracts,
deadlines, resource limits, source revision/generation guards, and an in-process test
adapter.  Jobs describe semantics, not a specific worker technology.

**Compatibility boundary.** Existing workers may remain behind adapters; no Sage or
native feature is made mandatory for current interactive workflows.

**Acceptance.** Cancellation, timeout, failure, and late result tests show that an
artifact/result cannot publish against a changed source revision.

#### F06 - `feat(core): add provenance and compact analysis-result envelopes`

**Scope.** Define common result status, source ID/revision/hash, operation/algorithm,
parameters, precision/tolerance, engine/version, elapsed time, warnings, diagnostics,
and artifact handles.  Separate durable result summaries from large binary payloads.

**Compatibility boundary.** Existing module result UI remains until adapted; results
without required provenance are displayed as legacy/limited rather than upgraded.

**Acceptance.** Envelopes are serializable and validated; UI-sized records never
contain sampled grids, sparse matrices, or full meshes.

#### F07 - `feat(kernel): add revisioned artifact registry and full invalidation`

**Scope.** Add generic managed artifact handles for grids, matrices, meshes and binary
outputs, including source generation, size/checksum, availability, cache ownership,
and clean/dirty/computing/failed status.  Implement deterministic full invalidation
only; local invalidation remains deferred.

**Compatibility boundary.** Domain algorithms can continue returning their present
data during adapter migration; React/localStorage must not become a second artifact
store for migrated paths.

**Acceptance.** A source revision change stales exactly declared artifacts; missing
artifacts remain explicit `unavailable` references; no large payload enters React
state.

#### F08 - `feat(kernel): add capability-aware scientific execution broker`

**Scope.** Add a transport-neutral broker over F05 job contracts with explicit
backend capability discovery, deterministic routing, cancellation propagation,
typed transport/protocol failures, safe bounded retry/fallback policy, and an
adapter for the in-process scientific-job service.

**Compatibility boundary.** Existing browser, Electron, Python, CGAL, VTK, Sage,
and native worker clients remain unchanged until domain adapter commits opt in.  No
optional backend becomes required and no current operation silently changes engine.

**Acceptance.** Identical capability snapshots select the same backend; unsupported
operations fail before transport; cancellation returns without waiting for an
uncooperative backend; only explicitly idempotent operations retry/fallback; stale
or malformed backend results cannot publish.

### Phase T - Topology v1

#### T01 - `test(topology): add canonical topology regression corpus`

**Scope.** Add point, circle, sphere, torus, cylinder, Mobius band, RP2, Klein bottle,
Moore space, and deliberately invalid complex fixtures, with expected eligibility,
boundary/homology/classification behavior and source-to-view examples.

**Compatibility boundary.** Current teaching presets retain their names and visual
flows; no preset is reclassified before canonicalization exists.

**Acceptance.** Every corpus entry declares whether it is valid, what can be proven,
and which output is merely recognized/illustrative.

#### T02 - `feat(core): introduce versioned TopologyDocument`

**Scope.** Define a UI-independent `TopologyDocument` containing source model, stable
IDs, revision/hash, canonical-complex reference, result references, provenance and
display-realization references.  Add adapters from the current topology format.

**Compatibility boundary.** Legacy topology documents load without silently claiming
formal algebraic or classification results not represented in their source.

**Acceptance.** Document serialization is versioned; older documents load as migrated
or view-only/needs-canonicalization with an actionable diagnostic.

#### T03 - `feat(topology): derive canonical finite 2d complex`

**Scope.** Derive canonical 0-, 1-, and 2-cells, oriented attachment words, stable
cell IDs, source maps and a deterministic complex hash from the editable source.
Canonicalization is a pure replayable operation, independent of the 3D realization.

**Compatibility boundary.** The current diagram/mesh renderer keeps rendering its
existing source/realization data until it consumes the new adapter.

**Acceptance.** Repeated canonicalization of unchanged input produces identical
cells/hash and maps every canonical cell back to diagram tokens or source elements.

#### T04 - `feat(topology): validate canonical complex structure`

**Scope.** Validate references, closed attachment walks, orientation, incidence,
links, boundary candidates and manifold eligibility.  Publish structured diagnostics
with source references and reject invalid inputs from algebraic analysis.

**Compatibility boundary.** Invalid legacy sources remain viewable, but show explicit
limitations rather than best-effort homology.

**Acceptance.** The `d1 * d2 = 0` precondition is verified before analysis and no
invalid complex can submit a formal homology job.

#### T05 - `refactor(topology): route source editing through kernel commands`

**Scope.** Add source-edit, pairing-edit, canonicalize, committed selection and
analysis-request command families.  Migrate one diagram/editor workflow at a time;
keep hover/drag previews transient and issue one commit at interaction completion.

**Compatibility boundary.** Existing editor mutation code remains only as an explicit
adapter until fixtures prove command-path parity.

**Acceptance.** GUI edit, import, undo/redo and replay yield the same canonical
source for migrated workflows; no drag produces a command per pointer event.

#### T06 - `feat(topology): construct exact sparse boundary matrices`

**Scope.** Construct integer sparse `d2` and `d1` matrices with canonical row/column
ordering, orientation signs, cell-to-matrix mappings, and locate-back information for
the Algebra view.

**Compatibility boundary.** Matrix artifacts are stored in F07 rather than React or
the persistent source document.

**Acceptance.** Corpus matrices match expected values, property tests establish
`d1 * d2 = 0`, and selected entries locate back to their cells/source occurrences.

#### T07 - `feat(topology): add local Z2 homology feedback`

**Scope.** Add bounded local finite-field Z2 homology for immediate educational
feedback, with coefficient field shown clearly in result records and UI.

**Compatibility boundary.** Z2 output never substitutes for integer homology or
torsion results.

**Acceptance.** Standard corpus Betti numbers pass; a result always identifies Z2,
source revision, method and limitation.

#### T08 - `feat(topology): add constrained Sage integer-homology job`

**Scope.** Send structured canonical-complex data to an isolated, allowlisted Sage
adapter for integer homology/Smith normal form.  Return free rank, torsion, compact
matrix/artifact references, engine version and diagnostics through F05/F06.

**Compatibility boundary.** No arbitrary Sage source is accepted in normal Topology
workflows; local Z2 feedback remains available when Sage is unavailable.

**Acceptance.** Integer/torsion corpus results, timeout, cancellation, size/output
limit, engine provenance, and stale-publication tests pass.

#### T09 - `feat(topology): publish Algebra view with provenance`

**Scope.** Present matrices, H0-H2, torsion, coefficient field, eligibility,
diagnostics, result status, engine/provenance and source highlighting in the existing
Topology experience.

**Compatibility boundary.** Diagram and Realization stay available; the Algebra view
does not infer formal conclusions from a rendered shape.

**Acceptance.** Every displayed answer identifies source revision/hash and locates
matrix/cycle information back to cells and editable source elements.

#### T10 - `feat(topology): add eligibility-gated surface classification`

**Scope.** Implement connectedness, manifold, orientability, boundary and Euler-
characteristic gates before publishing classification and explanatory reasoning.

**Compatibility boundary.** Existing named teaching presets may remain recognized,
but their labels cannot be upgraded to computed classification without passing gates.

**Acceptance.** Valid examples classify correctly; visually torus-like invalid or
non-manifold inputs are rejected with exact failed prerequisites.

#### T11 - `feat(topology): persist replayable documents and results`

**Scope.** Persist `TopologyDocument`, schema version/migrations, command checkpoints
and logs, canonical hash, compact result/provenance records and artifact references.

**Compatibility boundary.** Cache blobs are not made authoritative; unavailable old
artifacts load as explicit status and re-compute opportunity.

**Acceptance.** Author -> analyze -> save -> reopen -> replay matches structural
hashes and does not fabricate missing artifacts/results.

#### T12 - `feat(topology): add revisioned Mesh snapshot handoff`

**Scope.** Add read-only Mesh -> Topology handoff with source mesh ID/revision,
stable vertex/triangle IDs, canonical simplex mapping and locate-back references.

**Compatibility boundary.** No implicit live coupling: a later Mesh edit never
mutates Topology source/result in place.

**Acceptance.** Mesh mutation marks dependent Topology artifacts/results stale and
the viewer can locate a topology selection back into the originating Mesh snapshot.

#### T13 - `test(topology): close formal Topology v1 migration`

**Scope.** Run unit, property, Sage differential, cancellation, persistence, replay,
E2E and visual-realization suites; remove only topology compatibility paths proved
redundant by the preceding commits.

**Compatibility boundary.** Unmigrated workflows remain supported and listed; no
big-bang removal of editor or realization behavior.

**Acceptance.** Valid inputs deliver exact H0-H2 over Z/Z2 with transparent torsion
and provenance; invalid inputs fail transparently; migrated Topology flows have one
production mutation route.

### Phase C - Complex Analysis MVP/v1

#### C01 - `test(complex): add scientific complex-analysis fixture corpus`

**Scope.** Freeze the actual Function Explorer, Mobius, Riemann Sphere, Residue,
Branch and Covering labs, including domain coloring, grid deformation, vector/level
overlays, contour bands, all path modes, branch-cut profiles, sheet/loop animation,
fibers/deck transformations, and 3D value-surface previews.  Add exact/numerical/
illustrative fixtures for `1/z`, `1/(z^2+1)`, `sin(z)/z`, `exp(z)`, `log(z)`,
`sqrt(z)`, `z^(1/3)` and `sqrt(z^2-1)`.

**Compatibility boundary.** Existing lab entry points, presets and visual workflows
remain available during convergence.

**Acceptance.** Every assertion identifies a mathematical oracle or a numerical
tolerance; no visual snapshot alone becomes a proof oracle.

#### C02 - `feat(core): introduce versioned ComplexAnalysisDocument`

**Scope.** Define function source, normalized AST, parameters, assumptions, domain,
sampling, contours/path records, branch policy, covering and Mobius definitions,
result references, revision/hash and provenance as a versioned serializable document.
Keep panel layout, active inspector tab, animation progress, hover and drag previews
as explicitly transient view state rather than mathematical authority.

**Compatibility boundary.** Existing lab state migrates through adapters; a compiled
JavaScript function or raw text alone is not persisted as mathematical authority.

**Acceptance.** Document save/load round trips all mathematical and branch semantics
and emits a clear migration diagnostic for unsupported legacy state.

#### C03 - `refactor(complex): parse validated serializable expression AST`

**Scope.** Evolve the controlled current parser from compile-only output into parse
-> AST -> validate -> preview-compiler stages.  Preserve grammar limits, line/index
diagnostics and safe evaluation behavior.

**Compatibility boundary.** Do not replace the controlled parser with unrestricted
`eval`, `math.evaluate`, or direct Sage text evaluation.

**Acceptance.** AST serialize/reparse is stable; supported expressions retain preview
values within floating-point tolerance; unsupported syntax has precise diagnostics.

#### C04 - `refactor(complex): route document edits through commands`

**Scope.** Add commands for function definition, parameter/domain changes, contour
and path changes, branch policy, covering settings, Mobius transformations, committed
selection and analysis requests.  Migrate in this order: Function Explorer source/
domain -> Path/Residue -> Branch -> Covering -> Mobius -> Riemann Sphere -> 3D
value-surface handoff.  Each lab remains visible during its adapter migration.

**Compatibility boundary.** Typing/dragging stays local transient preview until an
intentional commit; existing setters remain only behind parity adapters.

**Acceptance.** GUI and imported command edits produce identical canonical documents,
and every committed source change stales prior results by revision.

#### C05 - `feat(complex): bind Function Explorer to revision-safe previews`

**Scope.** Compile safe AST preview evaluators and create low/high-resolution sampled
artifacts through F07 for domain coloring, Z/W grid deformation, Re/Im/modulus/
argument panels, vector and level-curve overlays, Cauchy-Riemann/conformal fields and
path mapping.  Bind 2D/3D views to document revision and artifact handle rather than
owning private sampled-grid caches.

**Compatibility boundary.** The current immediate experience remains; performance
changes must not require Sage, native code, or a blocking React render cycle.

**Acceptance.** Large grids never enter React/localStorage; drag preview is bounded;
late preview artifacts are ignored after source revision changes.

#### C06 - `feat(complex): add numerical result records and inspector`

**Scope.** Preserve current Residue/Path lab behavior while publishing numerical
derivative checks, singularity/pole candidates, contour quadrature, winding,
residue-theorem comparison, branch-cut crossing and near-pole diagnostics through
F06 with error estimates, samples and tolerances.

**Compatibility boundary.** Existing numerical lab values remain visible but become
explicitly labelled when they lack new provenance.

**Acceptance.** Numerical output cannot present as exact proof; inspector shows
method, source revision, status, tolerance/error and artifact availability.

#### C07 - `feat(complex): add constrained Sage Analyze adapter`

**Scope.** Translate allowed normalized AST operations into structured Sage requests
for derivatives, limits, poles, residues and series.  Run it outside the renderer
with F05 cancellation, deadline, CPU/memory/output and filesystem/network policy.

**Compatibility boundary.** Ordinary analysis accepts no arbitrary Sage/Python source;
any future notebook mode is separately trusted and outside this commit.

**Acceptance.** Protocol validation rejects unsupported AST/operation input; no
expression-to-shell path exists; exact result records include engine/version.

#### C08 - `feat(complex): complete exact residue and contour MVP`

**Scope.** Add symbolic derivatives/singularity inspection, exact residues and
Laurent/Taylor series, adaptive contour integration with error estimates and
argument-principle diagnostics.  Integrate these as an Analyze layer over the
existing Function Explorer and Residue/Path Lab, not as replacement screens.

**Compatibility boundary.** Fast TypeScript preview and numerical methods continue as
immediate exploration paths; Analyze does not replace or block them.

**Acceptance.** `1/z`, `1/(z^2+1)`, `sin(z)/z` and `exp(z)` pass JS/Sage differential,
known-value, provenance and end-to-end workflow tests.

#### C09 - `feat(complex): persist replayable complex sessions and exports`

**Scope.** Add `.math3d-complex` serialization, schema migration, command
checkpoints/logs, compact result references and structured Sage/notebook export.

**Compatibility boundary.** Missing external artifacts/engines are represented as
unavailable/needs-compute rather than silently recomputed or replaced.

**Acceptance.** Define -> Explore -> Analyze -> save -> reopen -> replay preserves
source hash, result status, provenance and explicit artifact availability.

#### C10 - `feat(complex): add adaptive branch continuation and monodromy`

**Scope.** Replace only the current preset/profile-specific branch conclusions with
general path lifting, tracked sheet state, adaptive subdivision, loop closure,
discriminant-proximity diagnostics and precision escalation.  Retain existing branch
profiles, cut controls, sheet previews and animations as UI adapters; publish
monodromy permutations only from validated continuation outcomes.

**Compatibility boundary.** Existing preset branch illustrations stay available but
are clearly separated from generalized continuation results.

**Acceptance.** Standard logarithm/square-root/cube-root/algebraic fixtures show
expected qualified branch behavior and report uncertainty rather than guessing.

#### C11 - `feat(complex): hand off Riemann surfaces with lineage`

**Scope.** Upgrade the existing 3D value-surface preview and Riemann-surface gallery
handoff into revisioned sheet-mesh artifacts with seams, gluing metadata and scalar
fields from Complex source/results.  Create explicit Surfaces/Mesh relationships and
viewer locate-back without removing the current preview/gallery experience.

**Compatibility boundary.** Do not export an unlinked mesh as the only representation
of a Riemann surface; downstream modules receive a derived relation plus artifact.

**Acceptance.** A selected surface location can reach function, AST/branch policy,
analysis result, source revision and generation parameters.

#### C12 - `test(complex): close Complex Analysis MVP and v1 migration`

**Scope.** Run parser/property/numerical/Sage differential/cancellation/persistence/
replay/visual/E2E gates over Function Explorer, Path/Residue, Branch, Covering,
Mobius, Riemann Sphere and 3D value-surface workflows.  Remove only proven-redundant
compatibility paths.

**Compatibility boundary.** Unmigrated labs remain reachable until their documented
adapter and parity gate pass.

**Acceptance.** All migrated labs operate as views of one reproducible document with
immediate preview, status-qualified scientific results and one mutation path.

### Phase K - general application-kernel rollout

The detailed **K01-K51** commit descriptions, scopes, compatibility boundaries and
acceptance criteria remain intact in
`docs/application-kernel-scene-script-migration-plan.md`; this roadmap does not
abbreviate, renumber, or supersede them.  Their program placement is:

| Generalization group | Detailed K catalogue focus | Program gate |
| --- | --- | --- |
| G01 | Scene Script command lowering, execution parity, snapshot/operation-log exports. | Scene -> Script -> Scene structural parity. |
| G02 | Geometry and Scene Viewer command adapter, selection, edits, history bridge. | Viewer, Inspector, script and undo agree. |
| G03 | General derived-resource dependency graph and invalidation. | No stale resource presented as current. |
| G04 | First Mesh analysis migration and worker adapter. | Revision/cancellation/provenance conformance. |
| G05 | Geometry construction, Surface->Mesh, Volume and Curve slices. | Per-module replay/provenance/save gates. |
| G06 | Local invalidation where mathematical global-oracle comparison exists. | Benchmark improvement without correctness regression. |
| G07 | Browser/desktop cross-runtime and dependency conformance. | Contract parity on supported runtimes. |
| G08 | Contract freeze and final adapter removal. | One mutation route per completed workflow. |

## Execution and security requirements

### Preview versus Analyze

| Interaction | Permitted execution | Persistence | Expected status |
| --- | --- | --- | --- |
| Typing, hover, drag | Safe TypeScript preview; low-resolution artifact if necessary. | No history record until commit. | Preview/heuristic only. |
| Idle quality preview | Bounded local/worker computation. | Ephemeral artifact tied to source revision. | Numerical preview. |
| Analyze/Verify | Kernel job through structured request. | Persist compact result/provenance after success. | Exact, certified, numerical, or qualified failure. |
| Import/replay | Pure canonicalization/projector plus allowed jobs only when explicitly requested. | Explicit migration/checkpoint decisions. | Replayed/needs-compute/unavailable. |

### Worker and backend rules

- Renderer code never invokes a shell, Node subprocess, Sage evaluator, or native
  library directly.
- Preload exposes narrow typed IPC only; Electron renderer remains sandboxed and
  context-isolated.
- Sage receives an allowlisted structured operation plus normalized AST, limits and
  precision - never arbitrary user source as an ordinary analysis request.
- Each job has deadline, cancellation token, CPU/memory/output limits, source
  revision, and a temporary working directory with minimal permissions.
- Native CGAL/GUDHI/Dionysus processes are isolated from the UI process.  Their
  licensing and platform packaging are audited before a public feature depends on
  them.
- Browser, desktop, WASM and native adapters must obey the same command/result
  contract; a backend difference is reported as capability/status, not hidden.

## Persistence model

```text
Persistent source document
  + schema version
  + stable object IDs/revisions/hash
  + compact command checkpoints/log
  + result references and provenance
  + relationship/lineage records

Managed artifact store
  + sampled grids / sparse matrices / meshes / binary outputs
  + source revision and generation
  + status, size, checksum, availability
  + cache policy; never source-of-truth
```

File compatibility policy:

1. Old documents load through explicit adapters.
2. The application never silently promotes a legacy visual realization to a formal
   Topology classification or a numerical Complex result to exact.
3. A missing or unsupported artifact leaves a valid document with an `unavailable`
   result/artifact status and re-compute option where supported.
4. New schema writers do not overwrite an older file in-place without the user's
   normal save/export decision.

## Test and release gates

### Every commit

- Focused unit tests for the touched contract or algorithm.
- Typecheck and relevant package build.
- No unintended persistent schema change.
- Compatibility-path test while an adapter remains.

### Topology release gate at T13

- Canonicalization determinism and source-map coverage.
- Structural/property tests including `d1*d2=0`.
- Expected Z and Z2 homology fixtures, including torsion.
- Sage differential, timeout/cancellation, stale-publication and size-limit tests.
- Save/load/replay structural hash parity.
- Diagram, Complex, Algebra and Realization E2E workflows.
- Visual regression only as rendering verification, never as mathematical oracle.

### Complex release gate at C12

- Parser/AST determinism, allowed grammar, diagnostics and preview regression.
- Numerical known-function fixtures with stated tolerances.
- Sage differential tests for symbolic derivative, residues and series.
- Job cancellation, error, unsupported capability, and stale-artifact tests.
- Branch/monodromy fixtures and qualified-status assertions.
- Define -> Explore -> Analyze -> save -> reopen -> replay workflow.
- Riemann-surface lineage/locate-back and visual regression checks.

### General kernel release gate at G08

- Scene Script and GUI command equivalence.
- Cross-runtime command, replay, error, cancellation and artifact-state conformance.
- Dependency rule checks: no React/Three/Electron imports below feature adapters.
- Every completed workflow has exactly one production mutation path.

## Performance budgets and operational policies

- Never send a sampled 2048x2048 Complex grid or large sparse matrix through React
  state, localStorage, or repeated structured-clone messages.
- Use transferable binary buffers/artifact handles and revision-keyed caches.
- Continuous interaction uses bounded preview resolution; high-quality or exact work
  is deliberate and cancellable.
- Before expensive topology/TDA-style construction, provide a preflight memory/work
  estimate and reject unsafe jobs with actionable alternatives.
- History stores inverse patches/checkpoints, not unconditional full copies of large
  Meshes or artifacts.
- Local resource invalidation is only enabled after a deterministic full-recompute
  oracle and a benchmark demonstrate correctness and material value.

## Risks and mitigations

| Risk | Mitigation and gate |
| --- | --- |
| Kernel becomes a monolith. | Kernel owns lifecycle contracts only; algorithms stay in domains; dependency checks enforce this. |
| UI suggests a proof it does not have. | Mandatory status/provenance display; eligibility gates; exact/numerical fixtures. |
| Two paths silently diverge during migration. | Test-only equivalence comparisons, compatibility owner, removal commit and E2E parity gate. |
| Sage/native computation blocks or crashes UI. | Isolated jobs, cancellation, budgets, typed RPC, stale-result guards. |
| Arbitrary expression becomes code execution. | Controlled AST grammar and allowlisted operation protocol; no ordinary raw-eval path. |
| Large outputs exhaust memory. | Artifact registry, transferables, limits, previews and admission policy. |
| File format freezes too early. | Versioned schema, migrations, fixture corpus and explicit unavailable state. |
| CGAL/GUDHI licensing or native packaging blocks a feature. | Package-by-package license/packaging audit before public dependency; capability-gated adapter. |
| Scope expands to research work before v1 is sound. | TDA/conformal/general algebraic-surface features remain post-v1. |

## Definition of done

The roadmap is complete only when:

1. Topology and Complex Analysis have canonical versioned documents and one mutation
   route for migrated workflows.
2. Their scientific results are revision-safe, reproducible, status-qualified, and
   explainable through provenance.
3. Their viewers are projections with source/result locate-back rather than separate
   sources of truth.
4. Jobs can be cancelled, constrained, and prevented from publishing stale output.
5. Scene Script and later application modules adopt the proven generic kernel
   services rather than reimplementing them.
6. Existing user workflows and persisted projects remain usable throughout the
   migration or fail with a precise, actionable compatibility diagnostic.

## First action

Begin with **F01**.  It creates the baseline corpus and a measurable definition of
non-regression.  Then complete F02-F07, validate the released Topology T01-T13
behavior against the shared-kernel conformance gate, and do not begin Complex C01
until that gate is green.

## Post-1.5.0 execution checkpoint (2026-09-14)

MATH3D 1.5.0 is released and the module-professionalization program through
Topology v1 is implemented, tested, packaged, and published.  This changes the
starting state assumed by the original delivery order; it does not remove the
remaining shared-kernel requirements.

### Completed foundation

- Mesh Analyze, Geometry, Surfaces, Curves, Volumes, and Topology now have their
  professional v1 workflows in the application.
- The Topology implementation covers the functional intent of **T01-T13**,
  including canonical source state, structural validation, algebraic computation,
  persistence/replay, inspection, and release acceptance coverage.
- Release v1.5.0 provides the frozen product baseline for later kernel conformance
  work across Windows, Linux, desktop, documentation, and web artifacts.

### Remaining architecture gap

- There is not yet a dedicated shared `@math3d/kernel` package with stable document
  identity, revision, structural-hash, transaction, query/event, provenance,
  artifact, and job contracts.
- Existing command envelopes and result lifecycles remain partly module-local.
  They are valuable reference implementations, but are not yet one cross-domain
  mutation and replay path.
- Complex Analysis laboratories exist as strong interactive features, but still
  need the canonical document/result/provenance contracts defined by C01-C12.

### Corrected next sequence

1. Execute **F01** against the released v1.5.0 behavior and fixtures.  Treat the
   release suite as the baseline corpus; add only missing deterministic parity and
   migration fixtures.
2. Execute **F02-F07** to establish the minimal shared kernel seed.  Adapt existing
   Topology behavior to these contracts instead of rebuilding the completed UI or
   algorithms.
3. Run a **Topology conformance gate** that maps the completed T01-T13 behavior to
   the shared document, transaction, artifact, job, provenance, and replay
   contracts.  Any gaps become narrowly scoped compatibility work, not a second
   Topology implementation.
4. Begin **C01-C12** only after that conformance gate is green, preserving the
   current Complex Analysis laboratories while moving persistent source and result
   ownership behind the kernel boundary.
5. Continue with the general application-kernel rollout only after C12, following
   the companion migration plan and its dependency rules.

Therefore the immediate next program commit remains **F01**, but the old instruction
to re-execute T01-T13 literally is superseded by conformance and adapter work over
the already released Topology implementation.

### F01 execution plan

**Status:** complete

F01 is one test-and-fixture-only commit.  It freezes the released behavior without
changing production code, mathematical algorithms, persistent schemas, or UI
workflows.

1. Add a reviewed `platform-v1.5.0` manifest.  Every scenario records its owner,
   compatibility purpose, oracle class (`exact`, `numerical`, or `illustrative`),
   and numerical tolerance where applicable.
2. Add compact Topology expectations for canonical preset results, exact Z and Z2
   homology, classification eligibility, realization authority, legacy-v1
   migration, verified-v2 loading, stale-cache recomputation, and invalid-document
   rejection.  Reuse the existing formal release corpus rather than duplicating its
   algorithms or full output payloads.
3. Add Complex Analysis expectations for expression parsing/evaluation, invalid
   diagnostics, Mobius maps and poles, Riemann-sphere projection, branch sheets,
   and representative complex-map output.
4. Add one deterministic desktop workflow covering Topology preset/editor views and
   all current Complex laboratories: Function Explorer, Mobius, Riemann Sphere,
   Residue, Branch, Covering, and the 3D complex-map handoff.
5. Publish a baseline inventory that identifies deliberately transient state and
   prohibits pixels, animation phase, timestamps, and renderer layout from acting
   as mathematical oracles.
6. Gate the commit with focused unit tests, the new desktop baseline test,
   `typecheck:noemit`, and the renderer build.  Later F/T/C commits must name any
   baseline fixture they intentionally migrate.

**F01 acceptance:** the baseline is deterministic across repeated runs; invalid
inputs are characterized; scientific assertions have explicit authority and
tolerance; and the commit contains no production-code or persistent-format change.

**Completed verification:** 67 focused unit assertions, two desktop workflow
scenarios, `typecheck:noemit`, and the renderer production build pass.  The frozen
inventory and fixture policy are documented in
`docs/testing/platform-v1.5.0-baseline.md`.

### F02 execution plan

**Status:** complete

F02 is a shared-core contract commit with no module migration or UI change.

1. Add strict canonical JSON serialization and SHA-256 structural fingerprints,
   independent of object insertion order, clock, randomness, renderer, and process.
2. Add deterministic stable IDs plus immutable identity records carrying schema
   version, positive monotonic source revision, and current structural hash.
3. Add an explicit, exhaustive field-authority policy separating mathematical
   structure, persistent metadata, persistent display state, and transient display
   state.  Unclassified fields fail closed.
4. Classify the current shared `SceneDocument`; make its identity optional and
   validate it when present, without changing the scene-project format version.
5. Document compatibility rules and prove deterministic hashes, source-change
   revision advancement, view-state isolation, invalid-value rejection, and legacy
   read behavior in focused tests.

**F02 acceptance:** equal canonical sources hash identically across runs; a
structural edit advances both revision and hash; metadata/display-only edits do not
change the structural hash; and opening a legacy document neither rewrites it nor
adds identity metadata.

**Completed verification:** seven focused identity/hash tests plus the existing
scene-serialization and F01 Topology/Complex baseline suites pass (50 tests total),
along with `typecheck:noemit` and the renderer production build.  F03 is the next
program commit.

### F03 execution plan

**Status:** complete

F03 is a shared-core contract commit.  It establishes deterministic command and
projection semantics without introducing the runtime kernel service or migrating any
current UI mutation path.

1. Replace the unversioned command-log record with a strict schema-v1 envelope
   carrying a stable command ID, explicit origin, normalized `{ type, payload }`
   command input, and separately stored diagnostic metadata.
2. Require canonical JSON for envelopes, payloads, normalized validator output, and
   transaction state.  Reject unknown envelope fields and unsupported schema
   versions so execution inputs cannot depend on functions, clocks, random values,
   browser state, or class instances.
3. Normalize the legacy `{ id, timestamp, actor, command }` scene-log shape during
   reads.  Preserve its timestamp as diagnostic metadata and mark its origin as
   legacy; do not rewrite a file until the user's normal save/export action.
4. Add a registry-driven pure transaction projector that validates the complete
   batch before projection, works against an immutable clone, preserves command
   order, and returns no candidate state on failure.
5. Reserve `scene.replace` for controlled import, migration, and replay.  Reject it
   in ordinary interactive transactions while leaving all current UI mutation paths
   unchanged.
6. Prove legacy normalization, metadata/input separation, validation-before-project,
   atomic rollback, immutable input, replacement policy, and deterministic replay in
   focused shared-core tests.  Re-run the scene-document compatibility suite, F01
   platform baseline, `typecheck:noemit`, and the renderer production build.  Publish
   the contract and F04 boundary in `docs/kernel-command-transactions.md`.

**F03 acceptance:** invalid batches invoke no projector; projection failures cannot
mutate the caller's input; repeated replay produces byte-identical canonical state;
legacy logs load as normalized v1 envelopes; and no React, Three.js, Electron, clock,
or randomness dependency enters shared core.

**Completed verification:** eight focused command-envelope/transaction assertions
plus the F02 identity, scene/topology document compatibility, and F01
Topology/Complex platform-baseline suites pass (49 tests total), along with
`typecheck:noemit` and the renderer production build.  F04 is the next program
commit.

### F04 execution plan

**Status:** complete

F04 is the first dedicated `@math3d/kernel` runtime commit.  It composes the pure F03
projector into a synchronous in-memory ownership boundary without migrating any
existing React store or viewer workflow.

1. Create the private workspace package `@math3d/kernel`, depending only on
   `@math3d/core`, and expose a generic in-memory document kernel with no React,
   Three.js, Electron, browser-global, worker, clock, or randomness dependency.
2. Accept deterministic transaction IDs, ordered versioned command batches, an
   execution mode, and an explicit history policy.  Project and validate completely
   before committing candidate state.
3. Expose state only through synchronous read-only queries over recursively frozen
   snapshots.  Clone and freeze query results so neither callers nor subscribers can
   acquire mutable kernel-owned state.
4. Publish immutable, monotonically sequenced completed-fact events only after state
   and history commit.  Deliver listeners in subscription order, isolate listener
   failures, define snapshot semantics for subscription changes, and return an
   idempotent cleanup function.
5. Record bounded reversible history as normalized forward and inverse command
   batches rather than unconditional document copies.  Validate the inverse batch
   before commit; implement synchronous undo/redo, clear redo on a new commit, and
   clear both stacks for an explicitly irreversible commit.
6. Reject re-entrant mutations during read-only query evaluation and completed-event
   delivery so nested selectors/listeners cannot mutate through a side channel or
   make event order ambiguous.  Failed commit, undo, or redo operations leave state,
   history, event sequence, and subscriber observations unchanged.
7. Prove commit visibility, event/listener ordering, immutable queries/events,
   cleanup, failure atomicity, bounded history, undo/redo, irreversible policy, and
   re-entrancy behavior in UI-free tests.  Re-run F01-F03 compatibility tests,
   `typecheck:noemit`, and the renderer production build, and document the F05
   boundary in `docs/kernel-runtime-service.md`.

**F04 acceptance:** successful commits become visible before their completed event;
failed operations emit nothing and record no history; listeners cannot mutate event
or document state; event sequence and delivery order are deterministic; cleanup is
idempotent; and bounded heterogeneous command history can undo and redo without UI.

**Completed verification:** nine focused kernel-service assertions plus the eight F03
command assertions, F02 identity, scene/topology document compatibility, and F01
Topology/Complex platform-baseline suites pass (58 tests total), along with
`typecheck:noemit` and the renderer production build.  F05 is the next program
commit.

### F05 execution plan

**Status:** complete

F05 adds the first controlled scientific-job lifecycle to shared core and kernel.  It
defines execution semantics and safety guards without migrating an existing worker or
making Sage/native capabilities mandatory.

1. Add strict schema-v1 JSON contracts for scientific source generations, operation
   requests, deadlines/resource limits, progress, success, failure, and ordered job
   lifecycle events.  Keep operation payloads semantic and adapter-neutral.
2. Bind every request and successful result to stable document ID, positive source
   revision, structural hash, and positive artifact generation.  Provide one exact
   source-generation comparison used at admission, progress checkpoints, and result
   publication.
3. Add an asynchronous in-process kernel service with an allowlisted operation-to-
   adapter registry, caller-owned deterministic job IDs, injected source resolver,
   and injectable clock/timer runtime for deterministic tests.
4. Enforce hard deadlines and explicit cancellation independently of adapter
   completion.  Give cooperative adapters checkpoint/progress methods while ignoring
   any output that arrives after cancellation or timeout.
5. Enforce canonical input/output byte ceilings and cooperative work/memory budgets.
   Invalid requests, unsupported operations, adapter exceptions, and each limit
   failure return a structured qualified failure rather than publishing a result.
6. Emit immutable submitted/progress/completed/failure facts in deterministic order.
   Isolate diagnostic listener failures and ensure only a matching current source
   generation can produce the completed event and successful result.
7. Prove validation, success/progress ordering, cancellation, hard timeout, adapter
   failure, input/output/work/memory limits, listener isolation, and stale late-result
   rejection in UI/worker-free tests.  Re-run F01-F04 compatibility suites,
   `typecheck:noemit`, and the renderer production build; document the F06 boundary
   in `docs/kernel-scientific-jobs.md`.

**F05 acceptance:** cancellation and deadline completion do not wait for an
uncooperative adapter; every terminal path is structured and emits at most one
terminal fact; progress and output remain within declared limits; and a result cannot
complete or publish after its source revision, structural hash, or generation changes.

**Completed verification:** nine focused scientific-job assertions plus the F01-F04
identity, command, transaction, kernel, scene/topology compatibility, and
Topology/Complex platform-baseline suites pass (67 tests total), along with
`typecheck:noemit` and the renderer production build.  F06 is the next program
commit.

### F06 execution plan

**Status:** complete

F06 introduces the shared durable analysis-result boundary used after an F05 job
finishes.  It standardizes provenance and epistemic status while keeping large
scientific artifacts out of document-facing and UI-facing records.  Existing module
result stores remain compatibility consumers and are not migrated in this commit.

1. Add a strict schema-v1 analysis-result envelope with caller-owned result IDs and
   the common statuses exact, certified, numerical, recognized, heuristic,
   unsupported, failed, and cancelled.
2. Require exact source document ID, revision, structural hash, and generation plus
   operation type, algorithm/version, canonical parameters, precision/tolerance,
   engine/version, and non-negative elapsed time as durable provenance.
3. Represent warnings and structured diagnostics consistently, and represent grids,
   sparse matrices, meshes, binary data, and other large outputs only with opaque
   typed artifact handles.  Artifact storage and availability remain the F07
   registry's responsibility.
4. Enforce canonical serialization, exact fields, bounded summary/parameter/record
   sizes, bounded JSON complexity, and explicit rejection of embedded scientific
   payload fields so result envelopes remain safe for UI and document histories.
5. Add an F05 publication bridge that accepts only a successful scientific-job
   result for the still-current source generation and never copies its raw output
   implicitly into the durable result summary.
6. Classify pre-F06 unversioned results as legacy/limited without inventing missing
   provenance or scientific certainty.  Malformed versioned envelopes remain
   validation failures rather than silently becoming legacy records.
7. Prove status/provenance validation, immutable deterministic normalization,
   numerical metadata rules, compactness limits, artifact handles, stale job-result
   rejection, and legacy classification in UI-free tests.  Re-run the F01-F05
   compatibility suites, `typecheck:noemit`, and the renderer production build.

**F06 acceptance:** every versioned result is serializable, immutable, source-bound,
and explicit about method and epistemic status; no accepted result embeds sampled
grids, sparse matrices, full meshes, typed buffers, or oversized JSON; successful
F05 output can publish only against its matching current source; and unprovenanced
legacy records remain visibly limited.

**Completed verification:** ten focused compact-result/provenance assertions plus the
F01-F05 identity, command, transaction, kernel, scientific-job, scene/topology
compatibility, and Topology/Complex platform-baseline suites pass (77 tests total),
along with `typecheck:noemit` and the renderer production build.  F07 is the next
program commit.

### F07 execution plan

**Status:** complete

F07 adds the single kernel-owned cache boundary behind F06 artifact handles.  It
stores encoded artifact bytes outside document and React state, exposes compact
immutable metadata, and implements deterministic whole-source invalidation without
attempting dependency-local invalidation or migrating current domain stores.

1. Add revisioned managed-artifact metadata carrying the F06 handle, exact source
   document/revision/hash/generation, byte length, SHA-256 checksum, encoding, cache
   owner, availability, and clean/dirty/computing/failed lifecycle status.
2. Add a synchronous in-memory artifact registry with strict IDs and ownership,
   configurable per-artifact size limits, detached byte storage, immutable metadata
   snapshots, and explicit resolution results for available, missing, stale, dirty,
   computing, and failed artifacts.
3. Guard declare, computation, failure, and publication operations against the
   registry's current-source resolver.  Verify publication size and checksum from
   registry-owned bytes; never trust caller-provided size/checksum metadata.
4. Implement deterministic full invalidation by current document source.  In one
   operation, clear bytes and mark every non-current declared artifact for that
   document dirty/unavailable, while leaving current-generation and other-document
   artifacts untouched.  Keep local dependency invalidation deferred.
5. Enforce one cache owner per artifact ID, owner-authorized replacement/removal,
   deterministic owner cleanup, and idempotent repeated cleanup/invalidation.
6. Emit ordered immutable metadata-only lifecycle facts for declaration, computing,
   publication, failure, invalidation, and removal.  Listener failures and payload
   mutation attempts must not affect registry state or later listeners.
7. Prove byte isolation, checksum/size verification, source guards, explicit missing
   references, all lifecycle states, exact full invalidation, ownership/cleanup,
   event ordering, and metadata compactness in UI-free tests.  Re-run F01-F06
   compatibility suites, `typecheck:noemit`, and the renderer production build.

**F07 acceptance:** a source revision/hash/generation change makes exactly that
document's non-current declared artifacts dirty and unavailable; stale or missing
handles never resolve bytes; registry metadata and events contain no artifact
payload; owners cannot mutate or remove each other's entries; and no large payload
enters React or document state.

**Completed verification:** ten focused registry/checksum assertions plus the F01-F06
identity, command, transaction, kernel, scientific-job, result-envelope,
scene/topology compatibility, and Topology/Complex platform-baseline suites pass (87
tests total), along with `typecheck:noemit` and the renderer production build.  F08
is the next program commit.

### F08 execution plan

**Status:** complete

F08 introduces routing and transport policy without replacing F05 lifecycle safety
or migrating a domain worker.  Backends expose declarative capabilities; the broker
selects and audits execution while F05 requests/results remain the semantic wire
contract.

1. Define immutable capability snapshots for backend ID/version, transport kind,
   priority, availability, cancellation support, operation limits, and explicit
   `never` or `idempotent` retry safety.  Discovery failure produces an inspectable
   unavailable snapshot rather than an exception escaping routing.
2. Add a broker with strict backend configuration, deterministic priority/ID route
   ordering, optional caller preferences, and explicit fallback control.  Reject an
   unsupported operation or insufficient backend limit before invoking transport.
3. Add typed transport errors for unavailable, failed, and protocol-invalid paths.
   Validate every returned F05 outcome against job ID, operation, source generation,
   canonical output, and reported byte length before accepting publication.
4. Propagate cancellation to the active backend and race broker completion so an
   uncooperative transport cannot delay the caller.  Apply the request's absolute
   deadline across discovery, retries, and fallback attempts.
5. Retry transient transport failures only for capabilities explicitly marked
   idempotent, with a configured finite per-backend attempt count.  Never retry
   scientific failures, protocol errors, cancelled/deadline jobs, or operations
   marked `never`; record all attempts and fallback decisions as compact metadata.
6. Provide an in-process backend adapter over the existing F05 service as the local
   deterministic fallback.  Do not make it mandatory when a caller configures only
   worker or remote backends.
7. Prove discovery, deterministic routing, preference/fallback, limit filtering,
   typed failures, safe retry rules, prompt cancellation/deadline, malformed/stale
   result rejection, and in-process compatibility in UI-free tests.  Re-run F01-F07
   compatibility suites, `typecheck:noemit`, and the renderer production build.

**F08 acceptance:** routing is deterministic and capability-driven; unsupported or
oversized jobs never reach transport; cancellation/deadline completion does not wait
for a backend; retries and fallback occur only for explicitly idempotent operations
after transient transport failures; accepted results match the exact F05 request and
current source; and no existing UI or worker route changes until it opts in.

**Completed verification:** eleven focused broker assertions plus the F01-F07
identity, command, transaction, kernel, scientific-job, result-envelope, artifact-
registry, scene/topology compatibility, and Topology/Complex platform-baseline suites
pass (98 tests total), along with `typecheck:noemit` and the renderer production
build.  The foundation phase is complete; T01 is the next program commit.

### T01 execution plan

**Status:** complete

T01 freezes a reviewed canonical Topology corpus before the versioned document and
canonicalization migrations begin.  It adds fixtures, fixture-policy documentation,
and regression tests only; released algorithms, presets, persistence, rendering, and
UI behavior remain unchanged.

1. Add one schema-v1 corpus containing point, circle, independently authored sphere,
   torus, cylinder, Möbius band, RP², Klein bottle, Moore `M(Z/3,1)`, and a deliberately
   invalid finite complex.  Use existing preset IDs where compatibility is the
   subject and explicit CW sources where an independent formal fixture is clearer.
2. Give every entry explicit validity and cellular-algebra eligibility, canonical
   cell counts, exact boundary matrices when available, integral and mod-2 homology,
   torsion, classification eligibility/label, and required diagnostic codes.
3. Attach an authority to every expected claim: exact for incidence/boundary/homology,
   certified-within-model for surface eligibility/classification, unsupported where
   invalid prerequisites block analysis, and illustrative for 3D realizations.
4. Add source-to-canonical-view examples that identify a source cell, its expected
   canonical cell, and the exact source reference.  For applicable teaching presets,
   also identify one current realization by stable suffix while declaring it
   illustrative rather than a mathematical oracle.
5. Validate the corpus schema and inventory independently of the algorithms: IDs are
   unique, the required ten cases occur exactly once, sources are well formed, and
   no fixture uses numerical/pixel/timestamp/animation/layout output as an oracle.
6. Replay each valid fixture twice and prove deterministic canonical hash, exact
   mapping, boundary, chain condition, homology, algebraic consistency, and stated
   classification authority.  Prove the invalid fixture yields focused structural
   diagnostics and withholds boundary, homology, and classification results.
7. Re-run the F01-F08 compatibility suites, all existing Topology core tests,
   `typecheck:noemit`, and the renderer production build.  Document which fixture
   facts T02 and later commits must intentionally migrate if they change.

**T01 acceptance:** all ten required spaces have explicit validity, eligibility,
authority, boundary/homology/classification expectations, and source-to-view
mapping; repeated runs are deterministic; the invalid source cannot acquire formal
algebraic output; illustrative realization data is never treated as proof; and no
production or persistent-format code changes in this commit.

**Completed verification:** thirteen focused corpus/schema/invalidity assertions plus
the F01-F08 compatibility and all existing Topology core suites pass (162 tests
across 21 files), along with `typecheck:noemit` and the renderer production build.
Only fixture, test, and documentation files change.  T02 is the next program commit.

### T02 execution plan

**Status:** complete

T02 adds the first shared, UI-independent Topology document without replacing the
released renderer format.  The new document stores authoritative source plus compact
references; current v1/v2 files are adapted in memory and remain saved by their
existing path until a later explicit cutover.

1. Add a strict schema-v1 `TopologyDocument` to shared core with stable document
   identity, positive revision and SHA-256 structural hash, typed authoritative
   source kind/ID/model, and no renderer, worker, clock, or module-store dependency.
2. Add revision/generation-bound references for the canonical complex, analysis
   results, and display realizations.  Keep canonical cells, matrices, result values,
   meshes, sampled geometry, and animation state out of the shared document.
3. Mark every display realization `illustrative`; represent current-format embedded
   canonical/display caches as `legacy-embedded`; represent pre-F06 result entries as
   `legacy-limited` without copying or upgrading their scientific status.
4. Add strict normalization plus canonical serialization/deserialization.  Reject
   unknown fields, invalid IDs/source guards, duplicate references, source-hash
   mismatch, non-illustrative displays, unsupported versions, and non-JSON data.
5. Add a renderer-side compatibility adapter for released topology v1 and v2 files.
   Deterministically derive stable identity from the authoritative source; classify
   verified v2 as migrated, v1 and stale v2 as needs-canonicalization, and malformed
   or unsupported inputs as view-only with an actionable diagnostic.
6. Preserve source data and compact illustrative display references only.  Never
   trust a v1 cache, never publish stale v2 derived references, never invoke a new
   save/export path, and leave existing `migrateTopologyDocument` behavior unchanged.
7. Prove deterministic IDs/hashes, round-trip serialization, immutable references,
   strict validation, verified/stale/v1/view-only adaptation, legacy-result limits,
   payload exclusion, and T01 corpus source compatibility.  Re-run F01-T01 and
   Topology document/core suites, `typecheck:noemit`, and the renderer build.

**T02 acceptance:** the shared document round-trips as strict schema-v1 canonical
JSON; source edits change its structural identity; every derived reference is bound
to the exact source revision/hash/generation; legacy results remain limited; older or
stale files produce an actionable migrated/view-only/needs-canonicalization outcome;
and current UI/save workflows are unchanged.

**Completed verification:** ten focused shared-document and compatibility-adapter
assertions pass, including strict validation, deterministic round trips, verified,
stale, v1, and view-only outcomes, payload exclusion, and all T01 corpus sources.
All existing Topology suites pass (124 tests across 21 files), the F01-T01
foundation/compatibility matrix passes (103 tests across 13 files), and
`typecheck:noemit` plus the renderer production build succeed.  The released UI and
save/export path remain unchanged; T03 is the next program commit.

### T03 execution plan

**Status:** complete

T03 introduces a deterministic finite-2D canonical artifact and pure source-to-cell
derivation.  It does not certify topology, compute algebra, replace the current
renderer, or publish artifacts into a document; those responsibilities remain with
T04-T06 and the later command migration.

1. Add a strict schema-v1 `CanonicalFinite2DComplex` to shared core with stable
   complex/cell IDs, canonical 0-, 1-, and 2-cell ordering, oriented face attachment
   words, and immutable source references on every cell and boundary occurrence.
2. Bind every canonicalization result to the exact T02 document ID, revision,
   structural hash, and generation.  Compute the canonical artifact hash with the
   shared SHA-256 canonical-JSON primitive and include no clock, worker, renderer,
   realization, analysis, or transient state.
3. Implement pure shared canonicalizers for explicitly authored finite CW sources
   and simplicial sources.  Preserve declared incidence, orientation, and dangling
   references for T04 to validate instead of silently repairing or certifying them.
4. Add deterministic source-map queries in both directions: canonical cell to source
   elements and source element to canonical cells.  Require every canonical cell to
   have at least one dimension-correct source reference.
5. Add a renderer-side fundamental-diagram adapter that uses the released quotient
   derivation, copies only its finite cells and source maps into the shared artifact,
   and derives boundary-occurrence references from diagram tokens.  Never read a 3D
   realization or change the released quotient/rendering path.
6. Return explicit unsupported/invalid-source outcomes for source kinds not yet in
   scope or malformed source models.  Mesh/Geometry snapshot canonicalization remains
   on its existing path until the revisioned handoff work later in Phase T.
7. Prove deterministic replay/hash, reorder-normalized explicit complexes, oriented
   words, exact source/generation binding, two-way source maps, invalid-fixture
   preservation without certification, renderer-realization independence, and all
   T01 corpus mappings.  Re-run the F01-T02 compatibility suites, all Topology tests,
   `typecheck:noemit`, and the renderer production build.

**T03 acceptance:** unchanged input produces byte-identical canonical cells and hash;
every canonical cell and attachment occurrence locates back to its authoritative
source; CW, simplicial, and current fundamental-diagram inputs retain declared
orientation; unsupported inputs fail explicitly; no output claims structural or
algebraic validity; and current UI, renderer, and save workflows remain unchanged.

**Completed verification:** nine focused canonical-complex and fundamental-diagram
adapter assertions pass, covering deterministic/reorder-normalized replay, SHA-256
artifact hashes, exact source-generation binding, oriented CW and simplicial words,
two-way locate-back maps, invalid-source preservation without certification,
realization independence, released quotient parity, and all ten T01 corpus entries.
All Topology suites pass (128 tests across 22 files), the F01-T03 foundation and
compatibility matrix passes (113 tests across 15 files), and `typecheck:noemit` plus
the renderer production build succeed.  Current UI/render/save behavior is unchanged;
T04 is the next program commit.

### T04 execution plan

**Status:** complete

T04 validates the shared T03 canonical artifact against its exact T02 source
generation.  It adds a reusable prerequisite/gating layer without changing the
released renderer, persistence path, or existing Topology analysis implementation.

1. Add a pure versioned shared-core validator that accepts only a normalized T03
   canonicalization result plus its matching T02 `TopologyDocument`.
2. Verify document ID/revision/hash/source guards and authoritative source mappings;
   preserve canonical-cell and source-reference context on every focused diagnostic.
3. Validate edge endpoints, oriented closed face walks, attachment incidence,
   connected components, edge multiplicities, boundary candidates, and vertex-link
   multigraphs without consulting a mesh or R³ realization.
4. Evaluate the exact integer `d1*d2 = 0` precondition directly from incidence.
   Report nonzero vertex/face coefficients, while leaving canonical sparse matrix
   artifacts and locate-back tables to T06.
5. Publish separate cellular-algebra, formal-homology-job, and supported-surface
   eligibility decisions.  Add one gate that revalidates before returning a formal
   homology authorization bound to the exact source generation and canonical hash.
6. Keep malformed, stale, and invalid sources inspectable through immutable
   structured diagnostics but fail closed for formal algebra.
7. Prove all ten T01 cases, invalid source references, non-closed attachment walks,
   nonzero chain composition, stale generation rejection, malformed-artifact
   rejection, deterministic replay, and immutable reports.  Re-run the F01-T03 and
   Topology compatibility suites, `typecheck:noemit`, and the renderer build.

**T04 acceptance:** `d1*d2 = 0` is verified before any formal-homology authorization;
invalid, stale, or malformed canonical complexes cannot pass the submission gate;
diagnostics locate back to canonical/source cells; surface eligibility is distinct
from general cellular-algebra eligibility; and existing UI/save/render behavior is
unchanged.

**Completed verification:** five focused T04 assertions cover the full ten-case T01
corpus, locate-back diagnostics, non-closed walks/nonzero chain composition, stale
source generations, malformed artifacts, deterministic replay, immutability, and
the formal-job gate.  The shared-core/kernel/Topology suites pass (207 tests across
32 files), the additional F01 platform/Complex baseline passes (19 tests across two
files), and `typecheck:noemit` plus the renderer production build succeed.  T05 is
the next program commit.

### T05 execution plan

**Status:** complete

T05 establishes the first production Topology mutation route through the F03/F04
kernel.  It migrates the fundamental-diagram editor incrementally and keeps the
released editor helpers, file format, quotient builder, and realization renderer as
explicit compatibility adapters.

1. Add shared, strict command definitions for authoritative source replacement,
   edge-pairing edits, canonicalization requests, committed canonical-cell
   selection, and analysis requests.
2. Project every structural source edit into the T02 document: advance revision and
   structural hash exactly once, clear transient committed selection/request state,
   and invalidate canonical, result, and display-realization references.
3. Bind canonicalization and analysis intents to the exact source revision/hash;
   validate payloads before projection so mixed invalid batches remain atomic.
4. Add a renderer compatibility bridge backed by the F04 in-memory kernel.  Current
   editor functions continue to build candidate diagrams, while the bridge owns
   committed source transactions and kernel undo/redo replay.
5. Route completed add/remove/rename/attachment/JSON edits through one reversible
   command.  Route file loads through controlled import commands and preserve the
   released format/migration adapters.
6. Keep vertex drag and hover state outside the kernel.  Preview every pointer move
   locally, then commit only the final diagram on pointer release.
7. Prove legacy-editor parity, canonicalization parity, import, undo/redo, replay,
   source invalidation, request provenance, atomic rejection, and the one-command
   drag invariant.  Re-run Topology, typecheck, and production-build gates.

**T05 acceptance:** migrated GUI edits and imports produce the same authoritative
diagram and canonical complex as the compatibility path; undo/redo uses kernel
replay for migrated transactions; source requests are revision/hash bound; invalid
batches change nothing; and twenty pointer previews produce zero commands followed
by exactly one completed transaction.

**Completed verification:** focused command and editor-bridge assertions cover all
five command families, revision/invalidation behavior, atomic rejection, canonical
parity, import, undo/redo, and transient drag previews.  The migration boundary and
remaining adapters are recorded in `docs/topology-kernel-command-migration.md`.
All Topology unit suites pass (133 tests across 23 files), both semantic-safety E2E
checks pass, and `typecheck:noemit` plus the renderer production build succeed.  T06
remains complete; T07 is the next sequential Topology feature.

### T06 execution plan

**Status:** complete

T06 adds the exact shared sparse-matrix artifact over T03/T04.  It was intentionally
implemented independently of the T05 editor-command migration and does not replace
the current renderer-side matrix or Algebra result path.

1. Define a versioned, canonical-JSON sparse boundary artifact carrying exact source
   generation, canonical hash, T04 validator version, and T06 algorithm version.
2. Use canonical cell array order as the `C0`, `C1`, and `C2` bases.  Construct `d1`
   with target-minus-source endpoint signs and `d2` by summing oriented face
   occurrences, using `bigint` arithmetic and decimal-string COO coefficients.
3. Retain atomic incidence contributions separately from nonzero entries so an
   Algebra selection can explain cancellations and locate every row, column, and
   contributing boundary occurrence back to canonical/source cells.
4. Re-run T04 validation before construction and independently multiply the sparse
   matrices.  Publish only when exact `d1*d2 = 0`; invalid/stale/malformed inputs
   return explicit limitations and cannot create an artifact.
5. Add strict deterministic encode/decode normalization for detached artifact bytes,
   including basis dimensions, coordinate bounds/order, coefficient syntax,
   contribution aggregation, composable shapes, and chain condition.
6. Add a Topology/F07 adapter that publishes bytes directly to the artifact registry
   and returns only compact metadata, summary, and a sparse-matrix handle.  Store no
   matrix or bytes in the T02 document or React state.
7. Match all T01 exact matrices, add chain-composition and locate-back properties,
   cover cancelling loop contributions, malformed payload rejection, registry
   resolution/invalidation, deterministic replay, and invalid-fixture withholding.
   Re-run shared core/kernel/Topology suites, F01 compatibility tests,
   `typecheck:noemit`, and the renderer production build.

**T06 acceptance:** every eligible T01 matrix matches its reviewed exact value;
`d1*d2 = 0` holds under independent sparse multiplication; selected coordinates map
to canonical cells and source occurrences; invalid inputs publish nothing; matrix
bytes live only in F07 behind a compact handle; and current UI/save behavior remains
unchanged.

**Completed verification:** seven focused T06 assertions cover all ten T01 matrices,
independent exact sparse composition, canonical ordering/encoding, selected and
cancelling coordinate provenance, strict artifact decoding, F07 publication,
resolution/full invalidation, and invalid-input non-publication.  Shared
core/kernel/Topology suites pass (214 tests across 33 files), the additional F01
platform/Complex baseline passes (19 tests across two files), and
`typecheck:noemit` plus the renderer production build succeed.  With T05 now
complete, T07 is the next algebra feature.

### T07 execution plan

**Status:** complete

T07 adds immediate exact finite-field feedback on top of the shared T03-T06 path.
It does not reuse the released renderer homology cache as authority and does not
claim integral groups or torsion.

1. Add a shared-core sparse column-reduction engine over the field with two
   elements.  Consume only a normalized T06 boundary artifact whose exact chain
   condition already passed T04/T06.
2. Compute `rank(d1)` and `rank(d2)` independently modulo two, then derive
   `beta0 = dim(C0)-rank(d1)`, `beta1 = dim(C1)-rank(d1)-rank(d2)`, and
   `beta2 = dim(C2)-rank(d2)`.
3. Publish a compact F06 `AnalysisResultEnvelope` with explicit coefficient field
   `Z/2Z`, exact authority, chain dimensions, ranks, Betti dimensions, group
   notation, algorithm/engine provenance, and the T06 matrix artifact handle.
4. Bind publication to the exact current document ID, revision, structural hash,
   and generation.  Withhold stale artifacts and fail closed for malformed payloads
   or a handle that is not the T06 cellular-boundary artifact.
5. Bound cells, sparse nonzero entries, and reduction steps.  Return an explicit
   unsupported result with no partial Betti numbers whenever a reviewed local limit
   is exceeded.
6. Add renderer glue that executes T03 -> T04/T06 -> T07 for the current
   fundamental-diagram command document.  Show a clearly labeled local finite-field
   feedback card in Algebra without replacing the existing integral analysis view.
7. Verify the entire T01 corpus, deterministic replay, Euler-Poincare identity,
   odd/even torsion examples, strict result envelopes, artifact/source provenance,
   local limits, malformed inputs, stale generations, UI labeling, typecheck, and
   production build.

**T07 acceptance:** every eligible T01 fixture reports its reviewed `Z/2Z` Betti
dimensions; every result identifies `Z/2Z`, source revision/hash/generation, method,
limits, and the integral/torsion limitation; stale, malformed, invalid, or oversized
inputs publish no partial answer; and the Algebra UI never presents this local result
as integer homology.

**Completed verification:** focused T07 assertions cover all ten T01 entries,
deterministic replay, field-sensitive Moore/RP2 examples, Euler-Poincare equality,
strict F06 envelopes, T06 artifact references, stale/malformed/wrong-handle failure,
and cell/nonzero/work limits.  The implementation boundary is documented in
`docs/topology-local-z2-homology.md`.  All Topology suites pass (133 tests across 23
files), the focused T06/T07 shared-core suites pass (12 tests across two files), both
semantic-safety E2E checks pass, and `typecheck:noemit` plus the renderer production
build succeed.  T08 is the next sequential Topology commit.

### T08 execution plan

**Status:** complete

T08 adds the first exact external algebra path over the shared T03-T06 authority. It
uses the existing F05 job lifecycle and F06 result envelope; it does not expose a
general Sage source evaluator to Topology and does not replace T07.

1. Define strict versioned shared-core input and output contracts for integral
   homology. Input contains only the canonical hash, T06 artifact identity, chain
   dimensions, and ordered sparse integer entries for `d1` and `d2`.
2. Add one allowlisted `sage.topology.integer_homology` operation to the isolated
   Sage worker. Reject unknown fields and source/script/expression data, enforce
   reviewed cell/nonzero/coefficient limits, and independently verify `d1*d2 = 0`.
3. Construct a Sage chain complex over `ZZ`, compute `H0` through `H2` with Sage's
   Smith-normal-form homology implementation, and return free ranks, torsion invariant
   factors, group notation, boundary Smith diagonals, Sage version, elapsed time, and
   bounded diagnostics.
4. Wrap the Sage call in an F05 adapter with source checkpoints, progress, work,
   memory, input/output, deadline, and cancellation enforcement. Ignore late output
   after cancellation, timeout, or source invalidation.
5. Publish through F06 only after strict output validation and exact source/hash/
   artifact/dimension matching. Store only compact answer metadata and retain the T06
   sparse-matrix handle for locate-back.
6. Keep T07 local `Z/2Z` feedback available when Sage is unavailable or times out.
   Never relabel that fallback as an integral answer, and do not start it after an
   explicit cancellation.
7. Verify all eligible T01 integer groups, `Z/2Z` and `Z/3Z` torsion examples, strict
   allowlisting, input/output limits, timeout, cancellation, engine provenance,
   stale publication, artifact identity, and fallback coefficient labeling.

**T08 acceptance:** every eligible T01 fixture can traverse the reviewed F05 adapter
and publish an exact F06 `Z` result with SageMath version and the correct free/torsion
decomposition; arbitrary Sage source is structurally impossible in this workflow;
oversized, cancelled, timed-out, malformed, or stale work publishes no integral
answer; and a missing Sage service leaves only the explicitly labeled T07 `Z/2Z`
feedback available.

**Completed verification:** the focused T08 contract suite covers every eligible T01
entry, including projective-plane/Klein-bottle 2-torsion and Moore-space 3-torsion,
plus strict schema allowlisting, F05 input/output limits, cancellation, timeout, F06
engine/source/artifact provenance, stale publication, and coefficient-safe fallback.
The shared T06/T07/T08 and Sage schema suites pass (19 tests across four files), and
the full Topology unit suite passes (133 tests across 23 files). The Sage worker
modules pass Python bytecode compilation, repository-wide TypeScript checking and the
renderer production build succeed. A live Sage container was not exercised on this
desktop because neither Docker nor SageMath is installed; that optional backend check
remains an environment-specific integration gate. The implementation boundary is
documented in `docs/topology-sage-integer-homology.md`. T09 is the next sequential
Topology feature.

### T09 execution plan

**Status:** complete

T09 publishes the completed T03-T08 algebra pipeline in the existing Algebra View.
It preserves Diagram, Complex, and Realization as separate views and never infers a
formal answer from display geometry.

1. Derive one Algebra authority model from the current kernel-owned document, its
   T03 canonical complex, T06 sparse boundary artifact, and T07 local result.
2. Display eligibility, document identity, source revision/hash/generation,
   canonical hash, artifact identity, coefficient domain, result status, method,
   engine version, diagnostics, and elapsed time next to the answers they qualify.
3. Add explicit lifecycle controls for the allowlisted T08 Sage job: idle, running,
   exact, unavailable, cancelled, timed out, stale, and failed. Reject late/stale
   publication after source changes or cancellation.
4. Publish exact `H0` through `H2`, free ranks, torsion invariant factors, and Smith
   diagonals only from a verified F06 integral result over `Z`.
5. Keep the released renderer calculation as a labeled compatibility preview and
   retain T07 only as visibly finite-field `Z/2Z` feedback when Sage is absent or
   times out. Never imply that the fallback computed integral torsion.
6. Make every `d1`/`d2` coefficient selectable. Show exact values, row/column basis
   cells, signed incidence contributions, cancellations, and direct authored-source
   locate-back. Add source locate-back for displayed cycle representatives.
7. Verify exact publication, torsion and Smith data, source/artifact/engine
   provenance, stale rejection, unavailable/timeout semantics, matrix evidence,
   authored-source navigation, TypeScript, the Topology suite, semantic-safety E2E,
   and the renderer production build.

**T09 acceptance:** every displayed formal answer identifies its source revision,
generation, structural hash, coefficient domain, method/engine, and artifact where
applicable; matrix coefficients and cycles locate back through canonical cells to
editable source elements; stale or failed external work publishes no integral
answer; and Diagram/Complex/Realization behavior remains available and semantically
separate.

**Completed verification:** the T09 publication contract covers exact matrix
coordinate/source evidence, integral group and torsion publication, Smith data,
engine/source/artifact provenance, stale-result rejection, and separate unavailable
and timed-out `Z/2Z` fallback states. The Algebra UI exposes the same authority and
locate-back chain, documented in `docs/topology-algebra-publication.md`. The combined
T03-T09 authority suites pass (30 tests across six files), all Topology unit suites
pass (137 tests across 24 files), and both semantic-safety E2E checks pass.
`typecheck:noemit` and the renderer production build also succeed. Live Sage
execution remains an optional environment-specific gate on a runner with SageMath
installed.

### T10 execution plan

**Status:** complete

T10 replaces preset/name recognition as a possible source of formal surface labels
with a shared-core, revision-bound certificate over the T03 canonical complex and
T04 structural report. The existing renderer classifier remains a compatibility
consumer outside the migrated Algebra publication path.

1. Define immutable shared-core surface classification, eligibility, orientability,
   diagnostic, and outcome contracts with the T10 algorithm version.
2. Require successful T04 canonical validation, a finite nonempty 2-complex, and a
   connected canonical one-skeleton before attempting surface classification.
3. Certify edge links, vertex links, and the boundary graph. Preserve failed
   canonical-cell and authored-source references for inspection and locate-back.
4. Propagate signed face orientations across every interior edge. Publish the
   conflicting canonical edge certificate for non-orientable surfaces.
5. Compute cellular Euler characteristic and require a valid integer genus or
   crosscap number using the certified boundary count. Publish a formal label only
   after every displayed gate passes.
6. Publish a compact F06 result with certified/unsupported status, exact source
   revision/hash/generation, canonical hash, method/version, engine, eligibility,
   boundary, orientability, Euler, and classification summary.
7. Consume the shared result in Algebra View without changing Diagram, Complex, or
   Realization behavior. Show every gate, provenance, boundary/orientation evidence,
   and source-location controls for failed prerequisites.
8. Verify the entire T01 classification corpus, orientable/non-orientable and
   boundary cases, a torus-named non-manifold impostor, invalid structural input,
   provenance, UI rejection, TypeScript, Topology tests, E2E, and production build.

**T10 acceptance:** valid surfaces classify from canonical incidence with the
reviewed family, genus/crosscap number, boundary components, and Euler certificate;
invalid or non-manifold inputs display their exact failed gates and no formal name;
every result is revision/hash bound and failures locate back to source cells; and a
preset label or R3 shape cannot upgrade an ineligible complex.

**Completed verification:** the shared T10 suite exercises the complete T01 corpus,
all six publication gates, signed non-orientability, boundary components, F06
provenance, a deliberately torus-named non-manifold source, invalid structural
rejection, and source locate-back. The migrated UI and architecture boundary are
documented in `docs/topology-surface-classification.md`. The combined T03-T10
authority suites pass (35 tests across seven files), all Topology unit suites pass
(137 tests across 24 files), and both semantic-safety E2E checks pass against the
rebuilt renderer. `typecheck:noemit` and the renderer production build also succeed.

### T11 execution plan

**Status:** complete

T11 makes the current Topology vertical slice portable and replayable without making
derived caches authoritative. Normal saves move to `.math3d-topology` renderer format
v3; released v1/v2 files keep their existing read/migration behavior until the user
chooses to save.

1. Define a strict shared-core persistence record around the T02
   `TopologyDocument`, T03 canonical hash, F03 command envelopes, F06 compact result
   envelopes, and F07 artifact handles.
2. Persist a source-only checkpoint, normalized forward/inverse transaction log,
   per-transaction structural hashes, saved undo/redo cursor, and exact final state
   hash. Bound the retained log to the kernel's 100-entry history limit.
3. Validate replay from the checkpoint in `replay` mode, verify every forward state
   and inverse source, restore commands above the saved cursor, and require the final
   source identity/revision/hash to match the persisted document.
4. Extend the diagram command adapter to export the active replay record and restore
   the same kernel undo/redo state. Keep pointer previews transient and exclude
   committed selection and pending analysis requests from checkpoints.
5. Save current T07, T08 (when present), and T10 F06 records as compact metadata.
   Require matching current result references in the persisted TopologyDocument and
   reject stale results.
6. Save artifact handles and source lineage only. Mark all omitted payloads
   `unavailable` with a recompute reason; never serialize T06 matrices or fabricate
   artifact availability on reopen.
7. Recompute renderer display/teaching data from the replayed source, preserve view
   state, expose replay/result/artifact status in the document panel, and keep loaded
   exact-result metadata visible with a rerun affordance.
8. Verify author -> analyze -> save -> reopen -> replay, save-after-undo redo
   restoration, legacy v1/v2 migration, compactness, stale/tampered/fabricated input
   rejection, TypeScript, Topology suites, Electron E2E, and production build.

**T11 acceptance:** an authored and analyzed session reopens with the same stable
document ID, source revision/hash, canonical hash, compact result statuses and
provenance; replay reproduces the saved state and undo/redo cursor; missing artifacts
remain explicitly unavailable with recomputation offered; no bulk cache becomes
authoritative; and old files are never rewritten merely by opening them.

**Completed verification:** the T11 persistence suite covers the full
author/analyze/save/reopen/replay flow, an undone transaction with a retained redo
branch, exact checkpoint/transaction/final hashes, compact current result references,
unavailable artifact handles, payload non-embedding, replay divergence, stale result,
and fabricated availability rejection. The format and compatibility boundary are
documented in `docs/topology-replayable-persistence.md`. The focused persistence,
legacy-format, and command-adapter suites pass (14 tests across three files); all
Topology unit suites pass (140 tests across 25 files), and both semantic-safety E2E
checks pass against the rebuilt renderer. `typecheck:noemit` and the renderer
production build also succeed.

### T12 execution plan

**Status:** complete

T12 turns the existing read-only Mesh incidence adapter into a revision-safe module
handoff. Mesh remains the owner of polygonal geometry; Topology captures an immutable
finite snapshot and never follows later Mesh edits implicitly.

1. Define a versioned Mesh handoff record with source Mesh ID/revision, capture time,
   deterministic snapshot hash, and the complete oriented triangle incidence source.
2. Generate stable snapshot IDs for every vertex, edge, and triangle and qualify each
   locate-back reference with the source Mesh ID and revision.
3. Analyze the captured `MeshTopologySnapshot` directly, so mutation of the original
   position/index buffers after capture cannot alter the Topology source or result.
4. Map canonical vertices, edges, and faces through their source references to the
   exact originating Mesh snapshot elements.
5. Compare the captured source identity with the current Mesh identity and expose
   `current`, `stale`, and `source-unavailable` states. A changed revision marks the
   dependent Topology result stale without modifying it.
6. Retain the handoff in application workspace state across Mesh/Topology navigation;
   require an explicit **Analyze current Mesh** action to replace it.
7. Show source revision, snapshot hash, stable cell counts, lifecycle state, canonical
   cell selection, and gated locate-back in the interoperability panel.
8. Verify immutability, deterministic identity, lifecycle transitions, all-dimensional
   locate-back, adapter compatibility, TypeScript integration, Topology regression,
   Electron interaction, and production build.

**T12 acceptance:** a Mesh analysis is tied to one immutable source ID/revision and
canonical simplex map; editing or replacing the live Mesh leaves the captured source
unchanged and marks its result stale; while the originating revision is current, a
canonical vertex, edge, or face can navigate back to the corresponding Mesh element.

**Completed verification:** the focused handoff and compatibility suites cover stable
vertex/triangle IDs, qualified source references, post-capture live-buffer mutation,
exact snapshot analysis, revision staleness, source retention, and canonical
vertex/edge/face locate-back. The ownership and lifecycle boundary is documented in
`docs/topology-mesh-snapshot-handoff.md`. The focused handoff/adapter suites pass
(9 tests across two files); all Topology unit suites pass (144 tests across 26
files), and both semantic-safety E2E checks pass against the rebuilt renderer.
`typecheck:noemit` and the renderer production build also succeed.

### T13 execution plan

**Status:** complete — Topology v1 formal migration closed

T13 closes the formal Topology v1 migration by consolidating its release evidence and
removing the last React-state mutation fallback. It does not remove supported legacy
documents, authoring tools, Geometry adapters, or visualization modes.

1. Extend the formal fixture matrix to require explicit H0-H2 results over both `Z`
   and `Z/2Z`, source mapping, provenance, exact matrices, and consistency checks.
2. Add a generated degree-`n` attaching-map property matrix for `n = 1…12`, checking
   `∂₁∂₂ = 0`, integral torsion, mod-2 parity, and Euler/homology consistency.
3. Promote the constrained Sage differential, timeout/cancellation, late-publication,
   malformed-output, stale-source, and size-limit suites into the aggregate release
   command.
4. Expose kernel undo/redo state from `TopologyDiagramCommandAdapter`; remove the
   parallel React snapshot stacks and all source-state fallback mutation.
5. Migrate released v2 undo/redo snapshots once into reversible kernel transactions,
   retaining legacy open behavior while ensuring all subsequent changes use one
   production route.
6. Retain v1/v2 document migration, raw diagram import, read-only Mesh/Geometry
   adapters, and realization compatibility unless a focused gate proves them
   redundant. Record the remaining out-of-scope workflows explicitly.
7. Run persistence/replay, formal/property, Sage differential/cancellation, adapter,
   E2E semantic/visual-realization, responsive, TypeScript, and production-build
   gates through one authoritative command.

**T13 acceptance:** valid inputs publish transparent exact H0-H2 over `Z` and
`Z/2Z`, including integral torsion and complete provenance; invalid, stale,
unsupported, timed-out, and cancelled work remains explicit and cannot publish as
current; save/reopen/replay remains structurally identical; all interactive source
mutations use the application kernel; compatibility paths still in use remain
supported and documented.

**Completed verification:** `npm run test:topology:v1:acceptance` passes the complete
gate: 146 Topology tests across 26 files; 8 dedicated Sage/publication tests across 2
files; cross-project TypeScript; desktop and renderer production builds; 2 Electron
semantic and visual-realization journeys; and phone portrait, phone landscape,
tablet, and desktop responsive smoke checks. The closure, retained compatibility,
out-of-scope work, and authoritative commands are recorded in
`docs/topology-v1-release-gates.md`.

### C01 execution plan

**Status:** complete

C01 freezes the existing Complex Analysis product surface with explicit scientific
evidence before kernel extraction begins. Existing lab entry points, presets, and
workflows remain unchanged.

1. Add one versioned, machine-readable corpus spanning Function Explorer, Möbius,
   Riemann Sphere, Residue, Branch, and Covering labs.
2. Record numerical fixtures for `1/z`, `1/(z^2+1)`, `sin(z)/z`, `exp(z)`, `log(z)`,
   `sqrt(z)`, `z^(1/3)`, and `sqrt(z^2-1)` against named closed-form oracles and
   explicit tolerances.
3. Record contour-integral fixtures for the residue theorem, paired-pole
   cancellation, a removable singularity, and an entire function.
4. Record exact branch monodromy, sheet permutation, fiber/deck-transformation,
   Möbius generalized-circle, and Riemann-sphere conventions.
5. Freeze domain coloring, grid deformation, vector/level overlays, contour bands,
   every current path mode, branch-cut profiles, sheet/loop animation, fiber
   inspection, and 3D value-surface controls as illustrative UI contracts.
6. Generate representative 3D value meshes only as finite sampled preview checks;
   do not infer analytic or topological truth from rendering.
7. Add a focused unit, TypeScript, renderer-build, and Electron reachability gate.
8. Document the evidence boundary so no visual snapshot alone can satisfy a
   scientific assertion.

**C01 acceptance:** every fixture names its mathematical oracle or illustrative
contract; every numerical assertion declares a positive tolerance; all eight
required functions and six current labs are represented; branch, covering, contour,
overlay, path, and 3D-preview workflows remain reachable; and no pixel comparison is
treated as proof.

**Completed verification:** the versioned corpus now contains eight point-value
fixtures, four contour-integral fixtures, four branch-continuation fixtures, two
covering-space fixtures, Möbius and Riemann-sphere invariants, two illustrative 3D
mesh contracts, and a complete UI workflow inventory. The focused suite passes 63
tests across six files; cross-project TypeScript and the renderer production build
pass; and all three Electron journeys pass across lab navigation, explorer controls,
branch/path/3D controls, fibers, and deck transformations. The evidence levels and
their proof boundary are documented in
`docs/complex-analysis-scientific-fixture-corpus.md`.

### C02 execution plan

**Status:** complete

C02 introduces a shared-core `ComplexAnalysisDocument` as the first authoritative
Complex Analysis source record while leaving the current lab UI behavior intact.

1. Define a versioned canonical-JSON document for normalized function AST, parameters,
   assumptions, domain, sampling, contours/paths, branch policy, covering data,
   Möbius coefficients, result references, identity/hash, and provenance.
2. Hash the complete mathematical source while excluding result references and
   migration metadata from source identity.
3. Define panel layout, active inspector tab, animation progress, hover, and drag
   preview in a separate transient-view contract and reject those fields in saved
   documents.
4. Validate bounded arrays, finite values, safe IDs, branch-sheet invariants,
   sampling budgets, normalized AST shape, and current-result provenance.
5. Provide immutable create, normalize, serialize, and deserialize operations with
   stable identity and deterministic structural hashes.
6. Adapt recognized current lab-state records only through an injected validated
   AST parser; omit transient fields and attach a migration diagnostic.
7. Reject raw text, compiled functions, unsupported legacy shapes, invalid sheets,
   and stale available-result claims with actionable diagnostics.
8. Document the authority, compatibility, and migration boundaries and add a focused
   verification command.

**C02 acceptance:** save/load preserves all mathematical and branch semantics with
the same document ID, revision, and source hash; transient view state cannot enter
the document; current result references must match the exact source generation; and
unsupported legacy state returns a clear recovery diagnostic instead of becoming
authority.

**Completed verification:** five focused tests cover full semantic round-trip,
deterministic source hashing, exclusion and rejection of transient state, stale
result rejection, controlled legacy adaptation, and raw-text/compiled-function
rejection. Cross-project TypeScript succeeds, and the contract and migration
boundary are documented in `docs/complex-analysis-document.md`.

### C03 execution plan

**Status:** complete

C03 replaces the renderer's compile-only expression implementation with an explicit
controlled parse, normalized-AST, validation, and preview-compilation pipeline.

1. Define the supported tokens, operators, constants, variables, unary functions,
   implicit multiplication, associativity, and precedence in shared core.
2. Parse source into a position-free `ComplexExpressionAst` suitable for canonical
   JSON persistence in `ComplexAnalysisDocument`.
3. Validate exact node fields, allowed variables, finite literals, supported
   operators/functions, canonical-JSON safety, maximum depth, and node budget.
4. Serialize and deserialize ASTs deterministically and prove repeated parse and
   canonical JSON round-trips preserve the same tree.
5. Report absolute index and one-based line/column for lexical and grammatical
   failures, including invalid characters, names, operands, parentheses, and
   function arity.
6. Compile only validated AST nodes into the existing fast Complex preview evaluator;
   never compile or execute unrestricted source.
7. Route the existing `compileComplexExpression` API through the new stages so
   Function Explorer, maps, surfaces, and consumers retain their current behavior.
8. Differentially verify all eight C01 functions, controlled-grammar behavior,
   existing parser/map suites, TypeScript, production build, and Electron workflows.

**C03 acceptance:** AST serialization/deserialization and repeated parsing are
stable; every C01 supported expression retains its preview value within its declared
floating-point tolerance; unsupported or malformed syntax identifies its precise
source location; and no unrestricted evaluation path is introduced.

**Completed verification:** 83 tests across six files pass, including sixteen C01
AST/value differential cases, stable canonical serialization, implicit
multiplication, seven precise diagnostic cases, malformed/executable AST rejection,
and the existing Complex expression, map, document, and platform suites.
Cross-project TypeScript and the production renderer build succeed; all three C01
Electron journeys also pass after the parser migration. The security/grammar
boundary is documented in `docs/complex-expression-ast.md`.

### C04 execution plan

**Status:** complete

C04 establishes one application-kernel command boundary for committed Complex
Analysis edits while keeping typing, dragging, hover, animation, and layout local.

1. Register commands for function, parameters, domain, sampling, contours/paths,
   branch policy, covering definition, and Möbius transformation.
2. Register source-bound intents for committed Z/W/sphere selection, analysis, and
   preview/full 3D value-surface handoff.
3. Project all semantic edits through `ComplexAnalysisDocument` validation and its
   deterministic source hash.
4. Advance revision once per changed semantic field, preserve no-op identity, mark
   retained results unavailable, and clear source-dependent selection and requests.
5. Provide reversible edits and kernel undo/redo with exact inverse commands.
6. Keep expression typing in a validated preview method until an intentional
   function commit.
7. Bridge candidate state in Function -> Path/Residue -> Branch -> Covering ->
   Möbius -> Riemann Sphere/selection -> 3D handoff order.
8. Prove interactive and imported origins converge to the same canonical document
   and document the compatibility boundary.

**C04 acceptance:** all committed semantic edits pass the command registry; GUI and
imported command origins produce identical canonical documents; every changed source
field advances the revision/hash and stales previous results; preview-only edits do
not mutate history; and selection/analysis/3D requests name their source generation.

**Completed verification:** five adapter journeys and 42 focused tests across four
files pass, covering transient typing, eight-family ordered migration, GUI/import
parity, result staleness, dependent-intent clearing, source-bound selection and
requests, revision advancement, and undo history. Cross-project TypeScript succeeds;
the boundary is documented in `docs/complex-analysis-commands.md`.

### C05 execution plan

**Status:** complete

C05 adds an F07-backed preview session between the authoritative C04 document and
the existing immediate Function Explorer experience.

1. Define low/high artifact bundles for domain coloring, Z/W deformation grids,
   real, imaginary, modulus, argument, vector field, U/V level curves,
   Cauchy-Riemann defect, conformal field, path mapping, and 3D value surfaces.
2. Compile only the validated C03 AST and sample the exact C04 document generation.
3. Publish Float32 payloads through the F07 registry with handles containing quality,
   source revision/hash, layer role, byte count, and checksum.
4. Keep React state compact: revision, readiness, and handle count only; never place
   sampled arrays in the document or localStorage.
5. Cap low quality at 32×32 and high quality at 256×256 under the document's sampling
   budget; yield between row blocks to preserve interactive rendering.
6. Keep drag previews transient and cap them at 256 samples regardless of persistent
   sampling resolution.
7. Recheck source generation before publication, ignore late work, and invalidate
   old payloads after a committed source change.
8. Bind the current Function Explorer spec to the preview session and expose its
   revision/artifact readiness beside the overlay controls.

**C05 acceptance:** all fourteen preview families resolve only through current
revision-bound handles; large payloads remain outside React/document/localStorage;
drag previews are bounded; old and late artifacts cannot publish or resolve as
current; and the existing TypeScript UI remains immediately available without Sage
or native backends.

**Completed verification:** five focused artifact journeys and 59 tests across four
files pass, covering low/high resolution, fourteen layer roles, compact handles,
registry-only bytes, source advancement, stale/late rejection, and drag caps.
Cross-project TypeScript and the production renderer build pass. The three C01 lab
journeys and the new visible provenance journey pass in Electron. The lifecycle and
UI location are documented in `docs/complex-preview-artifacts.md`.
