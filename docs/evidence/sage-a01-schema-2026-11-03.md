# SAGE-A01 algebra object schema acceptance — 2026-11-03

## Scope

`@math3d/core` now exports schema-v1 algebra records for integer rings, rational fields, modular rings, canonical finite fields and polynomial rings. A record carries a stable `math3d:algebra` ID, revision, discriminated declarative definition, exact revisioned dependencies and a canonical SHA-256 definition hash. The schema does not store Sage source code or a live Sage object.

The gate constructs `Q` as a rational field and `R = QQ[x,y]` as a polynomial ring whose coefficient-domain reference points to `Q@1`. Serializing and reopening `R` preserves its ID, revision, variable order, monomial order, parent reference, dependency list and content hash exactly. Reordered JSON object fields produce the same serialization and hash; changing the order of `x` and `y` changes the definition hash.

## Rejection gate

The focused tests reject unsupported object kinds, unknown definition fields, malformed and self references, zero revisions, missing or duplicate variables, executable-looking variable names, unsupported monomial orders, invalid or oversized moduli, composite field characteristics, invalid field degrees, forged dependencies, forged hashes, mismatched kinds, extra record fields and unsupported schema versions. Direct input also passes through the existing strict canonical JSON validator.

## Verification and boundary

- `npm --prefix renderer test -- src/core/algebraObjects.test.ts src/services/sageOperationExecution.test.ts` — 60 tests passed across the A01 contract and the existing Sage execution path.
- `npm run typecheck:noemit` — passed for the repository TypeScript projects after correcting the saved Mesh comparison note-target branch.
- `npm run build:core` — passed on the merged A01 and private Sage gateway tree.

A01 validates one record's syntax and internal consistency. It does not resolve parent IDs against a saved project, prove a finite-field construction's runtime behavior, mark descendants stale, or reconstruct Sage objects. Those are A02–A04 gates. The CAS / Algebra and Number Theory UI flows are unchanged.
