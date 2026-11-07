# SAGE-F08 real-backend desktop regression — 2026-11-05

The opt-in `npm run test:sage:f08` gate builds the Electron main process and renderer, then runs the dedicated Playwright configuration against real Sage 9.5 in WSL Ubuntu and the local Sage 10.10 Docker worker. It uses isolated desktop profiles; the Number Theory Workbook case exports a `.math3d` bundle and Markdown, imports the bundle into a second profile and checks the saved evidence without recomputation. The console and Workbook code-cell cases require explicit local trust. No HTTP fixture is part of this gate.

The milestone M0 20-review baseline is covered as follows:

| Review | Flow | Live assertion |
|---|---|---|
| 01–07 | Simplify, symbolic factor, expand, solve, gradient, Hessian, singularity check | Desktop Services executes each on WSL and Docker, checks exact goldens and compares results in `sageLiveDesktop.spec.ts`. |
| 08–09 | Exact eigenvalues, characteristic polynomial | CAS Services runs a numeric matrix containing zero through Docker; exact eigenvalues and `lambda^2 - 3*lambda + 2` are asserted in `sageF08Advanced.spec.ts`. |
| 10–12 | Polynomial roots, factorization, Gröbner basis | CAS Services checks certified WSL algebraic roots, Docker rational roots, both factor routes and a pinned exact Gröbner basis in `sageF08Advanced.spec.ts`. |
| 13–14 | GCD, modular inverse | Number Theory UI checks exact Docker results in `sageLiveDesktop.spec.ts` and the Workbook roundtrip case. |
| 15 | Typed error | Services sends invalid syntax to WSL and Docker and checks each rejection in `sageLiveDesktop.spec.ts`. |
| 16 | Runtime discovery | Compute runtime status and service stop/start controls are checked in `sageLiveDesktop.spec.ts`. |
| 17 | Number Theory workspace | Its native Services and result Inspector are exercised in `sageLiveDesktop.spec.ts`. |
| 18 | Workbook evidence | Success and failed inverse are saved, exported as `.math3d` and Markdown, independently imported and re-exported in `numberTheoryWorkbookAcceptance.spec.ts`. |
| 19 | Trusted Electron console | Trust gate, real WSL output, provenance and cancellation are checked in `sage-console-desktop.spec.ts`. |
| 20 | Workbook Sage code cell | Trust gate, real WSL result, dependency freshness and reopen are checked in `workbook-sage-code.spec.ts`. |

F08 caught a real worker regression: JSON matrix entries equal to numeric zero were treated as missing expressions. The worker now accepts zero while rejecting booleans. `service.test_sage_f08_baseline` checks exact eigenvalues and characteristic polynomial on the real runner in both WSL and Docker. The existing desktop parity test now activates its command-palette item with Enter, avoiding a transient detached-button click during first render.

**Acceptance on this machine:** `npm run test:sage:f08` passed all six real desktop tests (main and renderer builds included). After adding exact goldens for the seven symbolic flows, the affected live desktop test passed again. The two matrix worker fixtures passed on Sage 9.5 WSL and Sage 10.10 Docker. The B08 16-case local/Docker comparison was rerun with `--require-docker` and reported zero differences. The exact desktop observations are retained in the Playwright test output for the run; the tests create and remove only isolated profile directories.

Run with `docker compose -f services/sage-worker/docker-compose.yml up -d --build`, WSL Ubuntu Sage installed, then `npm run test:sage:f08`. The gate requires both routes and fails when either is unavailable.

**Next:** SAGE-G01 finite-field explorer.
