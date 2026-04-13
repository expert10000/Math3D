# Math3D

[![CI](https://github.com/expert10000/Math3D/actions/workflows/ci-build-and-worker-smoke.yml/badge.svg)](https://github.com/expert10000/Math3D/actions/workflows/ci-build-and-worker-smoke.yml) [![Docs](https://github.com/expert10000/Math3D/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/expert10000/Math3D/actions/workflows/docs-pages.yml) [![Latest release](https://img.shields.io/github/v/release/expert10000/Math3D?display_name=tag)](https://github.com/expert10000/Math3D/releases/latest) [![Downloads](https://img.shields.io/github/downloads/expert10000/Math3D/total)](https://github.com/expert10000/Math3D/releases) [![License](https://img.shields.io/github/license/expert10000/Math3D)](https://github.com/expert10000/Math3D/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/expert10000/Math3D)

Math3D is an interactive geometry app (Electron + React) with browser mode support.

Requirements:
- Node.js 24 or newer
- npm 10 or newer

Documentation:
- GitHub Pages: https://expert10000.github.io/Math3D/
- GitHub Wiki: https://github.com/expert10000/Math3D/wiki
- Developer notes and change log: [dev.md](dev.md)
- Repository folder guide: [docs/repository-layout.md](docs/repository-layout.md)

## Install

```bash
git clone https://github.com/expert10000/Math3D.git
cd Math3D
npm install
```

## Run

### Run modes (quick guide)

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

### Desktop app (Electron)

```bash
npm run build:core
npm run build
```

For packaged installers:

```bash
npm run dist
```

Current packaged installer target is Windows (NSIS `.exe`).

### Browser app (web)

Development:

```bash
npm run dev:web
```

Production static build:

```bash
npm run build:web
npm run preview:web
```

Static output is written to `apps/web/dist/`.

### Browser app in Docker (self-contained)

```bash
docker compose -f docker-compose.web.yml up --build
```

Open:

- App: `http://localhost:4173`
- Worker diagnostics: `http://localhost:8787/api/worker/diagnostics`

Notes:
- This Docker flow is self-contained (Node + Python deps inside container).
- Linux containers use `python` worker mode; they do not run Windows `worker.exe`.

## Python worker modes

Math3D browser mode uses a local proxy (`/api/worker`) for CGAL/VTK-backed operations.

### Self-contained worker (recommended)

Build bundled worker executable:

```bash
npm run build:python-worker
```

Run web mode with bundled executable backend:

```powershell
$env:MATH3D_WORKER_MODE = "exe"
npm run preview:web
```

### Python-script backend (optional)

Install worker dependencies:

```bash
python -m pip install numpy scipy sympy pygalmesh vtk
```

Optional Python path override:

```powershell
$env:MATH3D_PYTHON = (Get-Command python).Source
```

## Tests

```bash
npm --prefix renderer run test
npm run test:app:startup:smoke
npm run test:app:geometry:smoke
```

## Docs

```bash
npm run docs:build
```

## License

This project is licensed under Apache-2.0. See [LICENSE](LICENSE).
