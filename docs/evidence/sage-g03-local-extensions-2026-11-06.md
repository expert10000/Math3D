# SAGE-G03 quadratic local extensions acceptance

Open **Number Theory → Quadratic local extensions · ramification**. Choose a saved quadratic number field, an odd rational prime `p` from 3 to 31 and `Qp` precision from 2 to 16 digits. The Docker Sage operation pins the field and its `QQ` parent to exact Project revisions. Saved evidence shows the path from the global field through each prime ideal to its finite-precision local model, with splitting type, ramification index `e`, residue degree `f`, local degree `ef`, residue-field order, ideal norm, uniformizer, normalized valuations and split-root residue when applicable.

Sage 9.5 reports `NumberField.completion()` as unimplemented. G03 therefore constructs `Qp` extensions from the pinned polynomial for inert and ramified branches, and matches split `Qp` roots to prime ideals through the generator's residue map. The UI calls them **local models** and does not claim a canonical completion map or implicit isomorphism. Primes dividing the defining power-basis index are rejected because reduction of that basis can misidentify local branches.

The versioned result is independently checked on Project import. The field discriminant determines split/inert/ramified behavior; every branch must have the expected `(e,f)`, `ef`, norm `p^f`, residue order `p^f`, uniformizer valuation 1 and base-prime valuation `e`. Split roots must be distinct, ordered by residue, match their ideal residue maps and satisfy the pinned polynomial modulo `p^N`. The exact field/parent snapshots and result hash are retained in the Project evidence certificate.

The live fixture `K = QQ(√5)` gives inert `p=3` with `(e,f)=(1,2)` and residue order 9; ramified `p=5` with `(2,1)` and residue order 5; and split `p=11` with two `(1,1)` branches whose generator residues are 4 and 7. An even or composite prime, oversized prime, and an index-dividing prime are rejected.

Acceptance results (2026-11-06): WSL Sage 9.5 and Docker Sage 10.10 each passed all four `service.test_local_extensions` tests. The published Docker `/run` route passed all three splitting examples using `sage -python -m service.local_extensions_http_smoke`. The core and broker Vitest selection passed 71 tests; `npm run build:core` and `npm run typecheck:noemit` passed. The desktop Playwright test passed one end-to-end case, saving the three studies and reopening them in a fresh profile. No e/f, residue-order, or split-root discrepancy was observed between the supported Sage routes.

Next: **SAGE-G04**, elliptic curve objects.
