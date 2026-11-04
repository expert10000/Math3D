# SAGE-B02 polynomial dossier recipe — 2026-11-04

## Delivered

The bounded `sage.polynomial.dossier` operation accepts a polynomial in one variable of a saved polynomial ring whose direct coefficient domain is `QQ`. The B01 registry supplies the selected object revision, rejects stale or archived objects, and builds the Docker request. The worker returns a versioned, exact `QQ[x]` dossier with degree, leading and constant coefficients, content, primitive part, derivative, `gcd(f,f')`, square-free status and decomposition, factorization with unit and multiplicities, irreducibility over `QQ`, discriminant, and rational roots with multiplicities. `rationalRoots` is explicitly limited to `QQ`; an empty list does not claim that there are no algebraic or complex roots.

The worker rejects zero polynomials, unknown variables, extra request fields, executable syntax, exponents over 16, degree over 16, and coefficients above 256 bits. The core parser rejects extra or malformed result fields, mismatched coefficient domain and variable, invalid multiplicities and roots, and oversized result strings. The operation is advertised only by the Docker Sage route. CAS → Algebra → Operations lists it when a current, fresh, univariate `QQ` polynomial ring is selected; the existing object-linked execution and evidence controls remain scheduled for B05.

## Acceptance

- Live SageMath 9.5 in WSL ran six B02 worker tests. `x²−1` returned factors `x+1` and `x−1`, rational roots ±1, derivative `2x`, `gcd(f,f')=1`, and discriminant `4`. `(x−1)²` returned a repeated root, square-free factor multiplicity 2, and discriminant `0`. `x²+1` and `x⁴−2` were irreducible over `QQ` with no rational roots. `2x²−2` retained content `2` and primitive part `x²−1`; a nonzero constant returned degree 0 and no discriminant.
- The worker script entry point returned a successful envelope with Sage version. A shared JSON fixture is checked by both Sage and TypeScript tests. Core tests verified the selected `QQ[x]` request and rejected mismatched or malformed results. Broker tests verified Docker-only discovery and rejected multivariate input.
- The post-merge core and renderer build, 53 focused Vitest tests, 15 Sage worker tests and both desktop Structures tests passed. The end-to-end TypeScript config now resolves core from its own checkout, avoiding another worktree's in-progress files through shared `node_modules`. The standard `npm run typecheck:noemit` gate passed after this correction. Docker is unavailable on this PC, so the live calculation used the same Sage runner under WSL rather than the Docker HTTP transport.

## Next

**SAGE-B03** expands exact matrix operations: RREF, kernel, image and minimal polynomial. **SAGE-B05** adds contextual object-linked execution and saved evidence for typed operations, including this dossier.
