# Math3D worker platform roadmap

## Purpose

Math3D needs one backend-neutral computational execution platform. It must run
the same logical operation through a browser worker, a bundled desktop process,
or a private remote service without letting a feature module depend on a
particular runtime, language, executable, container, or URL.

This roadmap evolves the existing system; it does not replace working
mathematics merely to change its transport.

## Status

Phase 1 is complete.

Phase 2 is complete for the current local-worker scope. `math3d.mesh.v1` defines
checksum-verified, typed-array binary resources for indexed mesh payloads. OBJ
import and Volume isosurface results use managed M3D mesh resources. The kernel
resource store provides checksum-addressed ownership, leases, byte quotas, and
deterministic cleanup. The bundled Python worker now has bounded admission,
interactive priority, startup protocol/health checks, a restart budget, and
structured lifecycle diagnostics.

- Completed foundation: canonical worker operation/ownership registry in
  `@math3d/core`; `ExecutionService` facade over the existing scientific
  execution broker; capability diagnostics; compatibility mapping for the
  current CGAL/VTK request kinds; focused conformance tests.
- Routed browser-worker slices: Curve analysis, Mesh differential analysis, and
  Volume isosurface extraction now submit through `ExecutionService` while
  preserving their existing worker protocols and typed-array caches.
- Legacy mesh normal cleanup now reaches the same facade through a VTK
  compatibility adapter. It retains the current Electron IPC and web-proxy
  bridge protocol; unavailable bridges surface as explicit capabilities.
- Deliberately deferred to Phase 3 and later: splitting the bundled Python
  worker into independently deployed VTK/CGAL services and adding remote
  resource transport.

```text
Feature / application kernel
             |
      ExecutionService
             |
   router + scheduler + resources
     /          |             \
JS/WASM    local process    private remote worker
             |                    |
       VTK / CGAL            VTK / CGAL / Sage
             \                  /
          canonical result + provenance
```

The core rule is:

```text
feature -> operation contract -> ExecutionService -> selected backend
```

No Geometry, Mesh, Surface, Volume, Topology, Curves, or Complex feature may
spawn Sage, import VTK, assume CGAL, manage a Docker URL, or parse a
backend-specific response directly.

## Current baseline

The repository already has useful but separate execution paths:

- Browser workers under `renderer/src/workers/` for import, mesh analysis,
  surface analysis, curves, geometry, implicit baking, and volume work.
- Scientific-job and execution-broker seams in `renderer/src/kernel/`, plus
  module-specific coordinators and schedulers.
- A long-lived desktop Python worker in `src/main/python/pythonWorker.ts`,
  with a line/binary protocol, request IDs, progress, health/version checks,
  timeouts, and a frozen bundled executable.
- Electron IPC adapters in `src/main/ipc/cgalMeshIpc.ts` and
  `src/main/ipc/vtkMeshIpc.ts`.
- A web-server proxy in `apps/web/server/worker-proxy.cjs` exposing the same
  Python-backed capabilities to the web and mobile clients.
- Capability-aware mobile service and platform contracts.

This is not a blank-slate worker project. The first delivery goal is a common
contract and routing layer that wraps these proven paths while preserving their
behaviour and existing public IPC/HTTP compatibility.

## Scope and non-goals

In scope:

- One canonical operation registry, request/result envelope, capability
  discovery, scheduling policy, cancellation semantics, resource model, and
  provenance format.
- Browser, Electron-local, server-local, and remote backend adapters.
- Dedicated CGAL, VTK, and Sage worker profiles where their value is justified.
- Deterministic conformance and availability tests.

Out of scope for the initial platform:

- Reimplementing every algorithm in every backend.
- Bundling Sage in the normal desktop installer.
- Moving rendering, camera interaction, picking, or ordinary UI state into a
  remote worker.
- Requiring Docker, CGAL, VTK, or Sage in order to launch the browser app.
- A generic `workers/generic-worker` abstraction with no operation ownership.

## Target repository layout

Introduce the platform in focused packages/directories rather than one
monolithic worker folder:

```text
packages/
  contracts/
    jobs/
    resources/
    capabilities/
  runtime/
    execution-service/
    scheduler/
    worker-registry/
    admission/
    transport/

workers/
  common/
    protocol/
    serialization/
    diagnostics/
    fixtures/
  js/
    mesh-worker/
    analysis-worker/
    import-worker/
  cgal/
    src/
    CMakeLists.txt
    Dockerfile
  vtk/
    src/
    requirements.lock
    Dockerfile
  sage/
    src/
    environment.lock
    Dockerfile
  gateway/
    src/
    Dockerfile
```

The initial implementation may locate the packages under the existing source
tree if a workspace conversion is premature. The public interfaces and tests
must be package-shaped from the outset so that extraction does not become
another architectural migration.

## Canonical contracts

### Operations

Each computation gets a stable, namespaced operation ID. IDs name mathematical
intent, not the selected implementation.

```ts
type Math3DOperation =
  | "mesh.import.obj"
  | "mesh.normals.compute"
  | "mesh.curvature.compute"
  | "mesh.repair"
  | "mesh.remesh"
  | "mesh.boolean"
  | "mesh.decimate"
  | "mesh.connectivity"
  | "topology.components"
  | "topology.boundary"
  | "geometry.intersection"
  | "geometry.triangulate"
  | "volume.contour"
  | "symbolic.simplify"
  | "symbolic.solve"
  | "symbolic.factor";
```

Existing request names remain supported by compatibility adapters during
migration. Operation IDs, input schemas, output schemas, and semantic version
rules live in one registry and are reviewed like public APIs.

### Job and result envelopes

```ts
interface ComputeJob<I = unknown> {
  jobId: string;
  operation: Math3DOperation;
  input?: I;
  resources: ResourceReference[];
  parameters?: Record<string, unknown>;
  priority: "interactive" | "analysis" | "heavy" | "batch";
  requirements?: {
    exactArithmetic?: boolean;
    deterministic?: boolean;
    preferredBackend?: BackendId;
    maxMemoryMB?: number;
  };
  source: RevisionContext;
  cancellationToken: string;
}

interface ComputeResult<O = unknown> {
  jobId: string;
  status: "completed" | "failed" | "cancelled" | "unsupported";
  result?: O;
  provenance: ResultProvenance;
  diagnostics: JobDiagnostics;
}
```

`ResultProvenance` records operation, selected backend and backend version,
algorithm/method, input resource fingerprints, source revisions, tolerances,
fallback reason, timing, warnings, and protocol version. A backend result is
never labelled exact unless its declared operation contract guarantees it.

### Protocol messages

The common protocol has these message families:

```text
WorkerHello       WorkerHealth        JobRequest
JobProgress       JobResult           JobError
JobCancel         JobCancelled        ResourceOffer/ResourceRelease
```

Desktop processes use framed stdin/stdout plus side-channel binary frames or a
local socket. Remote workers may use HTTP or gRPC behind the gateway. These are
transport implementations of one protocol, not separate backend APIs.

### Resource exchange

Large arrays must not cross several JSON layers. Define a versioned M3D resource
format first, starting with `math3d.mesh.v1`:

```text
header: schema version, scalar type, counts, attributes, checksums
positions: Float32Array or Float64Array
indices: Uint32Array
optional normals, scalar fields, vector fields, metadata
```

Transport by environment:

| Environment | Resource transport |
| --- | --- |
| Browser | transferable `ArrayBuffer` / `SharedArrayBuffer` where permitted |
| Electron local | process-owned temporary resource or mapped binary file |
| Server local | temporary resource store or shared volume |
| Remote | opaque resource ID with authenticated blob/object-store transfer |

Requests carry references and parameter scalars, not a 700k-vertex JSON mesh.
Resource lifetime is lease-based and tied to job completion, cancellation, and
document revision invalidation.

## Registry, routing, and ownership

### Worker manifest

Every backend exposes a signed/validated manifest containing its ID, protocol
range, environment availability, version, operations, input limits, resource
requirements, and health state. The router selects only a worker whose manifest
satisfies the requested operation.

Example backend classes:

| Backend | Initial environments | Intended responsibilities |
| --- | --- | --- |
| `js-worker` | web, desktop, mobile | fast import, analysis, lightweight numeric work |
| `wasm-worker` | web, desktop, mobile | portable bounded local computation |
| `python-vtk` | desktop, server | VTK filters, decimation, connectivity, contours and volume pipelines |
| `native-cgal` | desktop, server | robust repair, boolean, remesh, intersections and exact predicates |
| `sage-remote` | server | symbolic and exact algebra only |

The current Python worker becomes the first `python-vtk`/compatibility adapter;
it is not removed before operation-by-operation conformance is proven.

### Canonical algorithm ownership

Each operation has one named owner. Alternatives are validation, fallback, or
future implementations—not silent competing truth sources.

| Operation family | Initial canonical owner | Alternative role |
| --- | --- | --- |
| OBJ import | existing Math3D importer | none |
| normals and ordinary curvature | existing Math3D analysis | VTK validation/optimization experiment |
| connectivity | existing Math3D analysis | VTK verification |
| repair, robust boolean, remesh | CGAL | explicit unsupported state when unavailable |
| decimation, filter pipelines, volume contour | VTK | future GPU/Math3D implementation |
| symbolic algebra | Sage | explicit local fallback only when mathematically equivalent |

The registry must disclose exactness, numerical method, fallback, and backend
availability in the Inspector/Diagnostics rather than changing semantics
silently.

### Routing policy

Selection considers operation, platform, declared exactness, input size,
resource limits, availability, document revision, and user policy.

| Situation | Route |
| --- | --- |
| desktop robust mesh boolean + local CGAL healthy | local CGAL |
| web/mobile heavy exact boolean | authenticated remote CGAL or explicit unsupported state |
| mobile small local numeric analysis | JS/WASM |
| mobile large analysis | remote backend only after explicit capability/policy check |
| symbolic factorization | Sage remote; never ordinary mesh path |
| backend failure | compatible canonical fallback, or typed unsupported/failed result |

Remote mathematical workers are private. Browser/mobile traffic goes to the
workspace server or gateway, never directly to CGAL, VTK, or Sage containers.

## Scheduling, admission, and cancellation

Adopt four policies rather than one FIFO queue:

| Policy | Typical work | Priority and limits |
| --- | --- | --- |
| `interactive` | picking-adjacent previews | highest; short timeout; small memory budget |
| `analysis` | curvature, topology, diagnostics | normal; cancel when relevant revision changes |
| `heavy` | remesh, boolean, large topology | admitted by memory/concurrency limits |
| `batch` | export, benchmarks, background rebuild | lowest; preemptible and resumable where possible |

Cancellation has two levels:

1. Cooperative cancellation for JS/WASM and protocol-aware workers.
2. Graceful cancel deadline followed by process termination and supervised
   restart for native/VTK/Sage work caught inside a long library call.

No stale result may publish after the job's source revision, operation
fingerprint, or resource fingerprint has changed.

## Backend profiles

### CGAL

Create a standalone C++ process, not a Node/Electron native addon. It should
be runnable with the same protocol locally and in a container. Begin with
repair, robust boolean, remesh, and intersection adapters only after a licensing
review and fixture corpus exist.

Keep concurrency deliberately low and enforce memory/time admission. Pin the
compiler, CGAL, GMP/MPFR, CMake, container base image, and protocol versions in
the release manifest. Add a CI release gate for the selected CGAL license model
before distributing a bundled worker.

### VTK

The existing pinned Python/VTK worker is the initial VTK delivery vehicle. Keep
it as a long-lived supervised process, then separate it from unrelated Python
operations only when resource isolation or independent deployment requires it.
First candidates are connectivity, decimation, filter pipelines, volume
contours, and scientific file preparation. Pin Python wheels, native libraries,
thread settings, and container inputs; carry license notices in release output.

### Sage

Sage is optional and is not bundled in the normal Electron installer. The
current desktop and same-machine web path uses a bounded local WSL worker for
the supported symbolic and polynomial operations; the Docker service remains
an explicit alternative. A private, authenticated container gateway now routes
the two Number Theory operations in the first Phase 6 slice. A broader hosted
pool and federation remain open. Sage is never selected for import, rendering, picking,
normals, or routine mesh work. A legal/distribution review and resource quotas
are prerequisites to enabling it for any hosted deployment.

## Delivery plan

### Phase 0 — architecture freeze and inventory

- Inventory every current browser worker, Electron IPC endpoint, Python worker
  request, proxy endpoint, mobile backend call, and module scheduler.
- Publish operation ownership, current backend, fallback, exactness, input
  limits, and migration status in the registry.
- Freeze the job/result/provenance schemas and compatibility policy.
- Decide M3D resource framing, checksums, temporary-resource cleanup, and
  remote authorization model.

Acceptance: a generated inventory proves that each existing execution path has
an owner and a planned adapter; no feature migration has started.

### Phase 1 — backend-neutral runtime skeleton

- Add `packages/contracts` and the operation registry.
- Add `ExecutionService`, worker registry, capability discovery, diagnostics,
  and a minimal admission queue.
- Implement adapters for existing browser workers, Electron Python worker, and
  web proxy without changing their wire protocols.
- Route one low-risk vertical slice, such as mesh normals/validation, through
  the service while retaining the old entry point as a compatibility facade.

Acceptance: browser, desktop, and proxy adapters return the same canonical
envelope; unsupported capability is explicit; existing focused tests still pass.

### Phase 2 — resource and lifecycle hardening

- Deliver `math3d.mesh.v1` with typed-array round trips and checksum tests.
- Replace large JSON payload crossings in the migrated vertical slice.
- Add cancellation, stale-result rejection, process supervision, health
  negotiation, restart budget, and structured logs.
- Add policy queues and per-backend memory/concurrency budgets.

Acceptance: repeated cancellation/restart and large-resource tests leave no
orphan processes or temporary payloads; an interactive job remains responsive
while a heavy job is queued.

### Phase 3 — CGAL native worker

Phase 3A local Boolean slice (implemented; not the full Phase 3 acceptance gate):

- `native/cgal-worker` is a long-lived, separately supervised CGAL executable.
  Its v1 little-endian frame carries `math3d.mesh.v1` binary resources, with
  version, health, and exact Boolean union/difference/intersection operations.
- Desktop selects this worker for Boolean when its executable is present;
  otherwise the existing Python CGAL path remains available. An operation
  error in the native worker is surfaced, not silently changed to VTK output.
  Browser and mobile keep their existing remote-or-unsupported routing.
- The native supervisor has bounded admission, startup capability negotiation,
  timeouts, process termination on cancellation/stop, restart budget, and
  separate structured diagnostics. The smoke test covers all three Boolean
  operations, malformed-input recovery, and process restart.
- Local Windows development: `npm run build:cgal-native-worker`, then
  `npm run test:cgal-native-worker`. `MATH3D_CGAL_NATIVE_EXE` can select an
  explicit executable. The executable is deliberately **not** added to
  installer resources yet: first complete the CGAL/GMP/MPFR licensing review,
  binary dependency manifest, signed release fixture corpus, and CI license
  gate. Packaged builds continue using the Python compatibility worker.

Phase 3A release-gate follow-up: the real-mesh Boolean and crash/cancellation
suite is `npm run test:cgal-native-release`. The dependency/license inventory
and fail-closed installer policy are documented in
`docs/native-cgal-distribution-review.md`. Native installer inclusion remains
blocked pending public source-bundle integration, a transitive SBOM, and
packaged clean-machine verification; do not mark Phase 3A distribution-ready
from local tests alone.

Remaining Phase 3 work: robust repair, remesh, and intersection migration;
packaged clean-machine conformance and crash/cancellation E2E; container
parity; and completion of the selected public GPL distribution controls.

- Build the standalone C++ transport and local process supervisor.
- Migrate only robust repair, boolean, remesh, and intersection operations.
- Add container parity only after local protocol conformance passes.
- Make browser/mobile route remotely or report unsupported, never emulate an
  exact CGAL result with an unlabelled approximation.

Acceptance: fixtures prove exact/semantic expectations, cancellation restarts
the worker, and CGAL absence leaves all unrelated workflows usable.

### Phase 4 — VTK worker extraction and parity

- Move selected VTK pipeline operations behind the shared VTK adapter while
  preserving the current frozen worker as the desktop packaging mechanism.
- Add remote VTK service/image only after the local worker path is stable.
- Compare overlapping Math3D and VTK operations with tolerances and publish
  provenance rather than replacing existing algorithms by default.

Acceptance: VTK capabilities are independently discoverable, version-pinned,
restartable, and validated across local and server routes.

### Phase 5 — Sage service

- Define the restricted symbolic operation set and schemas.
- Build a private, authenticated gateway adapter with warm-pool, timeout,
  memory, audit, and cancellation policies.
- Add exact-result and failure semantics; no arbitrary executable/source
  submission is part of the public protocol.

Acceptance: symbolic operations are reproducible from recorded inputs and
provenance; Sage absence is a typed capability state, not an application fault.

Workbook Sage result blocks now retain the exact operation request and job ID,
the source module/identity/revision/fingerprint, selected Local WSL, Docker, or Private gateway
backend, the worker-reported SageMath version, the complete result, warnings,
and diagnostics. Surface and Geometry can both save these blocks. Reopening a
Workbook compares its saved source identity with the current Surface definition
or Geometry object and marks changed or missing sources in the block and outline.
The active Surface equation and source ID persist in the same app profile; reopening
after a restart compares saved evidence with the current equation and marks edits stale.
Freeform Sage inputs that are not linked to a saved scene source remain explicitly
unlinked; they are not silently marked current. Trusted Local WSL Workbook Sage code
cells retain exact code, scope, job ID, version, response, warnings, and diagnostics;
changes to code or dependencies mark evidence stale. Trust remains session scoped.
The [provenance and live-gate record](evidence/sage-provenance-cross-runtime-2026-11-04.md)
tracks the required Docker comparison separately from saved-result support.

The bounded WSL worker and optional Docker service remain local delivery slices.
The Phase 6 private gateway now accepts GCD and modular inverse through an
authenticated, quota-limited route; it does not complete the hosted federation
or resource-transport plan. Surface and Geometry Sage operations
now use one shared operation registry and `ExecutionService`, with backend
capabilities discovered from the WSL and Docker health contracts. The shared
broker handles execution, cancellation, and Compute diagnostics; the Sage
client remains only as its transport adapter. Graphs now joins this flow for
symbolic and polynomial operations. Other modules still need to join
this common Services flow.

### Scientific Services UI rollout — implementation sequence

Retain `Scene | Object | View | Analysis | Services | Theory` across modules.
`Services` chooses and runs scientific operations; `Inspector → Analysis`
displays exact or numerical results, diagnostics, provenance, and actions.
The center Viewer displays derived overlays or geometry. Configure runtimes
once in `Compute → Runtimes`; keep a per-run backend choice or capability badge
in Services without duplicating installation settings. Sage coding belongs in
Workbook or an optional docked console.

| Priority | UI change | Scope | Current state / acceptance |
| --- | --- | --- | --- |
| P0 | Refactor Services into a shared panel backed by a contextual operation registry | All modules | Implemented for Surface, Geometry, Graphs, CAS, and Number Theory Sage operations. The shared panel filters contextual operations and invokes one `ExecutionService` registry with no per-run broker or direct feature-side transport path. Extend the same contract to other modules. |
| P0 | Move Docker/WSL configuration and diagnostics into `Compute → Runtimes` | Global | Sage Local WSL and Docker now show availability, reported SageMath version, environment, route, operation limits, and actionable probe errors from the shared registry. Services links directly to this view. Broader runtime profile controls remain in the Compute engine manager. |
| P0 | Add SageMath engine with WSL backend | Services | Surface, Geometry, Graphs, CAS, and Number Theory share the bounded Sage execution registry, capability reporting, cancellation, and Compute diagnostics. Number Theory currently uses Docker; Local WSL does not advertise GCD or modular inverse. Broader module registration remains open. |
| P1 | Add operation-specific result cards and artifact actions | Inspector | Shared Surface, Geometry, Graphs, CAS, and Number Theory Sage cards render expression, vector, matrix, solution set, and error results with backend, SageMath version, warnings, source revision, and freshness. Typed actions allow gradient previews and commits for usable vectors in Surface and Geometry, scalar geometry for usable expressions, and Workbook evidence for every result, including errors. Graph expressions retain object source freshness in Inspector and Workbook. Desktop and web flows cover the shared path. |
| P1 | Visualize a result as an overlay or save it as an object | Viewer | Surface and Geometry now offer explicit preview, discard, and commit actions for Sage gradient overlays and scalar geometry. Surface commits replace the active implicit expression; Geometry commits create a mesh object with serialized Sage source metadata. Commits also save exact Workbook evidence. Linked source changes invalidate live previews and overlays. Gradient overlays remain session-scoped; extend persistent overlay adapters to later modules as needed. |
| P2 | Add a Sage Console bottom dock | Advanced users | Implemented for the trusted Local WSL desktop runtime. The dock shows session state, limits, cancellation, output, and SHA-256 input provenance through the shared `ExecutionService` and Compute job flow. Trust is explicit and session scoped; web and public Docker routes do not accept code. Private runtime support remains open. |
| P2 | Add persistent Sage code cells | Workbook | Implemented as Sage code blocks with saved inputs, output history, exact dependency snapshots, and source freshness in Block, Document, and export views. Each cell uses the shared `ExecutionService` and requires explicit session trust for Local WSL; web and hosted routes cannot execute cell code. Private runtime support remains open. |
| P3 | Add a dedicated CAS/Algebra workspace | Global module | Implemented as a peer scientific workspace with the shared Sage Services catalog, Inspector result cards, and Compute runtime discovery. Exact jobs retain freeform input provenance when saved to Workbook. The Console opens from CAS but code execution still requires explicit trust in the Local WSL desktop runtime; web code execution remains unavailable. Desktop and web flows are covered. |
| P3 | Add a dedicated Number Theory workspace | Global module | Implemented for exact GCD and modular inverse through the shared Sage Services catalog, Inspector result cards, and Compute runtime discovery. Docker is selected by default because these bounded operations are not registered in Local WSL; the authenticated Private gateway is also selectable when configured. Results retain freeform input provenance in Workbook; desktop and web flows cover execution, cancellation, diagnostics, and runtime access. |

The [desktop CAS acceptance record](evidence/cas-algebra-desktop-2026-11-02.md) verifies a real SageMath 9.5 Local WSL calculation, Workbook save/export and independent file reopen, source freshness through shared Surface Services, Console trust, and the absent-Docker capability message. The Docker success path in that earlier gate used a local test service. The later [live Docker Number Theory gate](../services/sage-worker/README.md) ran GCD and modular inverse through SageMath 10.10 on desktop and web, with no mocked `/run` responses.

The [desktop Graph Sage acceptance record](evidence/graph-sage-desktop-2026-11-03.md) verifies a real Local WSL exact factorization from a selected Graph function, current-to-stale Workbook source handling after an edit, bundle and Markdown export, and independent `.math3d` import with unavailable-source status. It also records a Graph preview viewport crash found during the gate and its passing regression check. A forced cold WSL distribution start remains unverified; the recorded first-run time is from a fresh Electron profile and worker.

The [desktop Number Theory Workbook acceptance record](evidence/number-theory-workbook-2026-11-03/README.md) verifies real SageMath 10.10 Docker GCD and modular inverse results, a non-invertible case with its failed response, Workbook save, `.math3d` and Markdown export, and independent import into a fresh Electron profile. Failed results now show their outcome and error in Workbook and Markdown; freeform inputs use an `Input` label in saved text. This gate covers the local Docker service, not the hosted gateway.

The [extended Sage/CAS/Algebra roadmap](math3d-sage-cas-algebra-extended-roadmap-2026-11-03.md) preserves the full proposed object-centric scope and maps **Structures / Operations / Recipes** into the existing CAS / Algebra UI. [SAGE-A01](evidence/sage-a01-schema-2026-11-03.md) supplies versioned algebra object contracts; [SAGE-A02](evidence/sage-a02-project-registry-2026-11-03.md) saves and independently reopens their revision histories in a Project; [SAGE-A03](evidence/sage-a03-dependency-freshness-2026-11-03.md) derives direct and transitive stale status; [SAGE-A04](evidence/sage-a04-bounded-reconstruction-2026-11-03.md) adds bounded Sage reconstruction; [SAGE-A05](evidence/sage-a05-domain-coercion-2026-11-03.md) adds pinned parent descriptors and directional coercion-map checks; [SAGE-A06](evidence/sage-a06-structures-ui-2026-11-03.md) adds the Project Structures explorer and object dossier in CAS; [SAGE-A07](evidence/sage-a07-ring-field-builder-2026-11-03.md) adds the five-kind Ring and Field Builder with validation, exact preview and saved domain facts; [SAGE-A08](evidence/sage-a08-runtime-fixtures-2026-11-04.md) adds route-level runtime capability reporting and a seven-case Sage 9.5/10.10 fixture matrix; [SAGE-B01](evidence/sage-b01-typed-operation-registry-2026-11-04.md) adds typed bounded operations filtered by saved object kind, parent domain, freshness and runtime; [SAGE-B02](evidence/sage-b02-polynomial-dossier-2026-11-04.md) adds a versioned exact `QQ[x]` polynomial dossier recipe; [SAGE-B03](evidence/sage-b03-exact-matrix-2026-11-04.md) adds a bounded exact `QQ` matrix dossier with RREF, kernel, image and minimal polynomial; [SAGE-B04](evidence/sage-b04-smith-hermite-2026-11-04.md) adds verified Smith and Hermite workflows over `ZZ` with cokernel invariants; [SAGE-B05](evidence/sage-b05-contextual-evidence-2026-11-04.md) adds contextual broker runs and validated Project evidence pinned to the selected object revision; [SAGE-B06](evidence/sage-b06-dossier-inspector-2026-11-04.md) adds structured saved-result, structure, verification and execution views in the CAS Inspector; [SAGE-B07](evidence/sage-b07-recipe-dag-2026-11-04.md) adds Project recipe graphs, typed stage dependencies and partial-failure evidence retention. The real Docker 10.10 comparison remains pending while its service is unavailable on this PC. [SAGE-B08](evidence/sage-b08-operation-goldens-2026-11-04.md) adds 16 exact polynomial and matrix result/rejection cases with a reusable Sage 9.5/10.10 comparison gate. Local Sage 9.5 passes; [SAGE-C01](evidence/sage-c01-ideal-objects-2026-11-04.md) adds Project ideal objects pinned to an ambient QQ polynomial ring, a bounded generator builder and an Inspector, with independent Project reopen. The next feature gate is `SAGE-C02`: Gröbner and elimination recipes. The current freeform Services and Workbook paths remain available.

[SAGE-C02–C04](evidence/sage-c02-c04-ideal-workflows-2026-11-04.md) now adds bounded Gröbner and elimination recipes for saved ideals, typed membership with positive and negative normal forms, and versioned quotient rings with pinned dimension evidence. Exact local Sage 9.5 fixtures and a fresh-profile desktop Project reopen pass. The next feature gate is **SAGE-C05**; the real B08 Docker Sage 10.10 comparison remains open.

[SAGE-C05](evidence/sage-c05-syzygy-hilbert-capabilities-2026-11-04.md) adds runtime-advertised ideal syzygies and standard graded quotient Hilbert series with pinned Project evidence. Unsupported grading, homogeneity, size and runtime cases have explicit reasons. The next feature gate is **SAGE-C06**; B08's live Docker Sage 10.10 comparison remains open.

[SAGE-C06](evidence/sage-c06-operation-budgets-2026-11-04.md) now adds explicit standard and expanded ideal budgets, input-cost warnings and an enforced Sage subprocess wall-time cap. Expanded desktop runs require an acknowledgment; older saved evidence without budget metadata still reopens. Track C is complete through C06. The next feature is **SAGE-D01**; B08's live Docker Sage 10.10 comparison remains open.

[SAGE-D01](evidence/sage-d01-number-fields-2026-11-04.md) adds bounded quadratic number-field objects pinned to a saved `QQ` revision. Structures previews and reopens an exact `QQ(√5)` dossier with defining polynomial, discriminants, bases and embeddings; a bounded Sage constructor is available through the advertised reconstruction route. Core, real local Sage 9.5 and independent desktop Project reopen gates pass. The next feature is **SAGE-D02**, sharing field and ideal references across Algebra and Number Theory. B08's live Docker Sage 10.10 comparison remains open.

[SAGE-D02](evidence/sage-d02-shared-number-theory-refs-2026-11-04.md) shares Project field and ideal IDs, definitions and revisions across CAS and Number Theory. [SAGE-D03](evidence/sage-d03-norm-trace-embeddings-2026-11-04.md) adds pinned quadratic norm, trace, embeddings and degree checks. [SAGE-D04](evidence/sage-d04-prime-decomposition-2026-11-04.md) adds bounded prime-ideal factors with ramification and residue degrees and a reusable recipe. Exact core and real local Sage 9.5 fixtures, plus controlled desktop Project export and fresh-profile import, pass. The next feature is **SAGE-D05**. B08's live Docker Sage 10.10 comparison remains open.

[SAGE-D05](evidence/sage-d05-field-tower-2026-11-05.md) adds a saved quadratic-over-quadratic extension and a pinned Structures field-tower diagram. It checks the constructor inclusions and defining relations, the composed `Q ↪ K ↪ L` map and the `2×2=4` tower law. Exact core, real local Sage 9.5 and controlled desktop Project export/fresh-profile import gates pass. The next feature is **SAGE-D06** Galois analysis and subgroup views. B08's live Docker Sage 10.10 comparison remains open.

[SAGE-D06](evidence/sage-d06-galois-correspondence-2026-11-05.md) adds bounded Galois analysis of a pinned `QQ[x]` polynomial and linked complete subgroup/fixed-field lattices. The exact `x⁴−2` local Sage 9.5 fixture, core permutation/group checks, controlled desktop saved evidence and fresh-profile Project reopen pass. The next feature is **SAGE-E01** finite group objects. The separately delivered [B08 live comparison](evidence/sage-b08-live-2026-11-05.md) closed its 16-case 9.5/10.10 matrix; a live Docker D06 run remains untested.

[SAGE-E01](evidence/sage-e01-finite-group-objects-2026-11-05.md) adds Project finite-group records with exact bounded permutation and abelian presentations. The five small fixtures roundtrip with stable IDs and revisions; Structures can preview and save them without Sage. The next feature is **SAGE-E02**, GAP-backed group operations. B08 is closed for its 16-case matrix; live Docker D06 parity remains pending.

[SAGE-E02](evidence/sage-e02-gap-group-operations-2026-11-05.md) adds a capability-advertised GAP dossier of order, center, conjugacy and complete subgroups for saved finite groups. Live Sage 9.5 and Docker Sage 10.10 fixtures for C4, V4, S3, D4 and Q8, exact D4 cross-runtime invariants, independent app checks, Docker HTTP dispatch, and desktop Project export/fresh-profile reopen pass. The next feature is **SAGE-E03** Cayley and subgroup graph scenes.

[SAGE-E03](evidence/sage-e03-finite-group-scenes-2026-11-05.md) adds deterministic, bounded Cayley and subgroup cover scenes from pinned E02 evidence. Standalone JSON and SVG exports retain diagram provenance and verify on independent import; desktop downloads, visual layout and fresh-profile Project reopen pass. The next feature is **SAGE-E04** module presentations.

[SAGE-E04](evidence/sage-e04-module-presentations-2026-11-05.md) adds Project free/presented modules and typed free-module maps with pinned base rings, exact bounded matrices and dimension checks. Core rejection and stale-parent gates plus desktop package export and independent import pass. The next feature is **SAGE-E05** module invariant factors over `ZZ`.

[SAGE-E05](evidence/sage-e05-module-invariant-factors-2026-11-05.md) adds verified Smith-based classification of saved `ZZ` modules, a direct-summand explorer, revision-pinned Project evidence and exact runtime/provenance inspection. WSL Sage 9.5 and Docker Sage 10.10 worker fixtures, core rejection and desktop package export/independent import pass. The next feature is **SAGE-E06** chain complexes and homology.

[SAGE-E06](evidence/sage-e06-chain-complex-homology-2026-11-05.md) links saved free `ZZ` modules and maps into a revision-pinned three-degree chain complex. Exact `d₁d₂=0`, checked Smith homology witnesses, live WSL/Docker fixtures, stale-boundary handling and desktop package export/independent import pass. The next feature is **SAGE-F01** algebraic-locus scene contracts.

**2026-11-05 runtime and evidence update:** The [B08 live WSL/Docker gate](evidence/sage-b08-live-2026-11-05.md) passed all 16 cases on Sage 9.5 and Sage 10.10 with zero differences. The [hosted Private gateway gate](evidence/sage-hosted-workbook-live-2026-11-05.md) saves success, mathematical failure and cancellation to Workbook and checks each after reopening. D05 now exposes pinned Sage evidence and stale-source labels in the field tower. Historical "B08 remains open" notes above describe the earlier state.

Add a small Services preset menu: **Basic**, **Symbolic**, **Numerical**,
**Algebraic Geometry**, and **Number Theory**. Presets filter the contextual
operation catalog and remember the user's view; they do not create separate
workers, routes, result schemas, or runtime installations. Number Theory now
registers GCD and modular inverse through the same contract used by Surface,
Geometry, and Graph.

Delivery gates: first prove one shared Services operation in two modules with
the same request/result envelope and cancellation; then move runtime setup and
diagnostics into Compute; then prove result-card, overlay/object, and Workbook
round trips across desktop and web. Keep Docker and WSL selectable where both
capabilities exist, and report unavailable backends without silently changing
the requested exactness.

### Phase 6 — remote federation and operational release gate

- Add private worker gateway, authenticated resource transport, quotas,
  observability, and deployment manifests.
- Implement local-versus-remote policy, offline behaviour, consent/UI status,
  and data-retention rules.
- Add independent worker images, lockfiles, SBOM/license notices, protocol
  compatibility matrix, and rollback strategy.

Acceptance: an environment matrix proves browser, desktop, web, mobile, local
native, and remote capability states with no direct public access to math
workers.

The first Phase 6 Sage slice is implemented in [`services/sage-gateway`](../services/sage-gateway/README.md):
an authenticated gateway advertises only GCD and modular inverse, enforces
input, output, concurrency, rate, time, container memory, and process limits,
forwards cancellation, and returns typed failures. Desktop main and the local
web proxy hold the credential; the renderer selects this backend through the
same `ExecutionService` registry and Compute diagnostics. The Compose gateway
binds only to loopback, and its Sage worker has no host port. The existing
local Docker route remains selectable. Broader remote resources, identity
provider integration, distributed quotas, rollback, and release
manifests remain open in this phase.

The hosted Sage web session slice now exchanges deployment-assigned per-user
access keys for HTTP-only session cookies through the loopback web proxy behind
an HTTPS reverse proxy. Capability discovery, GCD, modular inverse, typed
failures, cancellation, and Compute diagnostics still use the shared
`ExecutionService`; each user has a separate rate and concurrency quota and
can cancel only their own job. Two independent browser sessions and the
unchanged desktop route are covered by live tests. The Sage worker remains on
its internal Docker network without a published port. Identity-provider
integration, multi-replica shared quota storage, remote resource transport, and
release rollback remain open.

The [local HTTPS edge gate](evidence/sage-https-edge-2026-11-03.md) exposed
that in-memory rate counters reset when the web proxy restarted while signed
sessions stayed valid. The web proxy now requires an access-restricted durable
policy file in hosted mode and retains rate counters, active job leases, login
attempts, and revoked sessions across a restart. This is sufficient for one
proxy process. Multi-replica enforcement still requires a shared transactional
store; the disposable local TLS edge does not replace a production edge audit.

## Conformance and quality gates

Create a shared fixture corpus:

```text
tests/worker-conformance/
  tetrahedron/
  cube/
  torus/
  bunny/
  open-boundary/
  non-manifold/
  degenerate/
```

Test semantic invariants for overlapping numerical implementations:

- component and boundary counts;
- manifold classification and Euler characteristic;
- area/volume bounds;
- positions within epsilon and normals within angular tolerance;
- exact agreement only for operations that explicitly promise exact output.

Every backend also needs protocol, health, cancellation, restart, malformed
resource, capability-absence, timeout, peak-memory, and revision-staleness
tests. CI must run a compatibility matrix for protocol version, platform,
backend availability, and known fallbacks.

## Commit order

```text
arch(workers): define backend-neutral operation registry
arch(workers): define canonical binary resource exchange
feat(runtime): add registry, discovery, and ExecutionService
feat(runtime): add scheduling, admission, and cancellation policies
feat(workers): adapt existing browser, Electron, and proxy transports
test(workers): add protocol and resource conformance fixtures
feat(workers): add supervised native-process transport
feat(workers-cgal): add isolated CGAL repair/boolean/remesh adapters
test(workers-cgal): add deterministic CGAL conformance gate
feat(workers): add supervised Python-process transport
feat(workers-vtk): add VTK pipeline adapters and parity checks
feat(workers-sage): add private Sage symbolic adapter
feat(runtime): add local-versus-remote routing and restart supervision
build(workers): add pinned native/container manifests and license gates
ci(workers): add health, protocol, security, and compatibility matrix
docs(workers): publish backend ownership and deployment guide
```

## Decisions required before implementation

1. Choose the M3D binary container framing and whether desktop uses files,
   shared memory, or both.
2. Define remote data classification, authentication, tenancy, retention, and
   user consent before sending document resources off-device.
3. Complete CGAL and Sage distribution/license review before bundling or hosting
   either backend.
4. Set supported platforms, backend resource limits, and offline behaviour.
5. Approve the canonical-owner table operation by operation; no migration starts
   until ownership and fallback semantics are explicit.

## Definition of done

The platform is complete only when a feature requests an operation through one
contract; the router chooses a healthy compatible backend; resources are not
needlessly JSON-copied; cancellation and restart are safe; the result carries
reproducible provenance; and browser, desktop, mobile, and server state missing
capabilities clearly rather than failing or silently changing mathematics.
