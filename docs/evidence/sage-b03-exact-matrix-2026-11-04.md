# SAGE-B03 exact matrix operations — 2026-11-04

## Delivered

The bounded `sage.matrix.linear_dossier` operation analyzes a 1–8 by 1–8 matrix over a selected saved `QQ` domain. Its versioned input accepts reduced canonical rational strings. Sage returns exact reduced row echelon form, pivot columns, rank, right-kernel basis and image basis. Basis vectors are rows of the returned arrays; image vectors are the original pivot columns. Square matrices also return the minimal and characteristic polynomials in `t`; rectangular matrices explicitly return `null` for both.

The B01 object registry lists matrix analysis for a current, fresh `QQ` object and excludes `ZZ`, polynomial rings and incompatible routes. It pins the saved object revision and validates the matrix request. The result parser checks the returned source matrix and dimensions, canonical fractions, RREF pivot structure, exact `A·v=0` kernel witnesses and image columns. The worker rejects extra fields, executable strings, noncanonical fractions, ragged or empty matrices and dimensions above eight. The operation is advertised only by the Docker Sage route. CAS → Algebra → Operations lists compatibility; object-linked run controls and saved evidence remain B05.

## Acceptance

- Live SageMath 9.5 returned rank 1, RREF `[[1,2],[0,0]]`, kernel basis `[[-2,1]]`, image basis `[[1,2]]` and minimal polynomial `t²−5t` for `[[1,2],[2,4]]`. Sage and TypeScript tests checked the same JSON fixture.
- A 2×3 rank-one matrix returned two kernel vectors and `null` minimal polynomial. A Jordan block returned `(t−1)²`. Rational entries and a zero matrix remained exact. Malformed values and forged result witnesses were rejected.
- The worker script entry point returned the versioned Sage envelope. Focused Vitest and worker tests, the desktop Structures check, `npm run build:core`, `npm run typecheck:noemit` and `npm run check:kernel:boundaries` passed. Docker is unavailable on this PC; the live calculations ran through the same Sage runner in WSL.

## Next

**SAGE-B04** adds Smith and Hermite workflows over `ZZ`, with explicit transformation and invariant verification where supported. **SAGE-B05** adds contextual object-linked execution and saved evidence.
