# Release Smoke Tests (Windows)

## Goal

Prevent installer regressions by validating packaged behavior in a repeatable way.

## Automated smoke command

- full flow (build + install + smoke):
  - `npm run smoke:release`
- re-check existing build/install:
  - `powershell -ExecutionPolicy Bypass -File scripts/release-smoke.ps1 -SkipBuild -SkipInstall`

## What the smoke run validates

1. Installer package is produced (unless `-SkipBuild`).
2. Packaged worker exists:
   - `release/win-unpacked/resources/python-worker/worker.exe`
3. Installed worker exists:
   - `%LOCALAPPDATA%\Programs\Math3D\resources\python-worker\worker.exe`
4. Worker health checks pass against installed executable:
   - `ping`
   - `mesh.preview` (simple mesh op)
   - `mesh.transform` with `vtk_clean_normals` (VTK-based op)
5. App launch check passes (unless `-SkipLaunchCheck`).
6. Worker smoke passes even when python/conda paths are removed from `PATH`.

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

## Minimal packaged-build test plan

1. `Build`: `npm run dist`
2. `Install`: silent install via smoke script or manual installer run.
3. `Health`: worker ping/version/health from installed `worker.exe`.
4. `Function`: one mesh preview + one VTK transform operation.
5. `Launch`: installed app process starts and remains running.
6. `Environment`: smoke still passes without python/conda paths in `PATH`.
