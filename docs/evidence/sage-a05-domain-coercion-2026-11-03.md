# SAGE-A05 parent domains and coercion — 2026-11-03

## Delivered

`@math3d/core` builds a versioned, size-bounded inspection request from two exact Project object revisions. Each side uses the A04 validated, parent-before-child closure. The parser rejects mixed Project IDs, extra executable fields, forged hashes and missing parents before submission. The shared Sage execution broker advertises `sage.algebra.inspectDomains` for Docker only.

The worker reconstructs both objects with the A04 finite constructor catalog and returns parent descriptors with pinned object and coefficient-domain references, definition hashes, characteristic, exactness, commutativity, field status, variables and monomial order. It asks Sage for canonical coercion maps independently in both directions. A present map receives a deterministic map reference bound to source and target revisions and definition hashes. An absent map returns `NO_CANONICAL_COERCION` with the source and target characteristics and an instruction to choose an explicit conversion or compatible parent. An indeterminate Sage check returns `COERCION_CHECK_FAILED` rather than asserting incompatibility. The result parser checks these references and the map identity against the request.

## Acceptance

- Real SageMath 9.5 in WSL verified `ZZ → QQ` as canonical and `QQ → ZZ` as incompatible. Repeating the request produced the same map reference.
- Real SageMath 9.5 rejected canonical coercion in both directions between the tested `QQ[x,y]` and `GF(5)[x,y]` parents. The descriptors retained their distinct coefficient-domain references, variable order and characteristics.
- The worker rejected mixed-Project and code-bearing snapshots. TypeScript tests cover snapshot validation, descriptor and map-reference tampering, broker routing and typed incompatibility.
- A cross-language probe generated the bounded request in TypeScript, ran the actual worker script under Sage 9.5, and parsed the response in `@math3d/core`. It confirmed the worker's map ID matched the core structural hash. Temporary probe files were removed.
- The focused TypeScript set passed 55 tests across five files; `npm run typecheck:noemit` and `npm run check:kernel:boundaries` passed.
- Capability/catalog regression checks passed 12 tests across three files, and `npm run build:core` passed with its existing large-chunk warning.

## Boundary

The Structures UI and parent inspector are planned for A06. The desktop Local WSL and private-gateway app routes do not advertise the operation. These real-Sage tests exercised the Docker worker code directly through WSL; Docker Desktop's HTTP/container path was unavailable on this PC. Coercion availability is a result of the selected Sage runtime and these exact presentations; a shared abstract ring order alone does not establish a portable conversion.
