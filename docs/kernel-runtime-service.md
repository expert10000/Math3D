# In-memory document kernel

F04 introduces `@math3d/kernel`, the synchronous runtime owner that composes F03's
pure command projector.  It intentionally has no React-store integration, viewer
migration, persistence adapter, worker orchestration, or scientific job lifecycle.

## Ownership boundary

`createInMemoryDocumentKernel` receives canonical JSON initial state, shared command
definitions, and a positive bounded history limit.  Construction validates both the
state and command registry.  Kernel-owned state is never returned directly.

`query(selector)` invokes a selector with recursively frozen state and returns a
detached, recursively frozen canonical-JSON result.  Queries may run while a completed
event is being delivered, so a listener observes the already committed state.

## Transactions

Every transaction supplies:

- a deterministic caller-owned `transactionId`;
- one or more versioned command envelopes;
- `interactive`, `import`, or `replay` execution mode;
- an explicit `reversible` or `irreversible` history policy.

The F03 projector validates the entire forward batch before projection.  A reversible
transaction also supplies inverse commands; the kernel validates and projects them
against the candidate state before commit.  Only then does it replace owned state,
update history, advance the event sequence, and notify listeners.

An irreversible transaction is an explicit checkpoint boundary and clears undo and
redo history.  A new reversible transaction clears redo.  History stores normalized
forward/inverse command batches and is trimmed to the configured limit; it does not
retain unconditional copies of document or artifact state.

## Completed events and subscriptions

The kernel emits these schema-v1 completed facts:

- `document.transaction-committed`;
- `document.history-undone`;
- `document.history-redone`.

Each immutable event carries a monotonic sequence, transaction ID, ordered command
IDs, canonical state hash, and post-operation undo/redo depths.  There are no event
timestamps.  Listeners run synchronously in subscription order from a snapshot of
the listener set.  A listener exception is reported in `listenerErrors` and does not
prevent later listeners from receiving the completed fact.

The cleanup function returned by `subscribe` is idempotent.  Mutating operations are
rejected during event delivery and during query-selector evaluation; read-only
queries remain available to listeners.  This makes nested selector/subscriber
behavior and event order deterministic.

## Failure and next boundary

Forward validation/projection failure, invalid inverse commands, empty history, or a
re-entrant mutation emits no completed event and changes no kernel state or history.
Undo/redo move a history record only after their projection succeeds.

F05 will add revision-safe structured scientific job contracts, cancellation,
deadlines, resource limits, and stale-publication guards.  F04 performs no job or
artifact work and does not imply that current application stores have migrated.
