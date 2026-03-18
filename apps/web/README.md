# Web App

Browser target for Math3D.

## Run in browser (dev)

```bash
npm run dev:web
```

This starts:
- the local web worker proxy (`apps/web/server/worker-proxy.cjs`) on `http://127.0.0.1:8787`
- the Vite web client with `/api/worker` proxied to that backend

With Python deps installed, browser mode can call the Python worker (CGAL/VTK/volume ops) through the proxy.

## Build browser bundle

```bash
npm run build:web
```

The static web output is written to `apps/web/dist/`.

## Preview browser bundle

```bash
npm run preview:web
```

This starts the same worker proxy plus Vite preview for `apps/web/dist/` on port `4173`.

## Python environment

Set `MATH3D_PYTHON` if your Python executable is not on PATH:

```powershell
$env:MATH3D_PYTHON = (Get-Command python).Source
```
