# Python Worker Freeze

## Output artifact

- Windows: `build/python-worker-dist/worker.exe`
- Linux: `build/python-worker-dist/worker`

## Reproducible build commands

- Build only:
  - `python python/worker/freeze.py`
  - or `npm run build:python-worker`
- Build + smoke checks:
  - `powershell -ExecutionPolicy Bypass -File scripts/build-python-worker.ps1 -SmokeTest`
  - or, on Linux, `npm run test:worker:smoke:portable`

PyInstaller builds for the current operating system. Build the Linux worker and
AppImage on Linux; a Windows build cannot produce the Linux worker.

## Smoke test coverage

- `worker.exe --ping` / `worker --ping`
- `worker.exe --version` / `worker --version`
- JSON/stdin protocol check using `scripts/smoke-python-worker.mjs`:
  - sends `ping`
  - sends `mesh.preview`
  - sends `mesh.transform` (`vtk_clean_normals`)
  - validates non-empty mesh result (`vertexCount > 0`, `triCount > 0`)

## Packaging notes (DLLs / heavy deps)

- VTK binaries and package data are collected via:
  - `--collect-binaries vtkmodules`
  - `--collect-data vtkmodules`
- Build logs may include missing optional MKL/cluster DLL warnings (`msmpi.dll`, `impi.dll`, `pgc.dll`, etc.).
  - These warnings were non-fatal on the current build machine.
  - `worker.exe` still passed `ping` and `mesh.preview` smoke tests.
- `pygalmesh` is optional in current environment:
  - if not installed, `mesh.generate` is unavailable at runtime
  - other worker operations (for example `mesh.preview`, VTK transforms, geodesic) continue to work

## Installer packaging verification

- Build installer:
  - `npm run dist`
- Validate packaged and installed worker layout:
  - `npm run verify:installer-worker`
  - `npm run smoke:release`
- For a clean-machine check:
  - run `release/Math3D Setup *.exe` on a Windows VM without Python
  - confirm `resources/python-worker/worker.exe` under install root
  - confirm mesh/Python-backed features work immediately

See: `docs/release-smoke-tests.md`
