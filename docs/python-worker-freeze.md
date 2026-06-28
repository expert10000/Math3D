# Python Worker Freeze (Windows)

## Output artifact

- `build/python-worker-dist/worker.exe`

## Reproducible build commands

- Build only:
  - or `npm run build:python-worker`
  - direct: `python python/worker/freeze.py`
- Build + smoke checks:
  - `powershell -ExecutionPolicy Bypass -File scripts/build-python-worker.ps1 -SmokeTest`
  - or `npm run build:python-worker:smoke`

## Smoke test coverage

- `worker.exe --ping`
- `worker.exe --version`
- JSON/stdin protocol check using `scripts/smoke-python-worker.mjs`:
  - sends `ping`
  - sends `mesh.preview`
  - sends `mesh.transform` (`vtk_clean_normals`)
  - validates non-empty mesh result (`vertexCount > 0`, `triCount > 0`)

## Packaging notes (DLLs / heavy deps)

- VTK binaries and package data are collected via:
  - `--collect-binaries vtkmodules`
  - `--collect-data vtkmodules`
- When installed, `pygalmesh` binaries and package data are collected via:
  - `--collect-binaries pygalmesh`
  - `--collect-data pygalmesh`
- Build logs may include missing optional MKL/cluster DLL warnings (`msmpi.dll`, `impi.dll`, `pgc.dll`, etc.).
  - These warnings were non-fatal on the current build machine.
  - `worker.exe` still passed `ping` and `mesh.preview` smoke tests.
- `pygalmesh` can be required for package/release builds:
  - set `MATH3D_REQUIRE_PYGALMESH=1` to fail the freeze if it is missing
  - if not installed and not required, `mesh.generate` is unavailable at runtime
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
