# Install and Run Modes

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

| Mode | Where it runs | Worker install needed on host? | When to use |
| --- | --- | --- | --- |
| Desktop (Electron) | Local desktop app | No separate worker install for packaged app | Best for full desktop usage; packaged installers are Windows (`.exe`) via NSIS |
| Browser (local) | Your local browser + local Node proxy | Yes, for full CGAL/VTK features | Fast local web development and testing |
| Browser + Docker | Browser UI, backend in container | No | Self-contained web runtime without local Python/worker setup |

Browser mode worker requirement:

- Browser mode uses `/api/worker` for CGAL/VTK operations.
- For local (non-Docker) browser mode, install one backend option:
  - bundled worker executable: `npm run build:python-worker` and `MATH3D_WORKER_MODE=exe`
  - Python backend: install Python deps and use `MATH3D_WORKER_MODE=python` (or default `auto`)
- Docker browser mode already includes backend dependencies in the container.

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

Development:

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

Open:

- App: `http://localhost:4173`
- Worker diagnostics: `http://localhost:8787/api/worker/diagnostics`
