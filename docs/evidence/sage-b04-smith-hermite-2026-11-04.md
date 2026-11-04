# SAGE-B04 Smith and Hermite workflows — 2026-11-04

## Delivered

The bounded `sage.matrix.integer_forms` operation accepts a 1–6 by 1–6 matrix over a selected saved `ZZ` domain. Inputs use a versioned schema and canonical signed decimal entries of at most 18 digits. Sage returns Smith diagonal and form, row-Hermite form, rank and a cokernel decomposition. For an `m×n` presentation matrix, the cokernel free rank is `m−rank(A)`; torsion orders are the nonunit nonzero Smith factors.

When Sage supplies transformation matrices, the worker checks `U·A·V=D` for Smith and `U·A=H` for row-Hermite, and checks all transformations are unimodular over `ZZ`. The core parser independently verifies the same identities with exact `BigInt` arithmetic, Smith diagonality and invariant-factor divisibility, source matrix identity, rank and cokernel data. If a runtime returns only the forms, the result explicitly labels transformations unavailable and contains no unverified matrices.

The B01 registry lists this operation for a current, fresh integer-ring object and excludes `QQ`, finite fields and polynomial rings. CAS → Algebra → Operations shows the compatibility entry. Object-linked run controls and saved evidence remain B05.

## Acceptance

- Live SageMath 9.5 returned Smith diagonal `(2,6,0)` and `coker(A) ≅ Z/2Z ⊕ Z/6Z ⊕ Z` for the 3×3 diagonal fixture. The same JSON fixture passed the TypeScript parser.
- Nontrivial 2×2 and rectangular matrices returned verified unimodular transforms. A tall 3×1 matrix returned free cokernel rank 2; a zero matrix returned full free cokernel rank. Invalid strings, ragged or oversized matrices, forged transformation identities and inconsistent torsion data were rejected.
- Worker, core, broker and desktop Structures acceptance tests passed. `npm run build:core`, `npm run typecheck:noemit` and `npm run check:kernel:boundaries` passed. Docker is unavailable on this PC, so live calculations used the same Sage runner under WSL.

## Next

**SAGE-B05** adds contextual object-linked run controls and saved evidence for typed operations. **SAGE-B06** presents structured dossiers in the Inspector.
