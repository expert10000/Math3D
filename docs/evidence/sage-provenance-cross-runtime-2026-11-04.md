# Sage source provenance and cross-runtime gate — 2026-11-04

## Saved evidence

- The active implicit Surface selection and equation persist in the same app profile. A saved Sage result uses a stable Surface source ID and compares its equation and fingerprint after app restart. A changed equation is marked stale; an unlinked freeform Sage input remains labeled unlinked.
- The shared Sage Workbook result envelope records exact request parameters and job ID, backend (`local`, `docker`, or `private`), engine version, response, warnings, and diagnostics. The Private gateway route uses the same save path. A JSON reopen regression checks a hosted failure envelope, including its error and diagnostics; this is persistence coverage, not a live hosted gateway run.
- A trusted Local WSL Workbook Sage code cell now saves exact code and execution scope, job ID, engine version, complete worker output, warnings and diagnostics, plus a source/dependency hash. Reopened code and dependency changes mark its evidence stale. Trust must be granted again each session.

## Checks

- TypeScript typecheck, core and renderer builds passed.
- Focused Workbook evidence tests passed (5/5). Desktop Surface evidence reopen passed with a controlled Docker response. Desktop Workbook Sage code execution and reopen passed with real Local WSL SageMath 9.5, including a changed dependency.
- The required B08 command, `sage -python scripts/check-sage-algebra-b08-matrix.py --require-docker`, passed all 16 Local WSL Sage 9.5 cases and failed at `docker/health` because Docker was unavailable. The Docker Sage 10.10 comparison remains **unverified**; no equal-result claim is made.

Docker Desktop's backend reported a missing `SOFTWARE\\Docker Inc.\\Docker Desktop` registry key, and its Linux engine named pipe was absent. The gate must be rerun after Docker Desktop is repaired. The independent [SAGE-C06 budget record](sage-c06-operation-budgets-2026-11-04.md) covers ideal request profiles, cost warnings, worker deadlines, and saved budget provenance.
