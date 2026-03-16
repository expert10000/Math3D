# Playwright E2E Tests

## Coverage added

### Surface functional flow
- startup smoke (app launch + main window + worker ready + no startup error banner)
- simple implicit generate (enter expression + generate + success marker + no crash/error banner)
- invalid expression failure (readable error + UI remains responsive)

### Worker failure injection
- worker missing
- worker timeout
- worker malformed error payload
- checks for readable UI error, generate button reset, and no UI hang

### Object/scene behavior
- create object
- toggle visibility
- remove object
- scene/overlay state remains consistent (stats + tree stay aligned)

### Persistence
- save project/workspace
- reopen app
- scene restores

### Packaged desktop flow
- installed app launches
- bundled worker responds
- one tiny real operation succeeds (`ping` + small mesh smoke via `smoke-python-worker.mjs`)

## Commands

- run all Playwright e2e tests:
  - `npm run test:app:e2e`
- run only surface functional tests:
  - `npm run test:app:e2e:functional`
- run only worker failure-injection tests:
  - `npm run test:app:e2e:worker-failures`
- run only packaged desktop flow tests:
  - `npm run test:app:e2e:packaged`
  - requires: `MATH3D_RUN_PACKAGED_E2E=1`

## Failure injection toggle

Set `MATH3D_WORKER_FAILURE_INJECTION` before launch to force deterministic VTK preview failures:

- `worker-success` (test helper: deterministic tiny success result)
- `worker-invalid-expression` (test helper: deterministic readable invalid-expression failure)
- `worker-missing`
- `worker-timeout`
- `worker-malformed-error`

## Optional packaged paths

If installed binaries are in non-default paths, set:

- `MATH3D_INSTALL_ROOT`
- or `MATH3D_INSTALLED_APP_EXE` and `MATH3D_INSTALLED_WORKER_EXE`
- and enable packaged checks with `MATH3D_RUN_PACKAGED_E2E=1`

## Where Playwright helps most

- realistic click/type/navigation flows
- asserting visible UI state
- screenshots on failure
- tracing/debugging failed tests
