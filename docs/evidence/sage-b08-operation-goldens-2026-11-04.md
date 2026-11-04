# SAGE-B08 polynomial and matrix cross-runtime gate — 2026-11-04

## Delivered

The [versioned 16-case corpus](../../tests/fixtures/sage-algebra/b08-operations.json) pins nine exact result cases and seven invalid-input cases for the bounded polynomial dossier, exact `QQ` matrix dossier, and `ZZ` Smith/Hermite worker operations. The polynomial cases cover split, repeated and irreducible-over-`QQ` inputs. Matrix cases cover singular, rectangular and Jordan blocks. Integer forms cover diagonal, nontrivial and tall matrices. Rejections cover zero or out-of-domain polynomials, a degree-budget breach, noncanonical/ragged rational matrices, fractional integer entries and a dimension-budget breach.

The [matrix gate](../../scripts/check-sage-algebra-b08-matrix.py) checks the exact golden fields and response schemas on local Sage worker code, then checks the pinned Docker Sage 10.10 HTTP route when healthy. It checks Smith diagonal divisibility and cokernel invariants, and independently verifies any reported Smith/Hermite unimodular transformation identities. The cross-runtime comparison uses the declared exact results and transformation statuses; raw transformation matrices, LaTeX, timings and diagnostic text are excluded because they are not canonical mathematical results. Every failed case and difference is written to the machine-readable report. `--require-docker` turns an unavailable Docker route into a failed gate.

## Results on this PC

| Route | Status | Result |
|---|---|---|
| WSL Sage 9.5, direct worker implementation | Available | 16/16 goldens and rejections passed. This invokes the same worker operation code, while the desktop Local WSL app route does not advertise these three object-linked operations. |
| Docker Sage 10.10 HTTP worker | Unavailable | Docker Desktop Linux daemon is absent and `127.0.0.1:8767` refused the health request. No real 10.10 result or cross-version equality is claimed. |
| Private gateway | Not a supported route for these operations | The app's operation registry excludes the private gateway for polynomial and matrix dossier requests. |
| Controlled 10.10 response | Test double only | All 16 signatures matched. Changing a golden matrix rank failed the comparison; a required unavailable route failed the health gate. |

The [machine-readable run](sage-b08-runtime-matrix-2026-11-04.json) records local signatures, Docker unavailability and the current empty difference list. The empty list means no two live runtimes were compared. When Docker Sage 10.10 is available, run the required gate and replace this report with the live comparison before claiming B08 cross-runtime acceptance.

## Acceptance commands

```powershell
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/janko/OneDrive/Dokumenty/Math3D-Sage-CAS-roadmap && sage -python scripts/check-sage-algebra-b08-matrix.py --output test-results/sage-b08-runtime-matrix.json'
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/janko/OneDrive/Dokumenty/Math3D-Sage-CAS-roadmap && sage -python -m unittest scripts.test_sage_algebra_b08_matrix -v'
docker compose -f services/sage-worker/docker-compose.yml up --build -d
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/janko/OneDrive/Dokumenty/Math3D-Sage-CAS-roadmap && sage -python scripts/check-sage-algebra-b08-matrix.py --require-docker --output test-results/sage-b08-runtime-matrix.json'
```

The 17 focused worker tests, four matrix-gate tests, 56 focused Vitest tests, and the live local 16-case run pass. `--require-docker` exits with the expected unavailable-route failure. The Docker command remains pending on this PC.

## Next

**SAGE-C01** adds Project ideal objects and an Inspector that saves and independently reopens their ambient ring, generators and revision. The required Docker B08 gate remains open until that route is available.
