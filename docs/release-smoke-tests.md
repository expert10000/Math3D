# Release Smoke Tests (Windows)

## Goal

Prevent installer regressions by validating packaged behavior in a repeatable way.

## Automated smoke command

- full flow (build + install + smoke):
  - `npm run smoke:release`
- CI-friendly full flow (skip launch persistence check):
  - `npm run test:release:smoke`
- re-check existing build/install:
  - `powershell -ExecutionPolicy Bypass -File scripts/release-smoke.ps1 -SkipBuild -SkipInstall`

## What the smoke run validates

1. Installer package is produced (unless `-SkipBuild`).
2. Packaged worker exists:
   - `release/win-unpacked/resources/python-worker/worker.exe`
3. Installed worker exists:
   - `%LOCALAPPDATA%\Programs\Math3D\resources\python-worker\worker.exe`
4. CLI worker checks pass for packaged and installed executables:
   - `worker.exe --ping`
   - `worker.exe --version`
5. Protocol smoke passes for packaged and installed executables:
   - `ping`
   - `mesh.preview` (simple mesh op)
   - `mesh.transform` with `vtk_clean_normals` (VTK-based op)
6. App launch check passes (unless `-SkipLaunchCheck`).
7. Worker smoke passes even when python/conda paths are removed from `PATH`.

## Manual release checklist

1. Run `npm run smoke:release` on release machine.
2. Install same installer on a clean Windows VM with no Python installation.
3. Launch app from Start Menu / install folder.
4. In implicit mode:
   - run `preview (VTK)`
   - run `gcalc (CGAL)`
5. Confirm no fallback/setup prompt for system Python.
6. If any failure occurs, collect diagnostics log from:
   - `%APPDATA%\Math3D\logs\python-worker-diagnostics.log`

## GitHub Actions

- Build + worker smoke workflow: `.github/workflows/ci-build-and-worker-smoke.yml`
  - Triggers: push/pull request to `main|master`, manual `workflow_dispatch`
  - Flow:
    - install Node + Python
    - install npm dependencies (`root` + `renderer`)
    - install Python freeze dependencies (`pyinstaller` + `python/worker/requirements.freeze.txt`)
    - run `npm run build:core`
    - run `npm run test:worker:smoke`
- Installer smoke workflow: `.github/workflows/windows-release-smoke.yml`
  - Runs on: `windows-latest`
  - Trigger methods:
    - push to `main|master`
    - weekly schedule (Monday, 04:00 UTC)
    - manual `workflow_dispatch` (optional `skip_launch_check` input)
    - PR label: add `ci:installer-smoke` label
    - API: `repository_dispatch` event type `run-installer-smoke`
  - Flow:
    - install Node + Python
    - install npm dependencies (`root` + `renderer`)
    - install Python freeze dependencies (`pyinstaller` + `python/worker/requirements.freeze.txt`)
    - build installer, install silently, run packaged and installed worker smoke checks

## Minimal packaged-build test plan

1. `Build`: `npm run dist`
2. `Install`: silent install via smoke script or manual installer run.
3. `Health`: worker `--ping` and `--version` for packaged and installed `worker.exe`.
4. `Function`: one mesh preview + one VTK transform operation for packaged and installed workers.
5. `Launch`: installed app process starts and remains running.
6. `Environment`: smoke still passes without python/conda paths in `PATH`.
