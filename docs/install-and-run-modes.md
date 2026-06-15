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

These commands only clone the repo and install Node dependencies. They do not start the app.

Quick start after install (pick one):

- Desktop from source: `npm run build` (or `npm run dev`)
- Browser local: `npm run dev:web`
- Browser + Docker: `docker compose -f docker-compose.web.yml up --build`

## Run modes (quick guide)

| Mode | Where it runs | Worker/Python setup needed on host? | When to use |
| --- | --- | --- | --- |
| Desktop (installer, Windows) | Installed desktop app | No. Worker is embedded in installer build (`resources/python-worker/worker.exe`) | End-user desktop usage without local Python setup |
| Desktop (AppImage, Linux x86_64) | Portable desktop app | No. Worker is embedded in the AppImage (`resources/python-worker/worker`) | First Linux distribution target |
| Desktop (`.deb`, Linux x86_64) | Installed desktop app | No. Worker is embedded in the package | Ubuntu, Debian, and Linux Mint |
| Desktop (`.rpm`, Linux x86_64) | Installed desktop app | No. Worker is embedded in the package | Fedora and RPM-family distributions |
| Desktop (local source run) | Electron launched from repo | Yes by default for CGAL/VTK: Python + worker deps. Optional: use local `worker.exe` instead | Desktop development from source |
| Browser (local) | Your local browser + local Node proxy | Yes for CGAL/VTK: provide one backend (`worker.exe` or Python + deps) | Fast local web development and testing |
| Browser + Docker | Browser UI on host, backend in container | No on host. Backend is inside Docker image (Python venv + deps) | Self-contained, reproducible web runtime |

Worker setup details:

- Desktop installer (`npm run dist` output): bundled `worker.exe` is included, so no separate Python/worker install on user machine.
- Linux packages (`npm run dist:linux` on Linux): the AppImage, `.deb`, and `.rpm` include the bundled `worker`, so no separate Python install is needed on the user machine.
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
- Linux packaging (`npm run dist:linux`) builds the AppImage, `.deb`, and `.rpm` on Linux and embeds `build/python-worker-dist/worker` into `resources/python-worker/worker`.

## Linux Packages

The broad Linux target is an x86_64 AppImage. A `.deb` is produced for
Debian-family distributions and an `.rpm` for Fedora-family distributions.
Build all three on an x86_64 Linux machine:

```bash
python -m pip install pyinstaller numpy scipy sympy vtk
npm ci
npm --prefix renderer ci
npm run dist:linux
```

The outputs are written to `release/Math3D-<version>-<arch>.AppImage`,
`release/Math3D-<version>-<arch>.deb`, and `release/Math3D-<version>-<arch>.rpm`.
The GitHub Actions workflow
`.github/workflows/linux-packages.yml` builds all three, installs and smoke-tests the
`.deb` on Ubuntu 22.04, Ubuntu 24.04, and Debian 12, launches the installed app
under a virtual display, smoke-tests the packaged worker, installs and
smoke-tests the `.rpm` on Fedora 43 and Fedora 44, launches the Fedora install,
and checks frozen-worker portability on Ubuntu 24.04, Debian 12, and Fedora 44. Tagged
releases publish normalized AppImage, `.deb`, and `.rpm` names plus
`SHA256SUMS-linux.txt` alongside the Windows release files.

Build only the AppImage with `npm run dist:linux:appimage`.
Build only the RPM with `npm run dist:linux:rpm`.

Environment variable notes:

- `MATH3D_PYTHON` affects runtime only for the Python-script backend.
- `MATH3D_PYTHON` does not control `npm run build:python-worker`; that build uses `python` from the active shell/PATH.
- Resolution defaults differ by runtime:
  - desktop local `auto` -> Python-script backend
  - browser local proxy `auto` -> prefer local `worker.exe`, fallback to Python-script backend

## Python dev environment prep (Windows + Conda)

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

## Windows + Conda command recipes

Desktop local dev (default Python backend):

```powershell
conda activate math3d-cgal
$env:MATH3D_PYTHON = (Get-Command python).Source
npm run dev
```

Desktop local dev (force `worker.exe` backend):

```powershell
conda activate math3d-cgal
npm run build:python-worker
$env:MATH3D_WORKER_MODE = "exe"
npm run dev
```

Browser local (`dev:web`, auto mode):

```powershell
conda activate math3d-cgal
$env:MATH3D_PYTHON = (Get-Command python).Source
npm run dev:web
```

Browser local (`preview:web`, exe-only mode):

```powershell
conda activate math3d-cgal
npm run build:python-worker
$env:MATH3D_WORKER_MODE = "exe"
npm run preview:web
```

Notes:

- `npm run build:main; npm run build` is redundant because `npm run build` already runs `build:main` internally.
- `MATH3D_PYTHON` is not needed for `npm run build:web`; that command only builds the web frontend bundle.
- Using a fake `MATH3D_PYTHON` path in `MATH3D_WORKER_MODE=exe` is only useful as a backend-selection test, not for normal usage.

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
