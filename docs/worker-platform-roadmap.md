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

Phase 2 is in progress: `math3d.mesh.v1` now defines a checksum-verified,
typed-array binary resource for indexed mesh payloads. OBJ-worker migration and
resource lifecycle hand-off are the next increments.

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
- Deliberately deferred: migrating binary-heavy mesh/OBJ payloads to M3D
  resources, and splitting the bundled Python worker into independently
  deployed VTK/CGAL services.

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

Sage is container-first and optional. It is not bundled in the normal Electron
installer and is never selected for import, rendering, picking, normals, or
routine mesh work. Use a warm, bounded pool behind the private gateway for
symbolic algebra and exact calculations. A legal/distribution review and
resource quotas are prerequisites to enabling it for any hosted deployment.

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
