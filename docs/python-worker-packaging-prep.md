# Python Worker Packaging Prep

## Reproducible local launch

- Entry point:
  - `python python/worker/main.py`
- Quick protocol smoke checks:
  - `echo {"type":"ping","jobId":"smoke"} | python python/worker/main.py`
  - `echo {"type":"version","jobId":"smoke"} | python python/worker/main.py`
  - `echo {"type":"health","jobId":"smoke"} | python python/worker/main.py`

## Pathing and import safety updates

- Worker implementation moved to `python/worker/worker_impl.py`.
- Stable entrypoint remains `python/worker/main.py`.
- Legacy shim kept at `py/cgal_worker.py` for backward compatibility.
- New runtime helpers in `python/worker/runtime.py`:
  - repo root discovery without depending on current working directory
  - module path bootstrapping for `python/worker` + `py/geodesic`
  - dependency probe utilities

## Dependency + asset inventory

- Generated inventory:
  - `docs/python-worker-asset-inventory.json`
- Inventory command:
  - `python python/worker/inventory.py > docs/python-worker-asset-inventory.json`

### Current environment result

- `numpy`: OK
- `scipy`: OK
- `sympy`: OK
- `vtk`: OK
- `pygalmesh`: MISSING (`No module named 'pygalmesh'`)

### pygalmesh install attempt (Windows dev box)

- `python -m pip install pygalmesh` failed.
- Build error: missing Eigen headers (`fatal error C1083: Cannot open include file: 'Eigen/Dense'`).
- This confirms CGAL/Eigen toolchain prerequisites must be documented/provisioned for freeze builds.

## Non-code assets that must ship with worker

- `python/worker/main.py`
- `python/worker/worker_impl.py`
- `python/worker/runtime.py`
- `py/geodesic/**`
- Native extension/runtime files from Python env for:
  - `numpy`
  - `scipy`
  - `vtk`
  - `pygalmesh` (once installed on build machine)

## Packaging note

`vtk` and `scipy` include a large set of native binaries; `pygalmesh` also needs native CGAL/Eigen-linked artifacts. Freeze config (PyInstaller/cx_Freeze) will need hidden imports and binary collection rules based on the inventory output.
