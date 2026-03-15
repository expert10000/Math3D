# Python Worker Runtime Resolution

## Default behavior

- Dev (`app.isPackaged === false`):
  - backend: `python-script`
  - launch: `MATH3D_PYTHON` (or `python`/`python3`) + `python/worker/main.py`
- Packaged (`app.isPackaged === true`):
  - backend: `bundled-exe`
  - launch: `resources/python-worker/worker.exe`

## Bundled path model

- `resources/python-worker/worker.exe`

Configured in `package.json` via `build.extraResources`:

- `from: build/python-worker-dist`
- `to: python-worker`

## Installer validation (Windows)

After `npm run dist`, validate the packaged and installed layout:

- quick command:
  - `npm run verify:installer-worker`
- underlying checks performed:
  - `release/win-unpacked/resources/python-worker/worker.exe` exists
  - installs the newest `release/Math3D Setup *.exe` with `/S`
  - `C:\Users\<user>\AppData\Local\Programs\Math3D\resources\python-worker\worker.exe` exists
  - runs `scripts/smoke-python-worker.mjs` against installed `worker.exe`

Optional flags for `scripts/verify-installer-worker.ps1`:

- `-SkipInstall` if already installed
- `-SkipSmoke` to only verify file placement
- `-SkipLaunchCheck` to skip best-effort app launch probe

Clean machine / VM pass:

- copy installer from `release/Math3D Setup *.exe`
- install on a Windows VM with no Python installed
- verify `%LOCALAPPDATA%\Programs\Math3D\resources\python-worker\worker.exe`
- launch app and run mesh/Python-backed workflows immediately

## Runtime overrides

- `MATH3D_WORKER_MODE=auto|python|exe`
  - default: `auto`
- `MATH3D_WORKER_EXE=<path>`
  - override bundled exe path
- `MATH3D_WORKER_SCRIPT=<path>`
  - override python worker script path
- `MATH3D_PYTHON=<python command/path>`
  - override python executable in script mode
- `MATH3D_WORKER_ALLOW_PYTHON_FALLBACK=1`
  - in packaged mode + `auto`, allow fallback to python script if exe is not found

## Logging

Main process logs now include:

- selected backend (`python-script` or `bundled-exe`)
- exact command + args
- mode source (`MATH3D_WORKER_MODE`, legacy env, or default)
- packaged flag and startup-check result
