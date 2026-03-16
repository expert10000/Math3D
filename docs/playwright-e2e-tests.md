# Playwright E2E Tests

## Coverage added

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
- run only packaged desktop flow tests:
  - `npm run test:app:e2e:packaged`
  - requires: `MATH3D_RUN_PACKAGED_E2E=1`

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
