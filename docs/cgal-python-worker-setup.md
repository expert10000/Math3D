# CGAL Python Worker Setup

Math3D uses the Python worker for VTK and CGAL-backed mesh operations. Native CGAL implicit meshing needs `pygalmesh`, and on Windows that package must be built against CGAL/Eigen headers and native DLLs.

## One-command setup

Run from the repo root:

```powershell
npm run setup:cgal-worker
```

The setup script:

- creates/uses `.venv-worker`
- creates/uses `.deps/vcpkg`
- installs `cgal:x64-windows` and `eigen3:x64-windows` with vcpkg
- installs Python worker dependencies into `.venv-worker`
- downloads `pygalmesh` source
- applies the Math3D CGAL 6 / MSVC compatibility patch
- builds and installs `pygalmesh`
- runs `dependency_probe()`
- runs a real `mesh.generate` CGAL sphere smoke test

The first native `pygalmesh` build can take several minutes on Windows because MSVC is compiling CGAL-heavy C++ code.

Useful options:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-cgal-python-worker.ps1 -SkipVcpkgInstall
powershell -ExecutionPolicy Bypass -File scripts/setup-cgal-python-worker.ps1 -SkipPythonDeps
powershell -ExecutionPolicy Bypass -File scripts/setup-cgal-python-worker.ps1 -ForceReinstall
powershell -ExecutionPolicy Bypass -File scripts/setup-cgal-python-worker.ps1 -SkipSmoke
```

## Native DLL locations

The vcpkg native DLLs live here by default:

```text
.deps/vcpkg/installed/x64-windows/bin
```

`python/worker/runtime.py` automatically registers that directory with `os.add_dll_directory()` and prepends it to `PATH`, so imports such as `_pygalmesh.pyd` can find `gmp-10.dll` and `mpfr-6.dll`.

You can add more native DLL directories with:

```powershell
$env:MATH3D_NATIVE_DLL_DIRS = "C:\path\one;C:\path\two"
```

## Verification

Check worker dependencies:

```powershell
.\.venv-worker\Scripts\python.exe -c "from python.worker.runtime import dependency_probe; import json; print(json.dumps(dependency_probe(), indent=2))"
```

Expected:

- `dependencies.pygalmesh.ok: true`
- `dependencies.CGAL.ok: true`
- `optionalMissing: []`

Use this worker-bootstrap verification instead of a naked `import pygalmesh` command. On Windows, direct imports can fail if the vcpkg DLL directory has not been registered for that Python process.

Run a direct CGAL implicit mesh smoke:

```powershell
$json = '{"type":"mesh.generate","jobId":"setup-cgal-smoke","expr":"x*x+y*y+z*z-1","iso":0,"bbox":{"min":[-1.5,-1.5,-1.5],"max":[1.5,1.5,1.5]},"quality":{"minFacetAngle":20,"radiusBound":0.5,"distanceBound":0.2},"verbose":false}'
$json | .\.venv-worker\Scripts\python.exe -m python.worker.main
```

Expected final line:

```text
"ok": true
```

## If pygalmesh is still missing

1. Re-run setup with a clean pygalmesh build:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-cgal-python-worker.ps1 -SkipVcpkgInstall -ForceReinstall
```

2. Confirm Visual Studio C++ Build Tools are installed.

3. Confirm these paths exist:

```text
.deps/vcpkg/installed/x64-windows/include
.deps/vcpkg/installed/x64-windows/include/eigen3
.deps/vcpkg/installed/x64-windows/lib
.deps/vcpkg/installed/x64-windows/bin
```

4. Check the worker diagnostics log shown in the UI or run `dependency_probe()` from the verification section.

## Dev cache and port 5174 repair

When Vite reports stale optimized dependencies, clear the cache and restart:

```powershell
node scripts/clear-dev-caches.mjs
npm run dev
```

If port `5174` is already in use:

```powershell
Get-NetTCPConnection -LocalPort 5174 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
```

Then stop the stale process:

```powershell
Stop-Process -Id <PID> -Force
```

Use PowerShell end-to-end for this cleanup; do not mix shells for process or file removal.

## UI smoke path

After setup:

1. Open Math3D.
2. Go to `Mesh -> Mesh tools -> Mesh Operations`.
3. Use `Implicit sphere mesh`.
4. Run `Implicit mesh`.
5. Confirm the result card shows `Implicit mesh · CGAL`, vertices/faces, `Open result`, and `Send to Geometry`.
