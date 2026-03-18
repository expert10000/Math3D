# Math3D

[![CI](https://github.com/expert10000/Math3D/actions/workflows/ci-build-and-worker-smoke.yml/badge.svg)](https://github.com/expert10000/Math3D/actions/workflows/ci-build-and-worker-smoke.yml) [![Docs](https://github.com/expert10000/Math3D/actions/workflows/docs-pages.yml/badge.svg)](https://github.com/expert10000/Math3D/actions/workflows/docs-pages.yml) [![Latest release](https://img.shields.io/github/v/release/expert10000/Math3D?display_name=tag)](https://github.com/expert10000/Math3D/releases/latest) [![Downloads](https://img.shields.io/github/downloads/expert10000/Math3D/total)](https://github.com/expert10000/Math3D/releases) [![License](https://img.shields.io/github/license/expert10000/Math3D)](https://github.com/expert10000/Math3D/blob/main/LICENSE)

Math3D is an interactive geometry app (Electron + React) with browser mode support.

Documentation:
- GitHub Pages: https://expert10000.github.io/Math3D/
- GitHub Wiki: https://github.com/expert10000/Math3D/wiki
- Developer notes and change log: [dev.md](dev.md)

## Install

```bash
git clone https://github.com/expert10000/Math3D.git
cd Math3D
npm install
```

## Run

### Desktop app (Electron)

```bash
npm run build:core
npm run build
```

For packaged installers:

```bash
npm run dist
```

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
