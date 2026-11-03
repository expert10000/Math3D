# SAGE-A04 bounded algebra reconstruction — 2026-11-03

## Implemented path

`@math3d/core` builds a versioned, 32 KiB snapshot of the exact target revision and its pinned dependency closure, ordered parents before children. It validates A01 hashes and references, rejects unrelated records and executable fields, and enforces worker limits before submission. The shared Sage `ExecutionService` advertises `sage.algebra.reconstruct` only for the Docker backend. Local WSL and the private gateway report it unavailable through capability discovery.

The Docker worker independently validates the request and reconstructs integer rings, rational fields, modular rings, canonical finite fields and polynomial rings by calling finite Sage constructors. It does not use `eval`, `exec`, or Sage source from the request. The result carries the target revision, definition hash, kind, exact characteristic, field status, display and LaTeX text, and polynomial parent and variables. A typed result parser checks these against the requested target. Historical `R@1 = QQ[x,y]` and current `R@2 = GF(5)[x,y]` produce separate pinned snapshots; no stale object is silently rebound.

## Verification

- TypeScript tests cover closure order, historical revisions, bounds, forged hashes, code-bearing inputs, broker capability discovery and response matching. The focused A04, Sage Services, capability and Project registry set passed 74 tests across eight files.
- Four tests ran against real SageMath 9.5 in WSL, including the worker's subprocess script entry point. They reconstructed `QQ[x,y]`, `GF(5)[x,y]`, `ZZ`, `Z/12Z` and `GF(5)`, and rejected tampered or executable input.
- A separate cross-language probe generated the exact request with the TypeScript Project snapshot builder, passed those bytes to the worker script under real SageMath 9.5, and verified its successful `QQ[x,y]` metadata and matching definition hash. Temporary probe files were removed.
- `npm run check:kernel:boundaries` passed with no dependency violations.
- `npm run typecheck:noemit` and `npm run build:core` passed. The build reported its existing large-chunk warning.
- Docker Desktop's Linux daemon was unavailable on this PC, so the live Docker HTTP route and SageMath 10.10 response remain an A08 cross-runtime gate. The WSL check ran the same worker code directly; it is not a claim that the desktop Local WSL app route advertises this operation.

## Boundary

The Structures UI is still A06; no constructor control has been added to CAS / Algebra. Richer parent/coercion descriptors are A05. Arbitrary Sage code remains behind the separate trusted Console and Workbook cell path.
