# Runtime Architecture (Electron + React + Python Worker)

This page reflects the real runtime wiring in the current codebase.

## 1. Top-level runtime map

- `src/main.ts` - Electron app bootstrap, window lifecycle, IPC registration.
- `src/preload.ts` - contextBridge API exposed to renderer (`window.cgalMesh`, `window.vtkMesh`, `window.vtkVolume`, diagnostics).
- `renderer/src/**` - React UI + three.js rendering and interaction.
- `src/main/python/pythonWorker.ts` - Node-side Python worker client and process manager.
- `python/worker/**` - Python worker entrypoint + handlers (CGAL, VTK, geodesic, volume).

## 2. Process model (desktop)

Math3D desktop is split into:

1. Electron main process (privileged runtime, IPC, worker process spawn).
2. Electron renderer process (React app, UI state, three.js viewport).
3. External Python worker process (heavy numerical work).

Important: there is one shared Python worker process (singleton) used by both CGAL and VTK IPC handlers.

## 3. End-to-end request path

```text
React UI action
  -> renderer service client (cgal/vtk)
  -> preload bridge (window.* API)
  -> Electron IPC (main process)
  -> pythonWorker.ts request dispatch
  -> Python worker (main.py -> worker_impl.py)
  -> CGAL / VTK computation
  -> typed payload response
  -> renderer converts payload to typed arrays
  -> three.js scene update
```

## 4. IPC surface (desktop)

### CGAL and geodesic endpoints

- `mesh:cgal:ping`
- `mesh:cgal:version`
- `mesh:cgal:health`
- `mesh:cgal`
- `mesh:geodesic:heat`
- `mesh:cgal:stop`

Registered in: `src/main/ipc/cgalMeshIpc.ts`

### VTK mesh + volume endpoints

- `mesh:vtk:clean`
- `mesh:vtk:decimate`
- `mesh:vtk:smooth`
- `mesh:vtk:preview`
- `volume:vtk:slice`
- `volume:vtk:isosurface`
- `volume:vtk:distance`
- `volume:vtk:streamlines`

Registered in: `src/main/ipc/vtkMeshIpc.ts`

## 5. Worker protocol (actual message types)

Python worker supports these request types:

- `ping`
- `version`
- `health`
- `mesh.generate` (CGAL implicit meshing)
- `mesh.transform` (VTK mesh ops)
- `mesh.preview` (VTK implicit preview)
- `volume.slice`
- `volume.isosurface`
- `volume.distance`
- `volume.streamlines`
- `geodesic.heat`

Implemented in: `python/worker/worker_impl.py`

## 6. Worker backend resolution

Worker launch backend is resolved by `src/main/python/pythonWorker.ts`:

- `python-script` backend: runs `python/worker/main.py`
- `bundled-exe` backend: runs packaged `resources/python-worker/worker.exe`

Primary env controls:

- `MATH3D_WORKER_MODE=auto|python|exe`
- `MATH3D_WORKER_EXE`
- `MATH3D_WORKER_SCRIPT`
- `MATH3D_PYTHON`
- `MATH3D_WORKER_ALLOW_PYTHON_FALLBACK`

Startup includes ping/version/health checks before worker is accepted.

## 7. Diagnostics and failure tracking

Main-process diagnostics IPC:

- `python-worker:diagnostics:get`

Diagnostics state and error categorization are maintained in:

- `src/main/python/pythonWorkerDiagnostics.ts`

This is used to surface categories like missing worker, startup crash, dependency failure, timeout, and unknown.

## 8. Browser mode architecture

In browser runtime (`apps/web`):

- React still calls the same renderer service clients.
- `renderer/src/services/webWorkerProxyBridge.ts` installs `window.cgalMesh/window.vtkMesh/window.vtkVolume` shims.
- Calls are forwarded as HTTP JSON/base64 payloads to:
  - `apps/web/server/worker-proxy.cjs` (`/api/worker/*`)
- Proxy runs/owns a Python worker process with nearly identical request handling.

So architecture stays conceptually consistent: UI bridge -> worker compute -> typed result -> three.js.

## 9. Data boundary: mesh contract

Across CGAL, VTK, importers, and local bakers, renderer normalizes geometry to shared mesh shape (`SurfaceMeshData` in `renderer/src/mesh/surfaceMesh.ts`), then applies common post-processing (`applySurfaceMeshOps` in `renderer/src/App.tsx`).

This gives one render contract regardless of mesh source.

## 10. What is not in Python worker

Not all math is offloaded:

- several fast/local operations remain in renderer-side TypeScript (for example marching squares, some sampling/analysis, graph/parametric bake flows).

This split is intentional: interactive/lightweight operations stay local, heavy meshing/volume transforms go to Python worker.
