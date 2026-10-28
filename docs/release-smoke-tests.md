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
- clean-profile installed-app launch check:
  - `powershell -ExecutionPolicy Bypass -File scripts/release-smoke.ps1 -SkipBuild -StrictLaunchCheck`

## Local release confidence pass

Run these before treating a candidate as release-ready:

1. TypeScript no-emit check: `npm run typecheck:noemit`
2. Renderer unit tests: `npm --prefix renderer run test`
3. App startup smoke: `npm run test:app:startup:smoke`
4. Geometry smoke: `npm run test:app:geometry:smoke`
5. Fast app e2e: `npm run test:app:e2e:fast`
6. Package smoke: `npm run test:release:smoke`

Expected package-build notes:

- PyInstaller may report missing optional conda/MKL or cluster DLLs such as `msmpi.dll`, `impi.dll`, `pgc.dll`, or `pgmath.dll`. Treat those as non-blocking only when the packaged and installed worker protocol smoke checks pass.
- `pygalmesh` is optional unless `MATH3D_REQUIRE_PYGALMESH=1` is set. Without it, `mesh.generate` is unavailable, but `mesh.preview`, VTK transforms, and geodesic operations still smoke-test.

## What the smoke run validates

1. Installer package is produced (unless `-SkipBuild`).
2. Packaged worker exists:
   - `release/win-unpacked/resources/python-worker/worker.exe`
3. Packaged standalone web app exists:
   - `release/win-unpacked/resources/web-app/index.html`
4. Installed worker exists:
   - `%LOCALAPPDATA%\Programs\Math3D\resources\python-worker\worker.exe`
5. Installed standalone web app exists:
   - `%LOCALAPPDATA%\Programs\Math3D\resources\web-app\index.html`
6. CLI worker checks pass for packaged and installed executables:
   - `worker.exe --ping`
   - `worker.exe --version`
7. Protocol smoke passes for packaged and installed executables:
   - `ping`
   - `mesh.preview` (simple mesh op)
   - `mesh.transform` with `vtk_clean_normals` (VTK-based op)
8. App launch check passes against a temporary clean profile (unless `-SkipLaunchCheck`).
9. Worker smoke passes even when python/conda paths are removed from `PATH`.

## Manual release checklist

1. Run `npm run smoke:release` on release machine.
2. Re-run the launch check against the built installer with `powershell -ExecutionPolicy Bypass -File scripts/release-smoke.ps1 -SkipBuild -StrictLaunchCheck`.
3. Install same installer on a clean Windows VM with no Python installation.
4. Launch app from Start Menu / install folder.
5. In implicit mode:
   - run `preview (VTK)`
   - run `gcalc (CGAL)`
6. Confirm no fallback/setup prompt for system Python.
7. If any failure occurs, collect diagnostics log from:
   - `%APPDATA%\Math3D\logs\python-worker-diagnostics.log`

## Installed Theory Lab handoff signoff

Build the full Math3D package with `npm run build:python-worker`, `npm run
build:core`, and `npm run build:web`, then package with the normal
`electron-builder.config.cjs`. Use `MATH3D_CHANNEL=dev` to install into a clean
directory without replacing an existing stable installation; the dev channel
changes only the product identity and output directory. The handoff probe
configuration is not release evidence.

Install a freshly built Theory Lab NSIS package in a clean directory. In
Math3D, open **Settings → Theory Lab installation**, choose its `Quantum
Hamiltonian Lab.exe`, and check that **Validate again** reports Ready. For
automated acceptance, set `QLAB_E2E_CHECKOUT` to the fixture-producing Lab
checkout, `QLAB_E2E_INSTALLED_EXE` to the clean Lab executable, and
`MATH3D_E2E_INSTALLED_EXE` to the full Math3D executable. Run:

```powershell
npx playwright test tests/e2e/theory-lab-installation-settings.spec.ts tests/e2e/quantum-rice-mele-two-app.spec.ts --reporter=list
```

The Settings test rejects an invalid target before saving and accepts the
installed app. The two-app test uses a saved target preference, opens exact
periodic and chain source runs, then checks restart, removed-run refusal, and
changed-run refusal. See the [scene walkthrough](theory-lab-python-scene-walkthrough.md)
for package and installation commands. The fixture producer is a test setup
script; ordinary installed-app navigation needs no checkout.

## GitHub Actions

- Build + worker smoke workflow: `.github/workflows/ci-build-and-worker-smoke.yml`
  - Triggers: push/pull request to `main|master`, manual `workflow_dispatch`
  - Flow:
    - install Node + Python
    - install npm dependencies (`root` + `renderer`)
    - install Python freeze dependencies (`pyinstaller`, `numpy`, `scipy`, `sympy`, `vtk`)
    - try to install `pygalmesh` (optional; workflow continues if unavailable on runner)
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
    - install Python freeze dependencies (`pyinstaller`, `numpy`, `scipy`, `sympy`, `vtk`)
    - try to install `pygalmesh` (optional; workflow continues if unavailable on runner)
    - build installer, install silently, run packaged and installed worker smoke checks

## Minimal packaged-build test plan

1. `Build`: `npm run dist`
2. `Install`: silent install via smoke script or manual installer run.
3. `Health`: worker `--ping` and `--version` for packaged and installed `worker.exe`.
4. `Function`: one mesh preview + one VTK transform operation for packaged and installed workers.
5. `Launch`: installed app process starts and remains running.
6. `Environment`: smoke still passes without python/conda paths in `PATH`.
