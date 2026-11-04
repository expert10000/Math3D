# SAGE-D04 quadratic prime decomposition recipe — 2026-11-04

Selected D01 number fields now offer **Prime ideal decomposition** for a rational prime `2 ≤ p ≤ 97`. A typed request carries the exact pinned field closure. The Sage worker factors `(p)` in the reconstructed field and returns each prime ideal's display, ramification index `e`, residue degree `f` and norm, plus the splitting class. The core checks primality, the quadratic discriminant splitting criterion, the expected number of factors, `Σef=2`, factor norms `p^f`, and distinct split factors before retaining evidence. The Inspector shows the structured factors and provenance. The number-field starter recipe saves a reconstruction stage, a norm/trace stage and a prime-decomposition stage with typed dependencies, hashes and partial-failure behavior from B07.

**Acceptance:** Real local Sage 9.5 factors `(2)`, `(5)` and `(11)` in `QQ(√5)` as inert `(e,f)=(1,2)`, ramified `(2,1)`, and split twice `(1,1)` respectively; norms are `4`, `5`, and `11` for each split factor. Invalid primes, forged factor norms and mismatched target snapshots are rejected. A controlled desktop run saves both D03 and D04 evidence, creates and runs the three-stage recipe, exports the Project and reopens all five evidence records in a fresh profile. The worker's standalone script path used by the service adapter is also checked.

D04 retains prime-ideal factors as typed calculation evidence pinned to the field. It does not create separate editable Project ideal objects. The gate is limited to bounded quadratic fields and small rational primes; general number fields and tower operations remain later Track D work. **B08's live Docker Sage 10.10 comparison remains open.**

**Next:** SAGE-D05 extension tower viewer.
