# Post-1.6.0 verified continuation backlog

Audit date: October 1, 2026. The original audit used candidate `354d06d`.
This branch now includes [published 1.6.0](mobile-1.6.0-release-candidate.md):
tag source `8e30e85190599467e3839e1b1e4b5b9bc708916f` and final maintainer
`main` commit `a6a4f197df343630c26f58ecfd4a685b5f3230ab`, integrated by
merge `b180ed7fa47797104b4361dbf67aaa157373de15` in this checkout.
The release's exact-build signoff does not transfer to the changed Projects runtime.

## Findings and evidence limits

The F foundation, T01-T13, C01-C12, and GK01-GK20 have representative production
code, tests, and documentation in this baseline. Topology's release-gate document
records formal closure; Complex has an integrated v1 acceptance contract; GK20
has a published extension boundary with explicit retained compatibility exceptions.
Restarting the program at F01 would duplicate existing work.

The older local delivery-order draft and Complex functionality snapshot are
planning/history inputs, not current delivery status. In particular, the old
claim that Complex has no dedicated document or result lifecycle is superseded
by its document, persistence, numerical/exact publication, and acceptance code.
The local Scene Script migration draft also uses K labels with different scopes
from the delivery-order draft. Use the detailed program's GK01-GK20 identifiers
for implementation tracking; do not equate similarly numbered K and GK entries.
Those uncommitted drafts remain in the original checkout and are not imported
into this branch.

Each row below identifies representative evidence. “Implemented” is an audit
classification, not a fresh claim that the complete release gate passed. The
repeatable mapped gate passed **359 tests in 54 files**, including all nine new
mathematical cases. A broader Topology/Complex/core/kernel selection also passed
475 tests before adding the extra adapter selections. The dependency boundary
check passed with 945 modules and 1,774 dependencies. Renderer TypeScript
(`tsc -p renderer/tsconfig.app.json --noEmit`) also passed. No full production build,
Electron/Chromium acceptance, physical-device run, or installed-Sage differential
run was executed as part of this preparation.

## Milestone audit

All rows: implemented, with full release acceptance to revalidate on the released
commit. F rows additionally need runtime/job conformance; T rows need the formal
Topology acceptance command; C rows need Complex v1 acceptance; GK rows need
GK19/GK20 acceptance. T08/C07 require installed Sage to substantiate engine parity,
not just mocked transport tests. GK19's mobile row is contract/type coverage;
physical-mobile behavior is a separate gate. GK20 explicitly retains adapters
until equivalence and removal criteria are met.

| Milestone | Scope | Implementation | Representative test | Contract / gate documentation |
| --- | --- | --- | --- | --- |
| F01 | Platform baseline | [code](../packages/core/src/topologyDocument.ts) | [test](../renderer/src/topology/platformBaseline.test.ts) | [contract](kernel-document-identity.md) |
| F02 | Identity/revision/hash | [code](../packages/core/src/documentIdentity.ts) | [test](../renderer/src/core/documentIdentity.test.ts) | [contract](kernel-document-identity.md) |
| F03 | Atomic commands | [code](../packages/core/src/commands.ts) | [test](../renderer/src/core/commandTransactions.test.ts) | [contract](kernel-command-transactions.md) |
| F04 | Document kernel | [code](../packages/kernel/src/inMemoryDocumentKernel.ts) | [test](../renderer/src/kernel/inMemoryDocumentKernel.test.ts) | [contract](kernel-runtime-service.md) |
| F05 | Scientific jobs | [code](../packages/core/src/scientificJobs.ts) | [test](../renderer/src/kernel/scientificJobService.test.ts) | [contract](kernel-scientific-jobs.md) |
| F06 | Result/provenance envelopes | [code](../packages/core/src/analysisResults.ts) | [test](../renderer/src/core/analysisResults.test.ts) | [contract](kernel-analysis-results.md) |
| F07 | Artifact registry | [code](../packages/kernel/src/artifactRegistry.ts) | [test](../renderer/src/kernel/artifactRegistry.test.ts) | [contract](kernel-artifact-registry.md) |
| F08 | Backend admission/broker | [code](../packages/kernel/src/scientificExecutionBroker.ts) | [test](../renderer/src/kernel/scientificExecutionBroker.test.ts) | [contract](kernel-scientific-execution-broker.md) |
| T01 | Canonical corpus | [code](../renderer/src/topology/core/analysisPipeline.ts) | [test](../renderer/src/topology/canonicalRegressionCorpus.test.ts) | [contract](testing/topology-v1-canonical-regression-corpus.md) |
| T02 | Topology document | [code](../packages/core/src/topologyDocument.ts) | [test](../renderer/src/core/topologyDocument.test.ts) | [contract](topology-module-roadmap.md) |
| T03 | Canonical finite complex | [code](../renderer/src/topology/canonicalFinite2DAdapter.ts) | [test](../renderer/src/topology/canonicalFinite2DAdapter.test.ts) | [contract](topology-module-roadmap.md) |
| T04 | Structural validation | [code](../packages/core/src/canonicalFinite2DValidation.ts) | [test](../renderer/src/core/canonicalFinite2DValidation.test.ts) | [contract](topology-canonical-structure-validation.md) |
| T05 | Command migration | [code](../renderer/src/topology/topologyCommandAdapter.ts) | [test](../renderer/src/topology/topologyCommands.test.ts) | [contract](topology-kernel-command-migration.md) |
| T06 | Exact boundary matrices | [code](../packages/core/src/canonicalFinite2DBoundaryMatrices.ts) | [test](../renderer/src/core/canonicalFinite2DBoundaryMatrices.test.ts) | [contract](topology-exact-sparse-boundary-matrices.md) |
| T07 | Local F2 homology | [code](../renderer/src/topology/localZ2Feedback.ts) | [test](../renderer/src/topology/core/homology.test.ts) | [contract](topology-local-z2-homology.md) |
| T08 | Sage homology jobs | [code](../renderer/src/topology/sageIntegerHomologyJob.ts) | [test](../renderer/src/core/sageIntegerHomology.test.ts) | [contract](topology-sage-integer-homology.md) |
| T09 | Algebra publication | [code](../renderer/src/topology/algebraPublication.ts) | [test](../renderer/src/topology/algebraPublication.test.ts) | [contract](topology-algebra-publication.md) |
| T10 | Surface eligibility | [code](../renderer/src/topology/core/surfaceClassification.ts) | [test](../renderer/src/topology/core/surfaceClassification.test.ts) | [contract](topology-surface-classification.md) |
| T11 | Replay/persistence | [code](../packages/core/src/topologyPersistence.ts) | [test](../renderer/src/topology/topologyPersistence.test.ts) | [contract](topology-replayable-persistence.md) |
| T12 | Mesh snapshot lineage | [code](../renderer/src/topology/meshSnapshotHandoff.ts) | [test](../renderer/src/topology/meshSnapshotHandoff.test.ts) | [contract](topology-mesh-snapshot-handoff.md) |
| T13 | Formal acceptance | [code](../renderer/src/topology/core/analysisPipeline.ts) | [test](../renderer/src/topology/core/releaseGates.test.ts) | [contract](topology-v1-release-gates.md) |
| C01 | Scientific corpus | [code](../renderer/src/math/complexExpr.ts) | [test](../renderer/src/math/complexScientificCorpus.test.ts) | [contract](complex-analysis-scientific-fixture-corpus.md) |
| C02 | Complex document | [code](../packages/core/src/complexAnalysisDocument.ts) | [test](../renderer/src/math/complexAnalysisDocument.test.ts) | [contract](complex-analysis-document.md) |
| C03 | Validated AST | [code](../packages/core/src/complexExpressionAst.ts) | [test](../renderer/src/math/complexExpressionAst.test.ts) | [contract](complex-expression-ast.md) |
| C04 | Command adapter | [code](../renderer/src/math/complexCommandAdapter.ts) | [test](../renderer/src/math/complexCommandAdapter.test.ts) | [contract](complex-analysis-commands.md) |
| C05 | Revision-safe previews | [code](../renderer/src/math/complexPreviewArtifacts.ts) | [test](../renderer/src/math/complexPreviewArtifacts.test.ts) | [contract](complex-preview-artifacts.md) |
| C06 | Numerical publication | [code](../renderer/src/math/complexNumericalAnalysis.ts) | [test](../renderer/src/math/complexNumericalAnalysis.test.ts) | [contract](complex-numerical-results.md) |
| C07 | Constrained Sage | [code](../renderer/src/math/complexSageJob.ts) | [test](../renderer/src/math/complexSageJob.test.ts) | [contract](complex-sage-adapter.md) |
| C08 | Exact residue/contour MVP | [code](../renderer/src/math/complexExactAnalysis.ts) | [test](../renderer/src/math/complexExactAnalysis.test.ts) | [contract](complex-exact-residue-contour-mvp.md) |
| C09 | Replay/export | [code](../packages/core/src/complexPersistence.ts) | [test](../renderer/src/math/complexPersistence.test.ts) | [contract](complex-session-persistence.md) |
| C10 | Branch continuation | [code](../renderer/src/math/complexBranchContinuation.ts) | [test](../renderer/src/math/complexBranchContinuation.test.ts) | [contract](complex-adaptive-continuation.md) |
| C11 | Riemann mesh lineage | [code](../renderer/src/math/complexRiemannSurfaceHandoff.ts) | [test](../renderer/src/math/complexRiemannSurfaceHandoff.test.ts) | [contract](complex-riemann-surface-lineage.md) |
| C12 | Integrated acceptance | [code](../renderer/src/math/complexCommandAdapter.ts) | [test](../renderer/src/math/complexV1Acceptance.test.ts) | [contract](complex-analysis-v1-release-gate.md) |
| GK01 | Relations | [code](../packages/core/src/documentRelations.ts) | [test](../renderer/src/core/documentRelations.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK02 | Dependency invalidation | [code](../packages/kernel/src/dependencyGraph.ts) | [test](../renderer/src/kernel/dependencyGraph.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK03 | Domain conformance | [code](../packages/kernel/src/domainAdapterConformance.ts) | [test](../renderer/src/kernel/domainAdapterConformance.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK04 | Geometry document | [code](../renderer/src/geometry/geometryDocumentAdapter.ts) | [test](../renderer/src/geometry/geometryDocumentAdapter.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK05 | GUI/Scene Script commands | [code](../renderer/src/geometry/geometryCommandBridge.ts) | [test](../renderer/src/geometry/geometryCommandBridge.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK06 | Derived geometry | [code](../renderer/src/geometry/geometryDerivedResources.ts) | [test](../renderer/src/geometry/geometryDerivedResources.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK07 | Mesh document | [code](../packages/core/src/meshDocument.ts) | [test](../renderer/src/mesh/meshDocumentAdapter.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK08 | Mesh transactions | [code](../renderer/src/mesh/meshDocumentAdapter.ts) | [test](../renderer/src/mesh/meshKernelCommands.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK09 | Mesh Analyze | [code](../renderer/src/mesh/meshDocumentAdapter.ts) | [test](../renderer/src/mesh/meshDocumentAdapter.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK10 | Surface document | [code](../renderer/src/surfaceAnalysis/surfaceDocumentAdapter.ts) | [test](../renderer/src/surfaceAnalysis/surfaceKernelIntegration.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK11 | Surface-Mesh lineage | [code](../renderer/src/surfaceAnalysis/surfaceMeshHandoff.ts) | [test](../renderer/src/surfaceAnalysis/surfaceMeshHandoff.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK12 | Curve document | [code](../renderer/src/curveAnalysis/curveDocumentAdapter.ts) | [test](../renderer/src/curveAnalysis/curveKernelIntegration.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK13 | Curve handoffs | [code](../renderer/src/curveAnalysis/curveDocumentAdapter.ts) | [test](../renderer/src/curveAnalysis/curveInteroperability.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK14 | Volume document | [code](../renderer/src/volume/volumeDocumentAdapter.ts) | [test](../renderer/src/volume/volumeDocumentAdapter.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK15 | Volume extraction | [code](../renderer/src/volume/volumeExtractionKernel.ts) | [test](../renderer/src/volume/volumeExtractionKernel.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK16 | Viewer provenance | [code](../packages/core/src/viewerProvenance.ts) | [test](../renderer/src/core/viewerProvenance.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK17 | Mixed replay | [code](../renderer/src/kernel/mixedWorkspaceReplay.ts) | [test](../renderer/src/kernel/mixedWorkspaceReplay.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK18 | Local invalidation parity | [code](../packages/kernel/src/dependencyGraph.ts) | [test](../renderer/src/kernel/dependencyLocalInvalidation.test.ts) | [contract](math3d-topology-complex-kernel-program-roadmap.md) |
| GK19 | Platform conformance | [code](../packages/kernel/src/platformBackendAdapter.ts) | [test](../renderer/src/kernel/platformBackendAdapter.test.ts) | [contract](kernel-gk19-platform-conformance.md) |
| GK20 | Contract freeze | [code](../packages/kernel/src/contracts.ts) | [test](../renderer/src/kernel/mixedWorkspaceReplay.test.ts) | [contract](application-kernel-architecture-and-extension.md) |

## Ordered continuation backlog

| Priority | Work package / owner | Concrete deliverable | Acceptance before closure |
| --- | --- | --- | --- |
| Completed | Reconcile release baseline / release maintainer | Recorded published tag/source/scope/artifact evidence; merged final release-maintainer main into this branch | All 53 mapped evidence rows exist; 414 tests / 66 files pass after integration; Surface restart and named-mobile-import changes merged without conflict |
| P1 | Installed scientific backend parity / compute maintainer | Run Topology integer-homology and Complex exact/Sage fixtures against installed Sage; retain engine version and source provenance | Actual requests execute; results match independent oracles; stale, timeout and cancelled outputs cannot publish; unavailable engines are recorded as unverified |
| P1 | Legacy route parity / feature maintainers | Inventory one retained save/open route at a time; add legacy -> reopen -> command -> undo/redo -> replay fixtures preserving IDs and mathematical fields | Old formats remain readable; structural source and result status match; only then propose removal of a redundant route |
| P1 | Mobile persistence parity / mobile maintainer | Follow the existing physical matrix on the exact signed build, including upgrade with stored projects, standalone reopen, interruption, rotation and accessibility | Exact build/device evidence closes the supported-device requirements; desktop tests cannot substitute for device signoff |
| P2 | Worker coordinator parity / Curve, Volume and Mesh maintainers | Select one retained coordinator and add production progress/cache/abort/stale-source parity fixtures through the broker | Cancellation and source changes suppress late publication; progress and cache behavior agree before deleting a local coordinator |
| P2 | Next mathematical feature decision / domain maintainers | Choose one bounded feature only after the compatibility/runtime evidence is reconciled | New source model, authority/status, independent mathematical oracle and persistence/replay gate are specified before implementation |

**First implementation recommendation:** a fixture-only legacy save/reopen/replay
parity slice for one retained per-module route. It builds on GK20's explicit
removal gate without expanding the kernel or touching release packaging. Pick the
route after rebasing and inspecting the actual release changes. Installed Sage and
mobile evidence may be gathered independently on suitably equipped machines.
Persistent homology, general covering-space solvers, and general algebraic
Riemann surfaces remain separate research proposals, not unfinished v1 migration.

## New regression coverage

The [fixture README](../tests/fixtures/post-1.6.0/README.md) explains nine independent
oracles and their consumers. Existing mandatory spaces and known-function cases
remain in their original corpora. New cases target disconnected rank, two loop
generators, torsion outside the existing degree matrix, negative/double winding,
excluded poles, cancelling residues and zero residue at a higher-order pole.
Sampled contour answers stay numerical even when the analytic oracle is exact.

## Resume after release

The continuation is now checked out in `C:\Math3D`, with the published release
baseline merged. Normal project dependencies are required in a fresh checkout;
local dependency junctions used during original preparation are development
conveniences, not committed artifacts.

1. Use the confirmed release tag/source and scope linked above.
2. Keep this branch synchronized with reviewed maintainer changes; the initial
   integration is complete and preserves the original delivery history.
3. Run `node scripts/post160-roadmap-audit.mjs --run` and
   `npm run check:kernel:boundaries`.
4. Before runtime changes, run `npm run test:topology:v1:formal`,
   `npm run test:complex:v1:acceptance`, `npm run test:kernel:gk19`, and
   `npm run test:kernel:gk20` as applicable. Report optional-engine/device gaps
   separately; do not carry forward earlier candidate signoff.
5. Implement one backlog slice per commit, preserving legacy formats and the
   existing result authority. Keep fixture-only preparation distinct from any
   later production change.

The initial audit commit changed no application version, signing configuration,
release workflow, or production behavior. The subsequently authorized
[Topology fix and upgrade regressions](post-1.6.0-upgrade-regressions.md) continue
items 3–4 on this branch and record their separate validation.

The next authorized product phase is [Unified Projects](unified-projects-roadmap.md),
with PRJ01–PRJ07 delivery slices covering the named workspace container, unified
explorer, local library, saved-document operations, lineage inspection and
compatibility-aware import/export and scientific starters. Named mobile Graph
transfer and PRJ08 automated desktop/browser/mobile-model evidence follow those
slices. Their implementation gates and restore/device limitations are recorded
in that roadmap and the [project acceptance matrix](unified-projects-acceptance.md).

PRJ09–PRJ11 are implemented and pushed through `11b2cb3`: Projects in main
navigation (`70ca027`), independent Curve/Surface native restoration (`2a93c1b`),
and procedural Geometry/bounded construction restoration (`11b2cb3`). Current
evidence is 414 audit tests, 16 Electron journeys and two Chromium interchange
journeys, with TypeScript, production builds and dependency boundaries passing.
Other source representations/modules and physical-device/installed-engine/signed
build acceptance remain open. Release-baseline integration is complete; the
[Projects roadmap](unified-projects-roadmap.md) now sequences PRJ13–PRJ18 to
close those obligations, with a dedicated repeatable software CI gate.
