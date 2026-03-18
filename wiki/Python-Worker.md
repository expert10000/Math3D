# Python Worker

Math3D web mode uses a local proxy and Python worker backend for CGAL/VTK operations.

Proxy:

- `apps/web/server/worker-proxy.cjs`
- Route base: `/api/worker`

## Recommended mode: bundled executable

Build worker:

```bash
npm run build:python-worker
```

Run web mode with bundled worker backend:

```powershell
$env:MATH3D_WORKER_MODE = "exe"
npm run preview:web
```

Diagnostics endpoint:

- `http://127.0.0.1:8787/api/worker/diagnostics`

Expected fields:

- `backend: "bundled-exe"`
- `command: ...\\worker.exe`

## Optional mode: Python script backend

Install dependencies:

```bash
python -m pip install numpy scipy sympy pygalmesh vtk
```

Set Python override if needed:

```powershell
$env:MATH3D_PYTHON = (Get-Command python).Source
```

Then run with `MATH3D_WORKER_MODE=python` (or default `auto`).
