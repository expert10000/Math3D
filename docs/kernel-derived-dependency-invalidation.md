# Kernel derived dependency invalidation

GK02 extends the F07 artifact lifecycle from one document to the cross-document
relations introduced by GK01. `InMemoryDependencyGraph` stores compact relation
records only; domain documents, result payloads, and artifact bytes remain owned by
their existing stores.

## Runtime contract

- Registering a relation validates it through the GK01 canonical relation index and
  rejects a direct or transitive document-generation cycle atomically.
- Queries combine recorded state with the current source resolver. A stale or
  unavailable source can therefore never be presented as a current relation, even
  before an explicit invalidation pass runs.
- `invalidateDocumentSource(currentGeneration)` finds relations that captured an
  older generation of that document and follows document targets in deterministic
  topological order.
- The graph marks relation, result, artifact, and derived-document references stale;
  it never mutates a promoted downstream document.
- Explicit artifact IDs are handed to the F07 registry, which remains the only
  owner allowed to discard bytes or change artifact lifecycle metadata.
- Repeated invalidation is idempotent. A no-op repeat emits no second completed
  event, while returning the same stable invalidation identity and affected closure.
- Reports and completed events are deeply immutable and contain metadata only.

Local or partial invalidation is intentionally absent. GK18 may add it only after a
full-invalidation oracle and benchmark demonstrate equivalent correctness and a
material improvement.
