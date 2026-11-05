# Saved ideal QEC scene · 2026-11-05

This closes the saved-run and portable-scene slice of QI-31. It does **not** certify a surface code, noisy measurement circuit or fault-tolerant decoder.

## Producer and contract

Theory Lab's Python worker computes an ideal three-data-bit repetition-code trace for 1–32 prescribed rounds (`none`, or an X flip on bit 0, 1 or 2). The host independently recomputes each parity syndrome, temporal defect, data-bit state and minimum-weight final correction before persisting the record. The new `qec-repetition-run/v1` store records a fresh run and job ID, worker version, time, flip schedule, exact worker result and result SHA-256 inside a hash-checked manifest. Reads validate the complete shape, worker trace digest and recomputed science. Damaged records are not offered for reopening.

The Backend page lists verified saved runs, reopens one after application restart, and exports a `quantum-scene/v1` `.qscene`. The scene's provenance carries the saved run, job, worker version and result hash. Its f64 binary datasets contain the *recorded* syndrome, defect and data-bit values; display-position datasets map round, lane and 0/1 height without substituting new numerical results. The producer labels the decoder's final correction, logical outcome and multiple-error ambiguity. The Math3D inspector states the ideal-example scope and the meaning of the lanes. The generic Math3D source-run/fork route cannot open this separate QEC store; the saved record is reopened from Theory Lab's Backend page.

## Verification on the Windows source checkouts

- Theory Lab `npm run typecheck`, `npm run build`, `npm test` (256 passed, one skipped), and `npm run test:worker` (140 passed, five skipped).
- `tests/qec-saved-scene.test.ts` starts the real Python worker, saves and reopens the trace, checks all exported arrays, moves through bundle readback, and refuses changed binary and manifest bytes.
- With `QLAB_E2E_CHECKOUT` set to the built Theory Lab checkout, `npx playwright test tests/e2e/quantum-qec-repetition-two-app.spec.ts --reporter=list` passes. It restarts Theory Lab, reopens and exports the saved run, compares every exported bit to that run, opens the bundle in Math3D, and checks that changed scene JSON is refused. The resulting Math3D view was inspected visually.

## Remaining QI-31 and QI-40 scope

No stochastic noise, noisy parity measurement, surface-code patch, circuit-level fault model, independent decoder comparison, logical failure rate or pseudothreshold is inferred from this ideal trace. The QEC scene is a current-reader source-checkout path and has not been added to the 38-fixture release matrix; QI-40 release freeze remains open.
