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
