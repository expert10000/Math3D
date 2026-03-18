# Troubleshooting

## Worker shows unavailable/pending in web mode

1. Build worker executable:

```bash
npm run build:python-worker
```

2. Force executable backend:

```powershell
$env:MATH3D_WORKER_MODE = "exe"
npm run preview:web
```

3. Check diagnostics:

- `http://127.0.0.1:8787/api/worker/diagnostics`

You should see `available: true` and `backend: "bundled-exe"`.

## Browser build succeeded but features fail

- Ensure proxy is running (`npm run dev:web` or `npm run preview:web` from repo root).
- Ensure the app connects to `/api/worker` (default).

## Desktop build issues

- Run `npm install` in repo root.
- Rebuild core: `npm run build:core`.

## Test failures

- Run renderer unit tests first:
  - `npm --prefix renderer run test`
- Then run smoke tests:
  - `npm run test:app:startup:smoke`
  - `npm run test:app:geometry:smoke`
