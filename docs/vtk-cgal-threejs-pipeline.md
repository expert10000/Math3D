# VTK + CGAL + three.js Usage Pipeline

This document defines how Math3D uses `CGAL`, `VTK`, and `three.js`, and the runtime request pipeline between renderer, preload, IPC, and worker.

## Roles

| Layer | Primary role | Main entry points |
|---|---|---|
| CGAL | Robust implicit meshing and geodesic heat computation | `renderer/src/services/cgalMeshClient.ts:45`, `src/main/ipc/cgalMeshIpc.ts:72`, `src/main/python/pythonWorker.ts:423` |
| VTK | Fast preview, mesh transforms, and volume operations | `renderer/src/services/vtkMeshClient.ts:55`, `renderer/src/services/vtkVolumeClient.ts:100`, `src/main/ipc/vtkMeshIpc.ts:45`, `src/main/python/pythonWorker.ts:547` |
| three.js | Scene construction, rendering, picking, and gizmo interaction | `renderer/src/components/SurfaceViewer.tsx:3`, `renderer/src/components/SurfaceViewer.tsx:3013`, `renderer/src/components/SurfaceViewer.tsx:4473` |

## Runtime Pipeline

### Electron desktop path

`App/UI action -> renderer service -> preload bridge -> ipcMain handler -> Python worker -> CGAL/VTK backend -> typed mesh data -> three.js render`

- Renderer service calls:
  - `renderer/src/services/cgalMeshClient.ts:45`
  - `renderer/src/services/vtkMeshClient.ts:55`
  - `renderer/src/services/vtkVolumeClient.ts:100`
- Preload exposes runtime APIs:
  - `src/preload.ts:263` (`cgalMesh`)
  - `src/preload.ts:278` (`vtkMesh`)
  - `src/preload.ts:289` (`vtkVolume`)
- Main-process IPC handlers:
  - `src/main/ipc/cgalMeshIpc.ts:47`
  - `src/main/ipc/vtkMeshIpc.ts:45`
- Worker message kinds:
  - `src/main/python/pythonWorker.ts:436` (`mesh.generate`, CGAL)
  - `src/main/python/pythonWorker.ts:555` (`mesh.transform`, VTK mesh ops)
  - `src/main/python/pythonWorker.ts:653` (`mesh.preview`, VTK implicit preview)
  - `src/main/python/pythonWorker.ts:703` (`volume.slice`)
  - `src/main/python/pythonWorker.ts:754` (`volume.isosurface`)
  - `src/main/python/pythonWorker.ts:804` (`volume.distance`)
  - `src/main/python/pythonWorker.ts:850` (`volume.streamlines`)

### Browser/proxy path

When running in browser mode, the same renderer APIs are bridged to HTTP endpoints and then mapped back to `window.cgalMesh/window.vtkMesh/window.vtkVolume`.

- Bridge install:
  - `renderer/src/main.tsx:7`
  - `renderer/src/services/webWorkerProxyBridge.ts:246`
- Example proxy endpoints:
  - `renderer/src/services/webWorkerProxyBridge.ts:85` (`/cgal/mesh`)
  - `renderer/src/services/webWorkerProxyBridge.ts:132` (`/vtk/clean`)
  - `renderer/src/services/webWorkerProxyBridge.ts:153` (`/vtk/preview`)

## Use Pipelines

### 1. Fast implicit preview (VTK -> three.js)

Use this for quick iteration on expression/domain before expensive meshing.

1. UI triggers preview call:
   - `renderer/src/App.tsx:18806`
2. Renderer calls `vtkPreviewImplicit`:
   - `renderer/src/services/vtkMeshClient.ts:73`
3. IPC routes to VTK preview handler:
   - `src/main/ipc/vtkMeshIpc.ts:58`
4. Worker sends `mesh.preview` and receives `vtk_result`:
   - `src/main/python/pythonWorker.ts:598`
   - `src/main/python/pythonWorker.ts:653`
5. Result buffers are converted to `Float32Array`/`Uint32Array` and rendered in three.js mesh path:
   - `renderer/src/services/vtkMeshClient.ts:73`
   - `renderer/src/components/SurfaceViewer.tsx:3299`

### 2. Final implicit mesh generation (CGAL -> three.js)

Use this for quality output and stable topology.

1. UI triggers CGAL mesh:
   - `renderer/src/App.tsx:18903`
2. Renderer calls `runCgalMesh`:
   - `renderer/src/services/cgalMeshClient.ts:45`
3. IPC routes to `mesh:cgal`:
   - `src/main/ipc/cgalMeshIpc.ts:72`
4. Worker sends `mesh.generate`:
   - `src/main/python/pythonWorker.ts:423`
   - `src/main/python/pythonWorker.ts:436`
5. Mesh enters SurfaceMesh dataset and then three.js render path:
   - `docs/mesh-promotion-info.md`
   - `renderer/src/components/SurfaceViewer.tsx:3299`
   - `renderer/src/components/SurfaceViewer.tsx:4473`

### 3. Mesh cleanup/refinement (VTK transform ops)

Use this on existing mesh data for cleanup and poly reduction.

1. App transform actions:
   - `renderer/src/App.tsx:15174` (`vtkCleanNormals`)
   - `renderer/src/App.tsx:15205` (`vtkDecimate`)
   - `renderer/src/App.tsx:15242` (`vtkSmooth`)
2. Renderer calls unified VTK op runner:
   - `renderer/src/services/vtkMeshClient.ts:55`
3. IPC maps to VTK op handlers:
   - `src/main/ipc/vtkMeshIpc.ts:46`
4. Worker sends `mesh.transform` with op:
   - `src/main/python/pythonWorker.ts:547`
   - `src/main/python/pythonWorker.ts:555`

### 4. Volume analysis/render support (VTK volume ops + three.js viewers)

Use this for slices, isosurfaces, distance fields, and streamlines.

1. Renderer API calls:
   - `renderer/src/services/vtkVolumeClient.ts:100`
   - `renderer/src/services/vtkVolumeClient.ts:134`
   - `renderer/src/services/vtkVolumeClient.ts:156`
   - `renderer/src/services/vtkVolumeClient.ts:175`
2. IPC handlers:
   - `src/main/ipc/vtkMeshIpc.ts:75`
   - `src/main/ipc/vtkMeshIpc.ts:94`
   - `src/main/ipc/vtkMeshIpc.ts:113`
   - `src/main/ipc/vtkMeshIpc.ts:132`
3. Worker volume messages:
   - `src/main/python/pythonWorker.ts:696`
   - `src/main/python/pythonWorker.ts:747`
   - `src/main/python/pythonWorker.ts:796`
   - `src/main/python/pythonWorker.ts:843`
4. Volume viewer consumption:
   - `renderer/src/components/VolumeViewer.tsx:572`
   - `renderer/src/components/VolumeViewer.tsx:1035`
   - `renderer/src/components/VolumeViewer.tsx:1146`

## Practical Selection Rules

- Use `VTK preview` when latency matters and approximate mesh is acceptable.
- Use `CGAL mesh.generate` for final implicit mesh quality.
- Use `VTK transform` for cleanup operations (`clean`, `decimate`, `smooth`) on an existing mesh.
- Use `VTK volume` for scalar/vector field operations.
- Use `three.js` only as the render/interaction layer; it should not own heavy meshing logic.
