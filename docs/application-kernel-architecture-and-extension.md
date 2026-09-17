# Application Kernel architecture and extension contract (GK20)

This is the version-1 extension boundary for the completed GK integrations. The
canonical implementation remains the exported types and validators in
`packages/core/src` and `packages/kernel/src`; this document does not replace
their executable validation. A schema change requires a new version, an explicit
migration, and replay/open tests. Existing version-1 files remain readable.

## Layer and ownership rules

`@math3d/core` owns immutable, JSON-safe document/identity, command, result,
relation, job, platform-capability, and mixed-workspace contracts. `@math3d/kernel`
owns transaction/history/event coordination, artifact and dependency lifecycle,
scientific admission/broker behavior, and conformance harnesses. Feature adapters
own mathematics and translation to these contracts. Renderer, Electron main,
browser, Expo, and workers own host facilities and transport. Imports from core
or kernel into runtime/feature layers are forbidden; renderer-to-Electron-main and
mobile-to-desktop/renderer imports are forbidden by the CI dependency gate.

The production flow is: validate command and source generation → commit one
domain transaction → publish event/history record → mark dependent results and
artifacts stale → dispatch admitted scientific job if needed → validate its
source generation and limits → attach result, artifact, and provenance relation →
project the immutable query into the UI. A renderer preview or hover is transient
and never a second authoritative mutation.

## Versioned contract index

| Contract | Authority | Invariant |
| --- | --- | --- |
| Document identity and field ownership | `documentIdentity.ts` | Stable ID, monotonic revision, structural hash; presentation edits do not counterfeit structural changes |
| Command/transaction/event | `commands.ts`, `inMemoryDocumentKernel.ts`, `contracts.ts` | Versioned JSON envelope, atomic failure, ordered completed event, bounded history |
| Query/history/replay | `inMemoryDocumentKernel.ts`, `domainAdapterConformance.ts`, module replay adapters | Query isolation; undo/redo/replay reproduce canonical source generation |
| Result/artifact/job/broker | `analysisResults.ts`, `scientificJobs.ts`, `artifactRegistry.ts`, `scientificExecutionBroker.ts` | Bounded payloads and limits, explicit backend capability, cancellation/deadline/stale rejection |
| Relation/dependency | `documentRelations.ts`, `dependencyGraph.ts` | Versioned provenance, source-generation validation, local dependency invalidation |
| Selection | `viewerProvenance.ts`, `renderer/src/selection` | Hover transient, committed selection explicit, stale entities remapped or cleared |
| Persistence | `mixedWorkspace.ts`, `renderer/src/kernel/mixedWorkspaceReplay.ts` | Strict schema, legacy normalizers, checkpoint and replay parity, no embedded heavy binary payload |
| Platform facilities | `platformCapabilities.ts`, host probes | Immutable schema v1; absent capabilities carry reasons and fail before transport |

## Migration and lifecycle owner matrix

| Domain | Authoritative source owner | Durable/replay boundary | Derived/compute boundary |
| --- | --- | --- | --- |
| Geometry / Scene Script | Geometry document/command bridge | Geometry adapter and normalized Scene Script | Geometry result workflow and relations |
| Mesh | Mesh document/kernel commands | Mesh adapter and replay | Mesh analysis job, artifact registry |
| Surface | Surface document integration | Surface persistence/replay | Derived SurfaceMesh and surface results |
| Curve | Curve document integration | Curve persistence/replay | Curve worker broker and artifacts |
| Volume | Volume document adapter | Volume persistence/replay | Isosurface broker and extraction relation |
| Topology | Topology command adapter | Topology persistence/replay | Formal computation and result relations |
| Complex Analysis | Complex command adapter | Complex persistence/replay | Complex analysis results and relations |

The module-local adapters above are retained because they translate distinct
mathematics and historical file formats. The GK19 gate proves their shared
invariants; it does **not** prove that any entire adapter is redundant. GK20
therefore removes no module-local lifecycle implementation speculatively.

## Known compatibility exceptions and removal gates

| Exception | Owner | Why retained | Removal gate |
| --- | --- | --- | --- |
| Legacy per-module save/open entry points | Feature module maintainers | Old documents and UI routes must remain readable | A fixture corpus round-trip proving mixed workspace can replace each route without lost fields or IDs |
| Desktop CGAL/VTK and Sage IPC facades | Electron main/compute maintainers | Privileged process and optional installations | Versioned broker adapter with operation/limit/error parity and installed-backend E2E |
| Expo scene-project storage | Mobile maintainer | Physical device storage differs from browser localStorage | Device-level migration and save/reopen/replay test on supported OSes |
| Feature-local worker coordinators | Curve/Volume/Mesh maintainers | Transfer, progress, cache and cancellation are feature-specific | Broker conformance plus progress/cache/abort parity on production worker fixtures |

No exception may gain a second authoritative history or result store. Open a
follow-up migration with before/after replay fixtures before deleting an owner.

## Extension recipe and security boundary

1. Define a strict versioned core document and validators with resource limits.
2. Implement domain-specific mathematics in a feature adapter, then run the
   shared command/selection conformance harness and persistence replay tests.
3. Register derived results with a source generation, artifact handle, and
   provenance relation; invalidate locally when dependencies change.
4. Expose compute through F08 operation discovery and broker admission. Require
   host facilities through a platform snapshot; unsupported operations must be
   unavailable before IPC, network, worker, or native transport starts.
5. Add browser/desktop tests and mobile/worker tests where the operation is
   actually supported; report unavailable optional engines explicitly.

Renderer input, imported files, scripts, IPC replies, and remote responses are
untrusted. Keep Node, filesystem, Python/native process spawn, and dialogs in
Electron main behind the preload allowlist. Do not grant those privileges to a
browser, worker, or mobile adapter by naming convention. Validate JSON shapes,
sizes, source generations, operation limits, and cancellation/deadline behavior
at the adapter boundary; keep worker failures observable. Never deserialize an
unrecognized future schema as if it were v1.

`npm run check:kernel:boundaries` is the CI layer gate. `npm run test:kernel:gk19`
is the current cross-runtime/contract gate, with the physical-mobile and Sage
limits recorded in `docs/kernel-gk19-platform-conformance.md`.
