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
