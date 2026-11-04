# SAGE-C02–C04 saved ideal workflows — 2026-11-04

## Delivered

**C02 — Gröbner and elimination.** A saved, current ideal in a direct `QQ` polynomial ring can run a bounded Gröbner basis or eliminate a proper nonempty subset of its ambient variables. CAS → Algebra → Recipes offers an ideal graph with Gröbner, elimination and membership stages. The elimination result is computed by Sage's elimination ideal operation, rather than relabeling an ordinary basis. Results carry the selected ideal revision, definition hash, ambient ring revision and monomial order through a versioned request. The saved evidence Inspector shows the basis and the pinned inputs.

**C03 — membership and normal form.** CAS → Algebra → Operations accepts one typed polynomial in the ideal's ambient variables, returns both `member` and the exact Sage normal form, and saves positive and negative outcomes as distinct Project evidence. The result parser rejects an inconsistent member/zero-normal-form pair. The Inspector distinguishes the worker's reported mathematical result from the envelope and Project pin checks.

**C04 — quotient and dimension.** An ideal dossier can save a versioned quotient-ring object with a stable ID, hash, revision, and explicit references to both the ideal and its ambient ring. The Project registry rejects a quotient whose ring differs from the ideal's pinned ring. Quotient Operations and Recipes expose a dimension query. Its evidence is pinned to the quotient object and ideal definition; the Inspector shows the integer dimension and quotient presentation reported by Sage. Parent revisions remain in exported `.math3d` Projects.

All four worker operations enforce at most three variables, six generators, 128 characters per generator or membership polynomial, polynomial degree at most 16, at most 128 input terms, and bounded result sizes. The core rejects stale or archived inputs before running. The worker rejects unknown request fields, foreign variables, oversized exponents and integer literals, and alternate `**` exponent syntax.

## Exact fixtures and acceptance

For `R = QQ[x,y]` with lex order and `I = ⟨xy−1, y−1⟩`, live local Sage 9.5 produces:

| Gate | Query | Exact result |
| --- | --- | --- |
| C02 | Gröbner basis | `[x - 1, y - 1]` |
| C02 | Eliminate `x` | `[y - 1]` |
| C03 | `x−1 ∈ I` | `true`, normal form `0` |
| C03 | `x ∈ I` | `false`, normal form `1` |
| C04 | `dim(R/I)` | `0` |

The Sage test also rejects a foreign variable, degree 17, an `**` exponent, a 19-digit literal, executable syntax, invalid elimination sets and unknown fields. Core tests independently export/import a Project containing `Q`, `R`, `I`, the quotient `RmodI`, and five evidence records; they verify pinned hashes, revisions and both membership outcomes. They reject a quotient with the wrong ring and a forged ideal request hash. The desktop test runs the ideal recipe and quotient dimension through a controlled HTTP worker, exports the Project, then reopens the same bytes in a fresh app profile and finds the quotient and saved result.

Validation run on 2026-11-04: 4 live Sage 9.5 worker tests, 81 focused unit tests, one desktop acceptance test, TypeScript typecheck, core build and kernel dependency boundaries passed. The desktop HTTP fixture exercises routing, UI, Project persistence and inspection; the exact arithmetic fixtures run in the real local Sage 9.5 process. The B08 comparison against live Docker Sage 10.10 remains **open** because that runtime is unavailable here. No cross-version equivalence is claimed.

## Next

**SAGE-C05** gates syzygy and Hilbert operations by runtime capability, with explicit unsupported cases. **SAGE-C06** expands operation budgets and cost warnings. Run the pending B08 live Docker Sage 10.10 comparison when the runtime is available.
