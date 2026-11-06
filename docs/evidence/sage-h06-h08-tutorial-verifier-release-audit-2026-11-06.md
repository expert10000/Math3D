# SAGE-H06–H08 tutorial, independent verifier and release evidence audit

## H06 — detailed worked tutorial

The [reproducibility tutorial](../tutorials/sage-algebra-gallery-and-reproducibility.md) gives UI steps, definitions, hypotheses, exact answers, failure cases, route/version notes, budget behavior, export/import steps and a [desktop screenshot](sage-h06-gallery-sweep-desktop-2026-11-06.png). It distinguishes mathematical derivations from backend traces. The [executable fact check](../../scripts/check-sage-algebra-h06-tutorial.py) independently verified GF(5), C4, `QQ[x,y]/(x²,y)`, `ZZ/6ZZ` and three GCD pairs on real WSL Sage 9.5; its [machine-readable result](sage-h06-tutorial-facts-wsl-9.5-2026-11-06.json) is retained. The desktop gallery/sweep test passed with a controlled Sage-shaped endpoint and a fresh-profile Project reopen.

## H07 — independent manifest verification

`npm run check:sage:algebra-manifest -- MANIFEST.algebra.json PROJECT.math3d [--workbook WORKBOOK.json]` loads the exported files independently. It validates the manifest format, checksum and inert import policy; checks complete Project object, operation and recipe coverage; compares saved definitions, requests, result hashes, runtime and certificate metadata; and, if supplied, compares selected Workbook blocks. A Project Workbook reference also requires matching Workbook bytes. It reports separate `workbookVerified` and `workbookProjectBound` states. It does not dispatch Sage work or execute trusted code. Tests pass for a matching export, Project-bound Workbook, changed Workbook and advanced Project revision.

## H08 — milestone and recorded runtime evidence audit

The [machine-readable release matrix](sage-algebra-release-matrix-2026-11-06.json) maps M0–M6 to existing evidence and test files. `npm run check:sage:release` checks every path and the SHA-256 of the [B08 recorded result](sage-b08-live-2026-11-05.json), then verifies 16 successful Sage 9.5 and 16 successful Docker Sage 10.10 cases with zero recorded differences. Negative tests reject a missing milestone, invalid path and changed B08 digest.

This audit reports **historical evidence verified** and **current live gate not run**. B08's bounded 16-case comparison was completed on 2026-11-05; Docker Desktop is not running during this H08 session, so no new Docker parity claim is made. A release reviewer can start both routes and rerun `npm run test:sage:f08` plus `sage -python scripts/check-sage-algebra-b08-matrix.py --require-docker` for a current live gate.

Acceptance on this checkout: 16 focused algebra Vitest cases, two H08 negative/positive Node tests, the desktop fresh-profile gallery/sweep gate, the real WSL Sage 9.5 tutorial fact check, `npm run check:sage:release`, `npm run typecheck:noemit` and `npm run build:core` passed. The final type check was rerun after the Project-bound Workbook fixture was corrected.

Next: use this matrix to review M0–M6 against the intended release build, then address any newly uncovered gap. No further Track H feature gate is currently specified.
