# Install and Run

## Requirements

- Node.js 24 or newer
- npm 10 or newer

## Install

```bash
git clone https://github.com/expert10000/Math3D.git
cd Math3D
npm install
```

These commands only clone the repo and install Node dependencies. They do not start the app.

Quick start after install (pick one):
- Desktop from source: `npm run build` (or `npm run dev`)
- Browser local: `npm run dev:web`
- Browser + Docker: `docker compose -f docker-compose.web.yml up --build`

## Run modes (quick guide)

| Mode | Where it runs | Worker/Python setup needed on host? | When to use |
| --- | --- | --- | --- |
| Desktop (installer, Windows) | Installed desktop app | No. Worker is embedded in installer build (`resources/python-worker/worker.exe`) | End-user desktop usage without local Python setup |
| Desktop (local source run) | Electron launched from repo | Yes by default for CGAL/VTK: Python + worker deps. Optional: use local `worker.exe` instead | Desktop development from source |
| Browser (local) | Your local browser + local Node proxy | Yes for CGAL/VTK: provide one backend (`worker.exe` or Python + deps) | Fast local web development and testing |
| Browser + Docker | Browser UI on host, backend in container | No on host. Backend is inside Docker image (Python venv + deps) | Self-contained, reproducible web runtime |

Worker setup details:
- Desktop installer (`npm run dist` output): bundled `worker.exe` is included, so no separate Python/worker install on user machine.
- Desktop local source run (`npm run build` / `npm run dev`):
  - default (`MATH3D_WORKER_MODE=auto`): uses Python script backend in dev, so install Python deps (`numpy scipy sympy pygalmesh vtk`)
  - optional exe path: `npm run build:python-worker` then set `MATH3D_WORKER_MODE=exe`
- Browser local (`npm run dev:web` or `npm run preview:web`): `/api/worker` proxy needs one local backend:
  - exe backend: `npm run build:python-worker` and set `MATH3D_WORKER_MODE=exe`
  - Python backend: install Python deps and use `MATH3D_WORKER_MODE=python` (or `auto`)
- Browser + Docker (`docker compose -f docker-compose.web.yml up --build`): container already provides Python backend; host machine does not need local worker/Python.

How `worker.exe` is created:
- Build command: `npm run build:python-worker` (runs `python python/worker/freeze.py` via PyInstaller).
- Output: `build/python-worker-dist/worker.exe`.
- Optional smoke verification: `npm run build:python-worker:smoke`.
- Installer packaging (`npm run dist`) already builds and embeds this artifact into `resources/python-worker/worker.exe`.

Environment variable notes:
- `MATH3D_PYTHON` affects runtime only for the Python-script backend.
- `MATH3D_PYTHON` does not control `npm run build:python-worker`; that build uses `python` from the active shell/PATH.
- Resolution defaults differ by runtime:
  - desktop local `auto` -> Python-script backend
  - browser local proxy `auto` -> prefer local `worker.exe`, fallback to Python-script backend

Python dev environment prep (Windows + Conda):
```powershell
conda create -n math3d-cgal python=3.11 -y
conda activate math3d-cgal
python -m pip install --upgrade pip
python -m pip install numpy scipy sympy vtk pyinstaller
python -m pip install pygalmesh
$env:MATH3D_PYTHON = (Get-Command python).Source
```

Notes:
- `pyinstaller` is needed when building `worker.exe` (`npm run build:python-worker`).
- `pygalmesh` is optional for many flows; if unavailable, `mesh.generate` may be unavailable while preview/VTK workflows still work.

## Desktop app

```bash
npm run build:core
npm run build
```

For packaged installers (Windows NSIS `.exe`):

```bash
npm run dist
```

## Browser app

```bash
npm run dev:web
```

Static build + preview:

```bash
npm run build:web
npm run preview:web
```

Static files are written to `apps/web/dist/`.

## Browser app in Docker (self-contained)

```bash
docker compose -f docker-compose.web.yml up --build
```
