# Revisioned artifact registry

F07 adds an in-memory artifact registry to `@math3d/kernel`.  It is the authoritative
cache boundary behind F06 artifact handles: encoded grids, sparse matrices, meshes,
and binary outputs live as detached bytes inside the registry, while documents,
events, result envelopes, and UI state see only compact metadata.

Existing module workers and result stores are not migrated by F07.  The registry is
a UI-independent reference implementation for later Topology and Complex adapters;
it does not put a second cache into React or localStorage.

## Managed metadata

Every declaration binds one F06 handle to:

- exact document ID, revision, structural hash, and generation;
- one cache `ownerId` and an encoding;
- `available` or `unavailable` availability;
- `clean`, `dirty`, `computing`, or `failed` lifecycle status;
- registry-computed byte length and SHA-256 checksum when clean and available;
- a compact structured failure only in the failed state.

Metadata snapshots are canonical JSON, recursively frozen, sorted by artifact ID
when listed, and never contain bytes.  Lifecycle events likewise contain metadata
only.  A caller cannot provide or override byte length or checksum: publication
copies the supplied `Uint8Array`, enforces the configured size limit, and computes
both values over the registry-owned copy.

## Lifecycle

`declare` creates a dirty/unavailable entry.  `beginComputation` clears old bytes and
makes it computing/unavailable.  `publish` atomically installs detached bytes and
makes it clean/available.  `fail` clears bytes and records a compact failure.  A
retry can move a failed or dirty entry back through computing to clean.

Every mutating operation verifies the declaration's exact source against the
registry's current-source resolver.  Explicit `resolve(handle, source)` checks the
same guard and returns a fresh byte copy only for a matching clean/available entry.
Missing, stale, source-mismatched, handle-mismatched, dirty, computing, and failed
lookups return explicit unavailable records without bytes.

## Full invalidation

`invalidateDocumentSource(currentSource)` performs F07's intentionally coarse
invalidation policy.  It selects all declarations for that document whose complete
source generation differs from `currentSource`, sorts them by artifact ID, clears
their bytes/checksum/size/failure, and marks them dirty/unavailable.  Current-source
entries and entries owned by other documents are unchanged.  Repeating the same
invalidation is an idempotent no-op.

Dependency-local dirty propagation remains deferred.  Later adapters must call full
invalidation as part of their source-revision commit boundary before publishing or
resolving derived artifacts.

## Ownership, cleanup, and events

An artifact ID has exactly one cache owner.  Other owners cannot redeclare, publish,
fail, or remove it.  `releaseOwner` removes all entries for one owner in sorted order
and is safe to call repeatedly; explicit `remove` is also idempotent for an absent
ID.  Removing an entry clears its retained byte reference.

Declaration, computing, publication, failure, invalidation, and removal emit
monotonically sequenced immutable facts.  Listener delivery uses snapshot order,
listener exceptions are isolated, and registry mutation during delivery is rejected
so nested writes cannot make ordering ambiguous.

## Deliberate F08 boundary

F07 owns in-memory bytes and cache metadata only.  It does not define worker routing,
capability discovery, transport protocols, retries, or remote execution.  Those are
the F08 execution-broker boundary.  Persistent artifact storage and domain-store
migration also remain later work.
