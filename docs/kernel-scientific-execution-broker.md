# Capability-aware scientific execution broker

F08 adds a transport-neutral routing layer to `@math3d/kernel`.  It consumes the F05
scientific-job request/result contract, discovers backend capabilities, selects one
deterministically, and applies cancellation, deadline, retry, fallback, and protocol
validation policy without knowing Topology or Complex algorithms.

No existing browser worker, Electron IPC, Python, CGAL, VTK, Sage, or native route is
migrated in F08.  Domain adapters opt in later, and optional backends remain optional.
The broker has no React, Three.js, DOM, Electron, network, or process dependency.

## Capability discovery

Each configured backend has a stable ID/version, transport kind (`in-process`,
`worker`, or `remote`), integer priority, and an explicit cancellation declaration.
Discovery returns availability plus operation capabilities.  Every operation names:

- its F05 namespaced operation type;
- retry safety: `never` or `idempotent`;
- maximum input, output, memory, and work limits.

Snapshots are strict, canonical, immutable, and ordered by descending priority with
backend ID as the tie-break.  A thrown or malformed discovery response becomes an
unavailable snapshot with a bounded diagnostic.  It does not abort discovery of
other backends.

## Routing

The broker filters available capabilities by operation and declared limits before
transport is invoked.  It then uses capability order deterministically.  A caller
may provide an ordered backend preference and may disable fallback; these choices
affect only that submission and do not mutate global backend state.

If no backend can satisfy the operation and limits, the broker returns
`capability-unavailable` with no attempts.  Existing workers are not silently chosen
outside the configured backend list.

## Retry and fallback safety

Backends communicate transport failures using `ScientificTransportError` with
`transport-unavailable`, `transport-failed`, or `protocol-error`.  Only a transient
transport error on a capability explicitly marked `idempotent` may retry.  Attempts
per backend are finite and configured from 1 through 10.  After those attempts, the
broker may fall back to the next capable backend.

Operations marked `never` stop after the first transport failure even if that error
is transient.  Scientific F05 failures, protocol violations, cancellation,
deadline, and stale-source outcomes never retry or fall back.  The returned outcome
contains compact backend/transport/attempt metadata so routing decisions remain
inspectable.

## Cancellation and deadline

`cancel(jobId)` propagates to the active backend when it advertises cancellation and
also resolves the broker result immediately.  Completion does not wait for a backend
to acknowledge or return.  The request's absolute F05 deadline covers discovery,
all retry attempts, and fallback.  Deadline completion likewise requests backend
cancellation and does not wait for an uncooperative transport.

Late transport results are observed by the promise machinery but cannot replace the
already completed broker outcome.  Backend adapters remain responsible for stopping
their own resources when possible.

## Result protocol guard

Before accepting an F05 outcome, the broker validates exact schema, job ID, operation
type, source document/revision/hash/generation, scientific failure code, canonical
output, and reported UTF-8 byte length.  Successful output must remain within the
request limit.  The broker then re-resolves the current source immediately before
publication; a changed source returns `stale-source`.

A malformed backend outcome is `protocol-error`, not a scientific result.  A valid
F05 failure is preserved under `scientificFailure` and is not relabelled as a
transport problem.

## Local F05 adapter

`createInProcessScientificBackend` exposes an existing
`InProcessScientificJobService` as an optional `in-process` backend.  It forwards the
unchanged request and cancellation call.  Its capabilities remain explicit and are
provided by the caller, so the adapter does not infer or broaden operation support.

F09 is not defined by this roadmap.  The next planned program phase is Topology T01;
worker-specific broker adapters should be introduced only by the domain commit that
can verify their compatibility and scientific behavior.
