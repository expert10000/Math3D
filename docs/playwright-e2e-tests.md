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

### Memory profile
- launches the desktop app with a clean profile
- samples the Electron process tree RSS during a repeatable run
- writes a JSON report with peak/final RSS, per-role peaks, renderer heap, and Three.js diagnostics when available
- supports scenario comparison and per-module checkpoints
- waits between actions by default so memory has time to settle between clicks/interactions
- records white-screen events during the action delay windows
- uses screenshot sampling for visual white screens unless `MATH3D_MEMORY_PROFILE_VISUAL_WHITE_SCREEN=0`
- can optionally fail on a memory budget via `MATH3D_MEMORY_PROFILE_MAX_RSS_MB`

## Commands

- run all Playwright e2e tests:
  - `npm run test:app:e2e`
- run only surface functional tests:
  - `npm run test:app:e2e:functional`
- run the memory profile:
  - `npm run test:app:e2e:memory-profile`
- compare navigation, canvas, module-sweep, and mixed memory profiles:
  - `npm run test:app:e2e:memory-profile:compare`
- run 20 in-module clicks with 5 seconds between clicks for the high-signal modules:
  - `npm run test:app:e2e:memory-profile:module-clicks`
- run the same in-module clicks as one continuous app session:
  - `npm run test:app:e2e:memory-profile:module-chain`
- summarize recent memory profile reports:
  - `npm run test:app:e2e:memory-profile:summary`
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

## Deterministic viewer setup

Use deterministic fixtures, preset loaders, explicit ID fields, or E2E-only picker hooks for workflow tests where the assertion is about construction state, contextual actions, persistence, or command results.

Keep canvas-click setup only for tests whose assertion is specifically about real viewer picking. Memory profile scenarios may also use canvas clicks because they measure interaction behavior rather than construction correctness.

## Optional packaged paths

If installed binaries are in non-default paths, set:

- `MATH3D_INSTALL_ROOT`
- or `MATH3D_INSTALLED_APP_EXE` and `MATH3D_INSTALLED_WORKER_EXE`
- and enable packaged checks with `MATH3D_RUN_PACKAGED_E2E=1`

## Memory profile options

Reports are written to `output/memory-profiles` by default and are also attached to the Playwright result.

- `MATH3D_MEMORY_PROFILE_SCENARIO`: `mixed` (default), `navigation`, `canvas`, `module-sweep`, `module-repeat`, `module-chain-repeat`, or `surface-gallery-chain`
- `MATH3D_MEMORY_PROFILE_MODULE`: target module for `module-repeat`; default `Mesh`
- `MATH3D_MEMORY_PROFILE_MODULES`: comma-separated modules for `module-chain-repeat`; default `Surfaces,Mesh,Volume,Curves`
- `MATH3D_MEMORY_PROFILE_ACTIONS`: total actions to run; default `180`
- `MATH3D_MEMORY_PROFILE_ACTION_DELAY_MS`: delay after each action; default `3000`
- `MATH3D_MEMORY_PROFILE_SAMPLE_INTERVAL_MS`: process sample interval; default `500`
- `MATH3D_MEMORY_PROFILE_FINAL_IDLE_MS`: idle wait before the final sample; default `5000`
- `MATH3D_MEMORY_PROFILE_MAX_RSS_MB`: optional peak-RSS budget; unset means observe only
- `MATH3D_MEMORY_PROFILE_ELECTRON_ARGS`: optional Electron/Chromium flags, such as `--disable-gpu`
- `MATH3D_MEMORY_PROFILE_VISUAL_WHITE_SCREEN`: set to `0` to disable screenshot-based visual blank checks

The comparison runner defaults to 8 actions per scenario so it stays practical with the 3-second action delay:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-memory-profile-comparison.ps1 -Actions 8 -ActionDelayMs 3000
```

For slower pacing, use `-ActionDelayMs 5000`. For a deeper run, increase `-Actions`.

The module-click runner defaults to `Surfaces`, `Mesh`, `Volume`, and `Curves`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-memory-profile-module-clicks.ps1 -Actions 20 -ActionDelayMs 5000
```

The module-chain runner keeps one app open while clicking each module in sequence:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-memory-profile-module-chain.ps1 -Actions 20 -ActionDelayMs 5000
```

The surface-gallery runner keeps one app open, opens Surfaces gallery mode, walks Explicit, Implicit, Parametric, Spline, and Constructed, and clicks all visible gallery cards with 5 seconds between clicks:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-memory-profile-surface-gallery.ps1 -ActionDelayMs 5000
```

## Where Playwright helps most

- realistic click/type/navigation flows
- asserting visible UI state
- screenshots on failure
- tracing/debugging failed tests
