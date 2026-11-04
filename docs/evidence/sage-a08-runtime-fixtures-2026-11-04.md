# SAGE-A08 runtime capabilities and cross-runtime fixtures — 2026-11-04

## Delivered

CAS / Algebra's Ring and Field Builder now probes the **Local WSL** and **Docker** Sage routes and shows their reported versions and bounded algebra reconstruction capability. The **Runtimes** Inspector reports the same route-level capability for Local WSL, Docker, and the private gateway. An unavailable service, a healthy service lacking the operation, and an app route that filters it out have distinct explanations and next actions. The builder refreshes Docker capability when validating, so a changed service state does not rely on the initial display. A failed health probe never advertises operations through the broker.

The checked-in [seven-case fixture corpus](../../tests/fixtures/sage-algebra/a08-reconstruction.json) covers `ZZ`, `QQ`, composite `Z/12Z`, prime `Z/13Z`, `GF(7^2)`, `QQ[x,y]`, and `GF(7^2)[t]`. The [matrix runner](../../scripts/check-sage-algebra-a08-matrix.py) checks the exact target ID and definition hash, kind, characteristic, field status, and polynomial variables. It compares these mathematical signatures across the real local Sage worker and the Docker HTTP worker when available. Display text, LaTeX, and the particular finite-field polynomial are intentionally excluded from cross-version equality. The fixture writer is deterministic, and a TypeScript test verifies every request and result shape against the core contracts.

The Docker worker image is pinned to the [published SageMath 10.10 tag](https://hub.docker.com/r/sagemath/sagemath/tags/) for this matrix. The runner requires a Sage 10.10 Docker health version when the worker responds; `--require-docker` makes an unavailable Docker worker a failing CI gate.

## Results on this PC

| Runtime | Capability | Fixture result |
|---|---|---|
| Local WSL Sage 9.5 | Healthy for existing bounded local operations; algebra reconstruction is not advertised by the application route | 7/7 fixtures passed through the same worker constructor code |
| Docker Sage 10.10 | Docker daemon and `127.0.0.1:8767` worker unavailable | Real HTTP comparison pending; [machine-readable result](sage-a08-runtime-matrix-2026-11-04.json) records the skip |
| Controlled Sage 10.10 HTTP response | Advertises reconstruction | Comparison path matched all seven signatures and rejected an altered characteristic |

The controlled response tests the matrix transport and mismatch gate. It does not establish Sage 10.10 mathematical compatibility; that remains conditional on starting the real Docker worker.

## Acceptance commands

```powershell
python scripts/write-sage-algebra-a08-fixtures.py
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/janko/OneDrive/Dokumenty/Math3D && sage -python scripts/check-sage-algebra-a08-matrix.py --output test-results/sage-a08-runtime-matrix.json'
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/janko/OneDrive/Dokumenty/Math3D && sage -python -m unittest scripts.test_sage_algebra_a08_matrix -v'
```

For the required Docker gate after Docker Desktop is running:

```powershell
docker compose -f services/sage-worker/docker-compose.yml up --build -d
wsl -d Ubuntu -- bash -lc 'cd /mnt/c/Users/janko/OneDrive/Dokumenty/Math3D && sage -python scripts/check-sage-algebra-a08-matrix.py --require-docker --output test-results/sage-a08-runtime-matrix.json'
```

`npm run typecheck:noemit`, `npm run build:core`, 49 focused Vitest tests, two Python matrix tests, and four desktop CAS tests passed. The existing Services/Workbook flow remained working. The next roadmap gate is **SAGE-B01**, a typed algebra operation registry that filters actions by object kind and parent domain.
