# GK18 dependency-local invalidation evidence

## Decision

The full GK02 dependency traversal remains the default and the correctness
oracle. `InMemoryDependencyGraph` now offers an opt-in `dependency-local`
strategy for graphs with at least 512 relations. It indexes relations by exact
source document and source generation, then visits only the downstream
document-relation closure. Smaller graphs fall back to the full traversal.

The local strategy changes *how* the same affected relations are found, not
which results or artifacts become stale. Reports carry `dirty-local` or
`dirty-global` scope and the exact document-dependency affected region. The
report ID, relation/target ordering, stale status, and artifact invalidation
remain identical between strategies.

An optional changed-object/cell/face/edge/vertex set is a validated contract,
but no element-level resource footprint is yet proved. Supplying such a set
therefore forces the full traversal. In particular, this change does **not**
enable partial mesh-normal, mesh-topology, or Volume-grid recomputation.

## Correctness gate

`npm run test:kernel:gk18` compares full and local reports, relation and target
freshness, repeated idempotent invalidation, dynamically registered downstream
relations, and artifact availability. The parity suite includes 24 seeded DAGs.
The existing GK02 tests remain the full-oracle baseline. A local strategy must
never be selected on an unproved element footprint.

## Reviewed microbenchmark

Command: `npm run bench:kernel:gk18`

- Fixture: 640 relation pairs in a sparse workspace; one changed source has one
  dependent result and 639 independent sources remain current. Both graph
  instances are constructed before timing, and the changed source is already
  invalidated. The timed call measures repeated deterministic invalidation,
  not graph construction, artifact storage, rendering, or computation.
- Host: Windows, Intel Core i9-12900K; Vitest 4.1.0; 2026-09-17.
- Full traversal: mean 1.3239 ms, 755.33 operations/s, 378 samples.
- Indexed dependency-local traversal: mean 0.0322 ms, 31,084.60 operations/s,
  15,543 samples.
- Observed improvement: 41.15× for this sparse graph fixture.

This is evidence for the opt-in *graph traversal* strategy only. It is not an
end-to-end app speedup claim; dense graphs or artifact-heavy workloads may show
less benefit. The default full strategy remains available for fallback and
diagnosis. Re-run the benchmark on target hardware before changing the default
or adding a resource-specific local strategy.
