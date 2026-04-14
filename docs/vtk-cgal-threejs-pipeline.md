# VTK + CGAL + three.js Usage Pipeline

This document defines how Math3D uses `CGAL`, `VTK`, and `three.js`, and the runtime request pipeline between renderer, preload, IPC, and worker.

## Roles

| Layer | Primary role | Main entry points |
|---|---|---|
| CGAL | Robust implicit meshing and geodesic heat computation | `renderer/src/services/cgalMeshClient.ts:45`, `src/main/ipc/cgalMeshIpc.ts:72`, `src/main/python/pythonWorker.ts:423` |
| VTK | Fast preview, mesh transforms, and volume operations | `renderer/src/services/vtkMeshClient.ts:55`, `renderer/src/services/vtkVolumeClient.ts:100`, `src/main/ipc/vtkMeshIpc.ts:45`, `src/main/python/pythonWorker.ts:547` |
| three.js | Scene construction, rendering, picking, and gizmo interaction | `renderer/src/components/SurfaceViewer.tsx:3`, `renderer/src/components/SurfaceViewer.tsx:3013`, `renderer/src/components/SurfaceViewer.tsx:4473` |

## General Context: What three.js Is Used For

In this architecture, `three.js` is the realtime scene and interaction layer. It consumes typed mesh buffers and user interactions, while heavy geometry generation stays in CGAL/VTK or math bakers.

| Area | three.js responsibility in Math3D | Out of scope for three.js |
|---|---|---|
| Scene and camera | Create scene graph, camera, lights, controls, and frame loop | Worker orchestration and IPC |
| Rendering | Draw meshes/overlays from normalized typed arrays (`SurfaceMeshData`) | High-precision remeshing and volumetric algorithms |
| Interaction | Picking, probes, gizmos, slicing planes, and visual feedback | CGAL-quality implicit meshing and VTK transforms |
| Data contract boundary | Consume one mesh contract regardless of source | Defining source-specific math semantics |
| Analysis visuals | Show normals, curvature colors, contours, and helpers | Owning backend numerical solvers |

## Input Families: Different Engineering Cases

The pipeline starts by classifying the input surface family. Explicit, implicit, and parametric surfaces are not just different formulas; they are different engineering cases.

| Family | User input model | Validation focus | Sampling strategy | Rendering and analysis impact |
|---|---|---|---|---|
| Explicit (graph) | `z = f(x, y)` on an `(x, y)` domain | Parse correctness, finite outputs, and graph assumptions | Regular 2D grid in `(x, y)` | Predictable connectivity and efficient derivatives, but limited for overhang-heavy shapes |
| Implicit | `f(x, y, z) = 0` in 3D bounds | Scalar-field validity, domain bounds, and resolution suitability | Volumetric 3D sampling followed by iso-surface extraction | Captures closed/multi-sheet topology, but compute and memory costs are higher |
| Parametric | `(x(u,v), y(u,v), z(u,v))` on a `(u, v)` domain | Domain limits, seam handling, and singular/degenerate regions | 2D parameter-space sampling, then mapped to 3D | Supports folds/overhangs directly, but seams and parameter distortion need explicit handling |

Input diversity shapes nearly every later decision in validation, sampling, and rendering. Before geometry exists, the architecture is already being shaped by the kind of mathematical object the user entered.

## Core Design Move: One Mesh Contract

The most important design decision in this pipeline is that every surface generator, regardless of mathematics, must produce the same renderable structure.

Common contract (conceptually):

- `positions`: vertex positions (`x, y, z`)
- `indices`: triangle topology
- `normals`: per-vertex or per-face normals (required for stable lighting and analysis tools)
- `bounds`: axis-aligned bounds (`min/max`) for camera framing, culling, and diagnostics
- `metadata`: source and processing info (generator, parameters, quality settings, tokens, provenance)
- `uvs` (optional): texture coordinates when available

Why this matters:

- Mathematical variety (graph, parametric, implicit, Weierstrass, volume-derived surfaces) stays inside generator logic.
- Architectural consistency starts at the contract boundary, where downstream systems treat all meshes uniformly.
- `VTK`, `CGAL`, and in-app generators can evolve independently as long as they keep emitting this shape.
- `three.js` and interaction code do not care how a mesh was created; they consume one stable format.

In short, this is the boundary where mathematical diversity becomes engineering uniformity.

## How This Is Implemented In Math3D

In Math3D, this common contract is not only a concept, it is a concrete type: `SurfaceMeshData`.

- Contract type:
  - `renderer/src/mesh/surfaceMesh.ts:100`
- Core fields:
  - `positions: Float32Array`
  - `indices: Uint32Array | null`
  - `normals?: Float32Array | null`
  - `uvs?: Float32Array | null`
  - `source: SurfaceMeshSource`
  - defined in `renderer/src/mesh/surfaceMesh.ts:102`
- Derived metadata carried with the same mesh object:
  - `adjacency?: number[][] | null`
  - `meanEdgeLength?: number | null`
  - `validation?: MeshValidation | null`
  - defined in `renderer/src/mesh/surfaceMesh.ts:107`

Every generator is normalized into this shape:

1. Graph, parametric, and Weierstrass bakers return mesh payloads in the same structure.
   - `renderer/src/math/bakeSurface.ts:500`
   - `renderer/src/math/bakeSurface.ts:523`
   - `renderer/src/math/bakeSurface.ts:577`
2. CGAL output is wrapped into `SurfaceMeshData` before mesh-mode rendering.
   - `renderer/src/App.tsx:15458`
   - `renderer/src/App.tsx:15468`
3. VTK outputs are converted into the same contract through `applyVtkResultToSurfaceMesh`.
   - `renderer/src/App.tsx:15056`
4. Imported mesh files (STL/OBJ/PLY/GLTF/GLB) are converted through `buildSurfaceMeshFromGeometry`.
   - `renderer/src/mesh/surfaceMesh.ts:261`
   - `renderer/src/mesh/surfaceMesh.ts:342`

After normalization, all mesh origins go through the same quality/analysis pass:

- `applySurfaceMeshOps` enforces consistency by running:
  - `computeVertexNormals`
  - `computeAdjacency`
  - `computeMeanEdgeLength`
  - `validateMesh`
- entry point:
  - `renderer/src/App.tsx:1043`

Important note on bounds in the current implementation:

- `bounds` are not persisted in `SurfaceMeshData` today.
- Bounds are computed on `THREE.BufferGeometry` in the rendering path (`computeBoundingBox` / `computeBoundingSphere`) when needed.
  - `renderer/src/components/SurfaceViewer.tsx:4968`

This is the exact point where mathematical variety (graph/parametric/implicit/Weierstrass/imported/VTK/CGAL) becomes architectural consistency in Math3D.

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

## Deep Rendering Pipeline (Renderer Internals)

The previous sections explain backend and runtime routing. This section describes the in-renderer frame pipeline in detail.

### 1. UI state -> viewer props -> renderer mode

`App.tsx` selects and mounts either `SurfaceViewer` or `ParamSurfaceViewer`, passing expression/domain/material/overlay/selection props.

- Surface viewer mount:
  - `renderer/src/App.tsx:24412`
  - `renderer/src/App.tsx:24419`
- Param viewer mount:
  - `renderer/src/App.tsx:24264`
- Shared sample callback wiring:
  - `renderer/src/App.tsx:24361`
  - `renderer/src/App.tsx:24504`

In geometry mode, `GeometryViewer` converts scene objects to `surface_mesh` overrides and reuses `SurfaceViewer`, so render/picking/gizmo behavior stays consistent.

- `renderer/src/components/GeometryViewer.tsx:138`
- `renderer/src/components/GeometryViewer.tsx:215`
- `renderer/src/components/GeometryViewer.tsx:229`
- `renderer/src/components/GeometryViewer.tsx:273`
- `renderer/src/geometry/render.ts:145`

### 2. Viewer bootstrap (WebGL context + scene graph)

Each viewer’s main `useEffect` performs full renderer bootstrap:

1. Create `WebGLRenderer`.
2. Apply pixel-ratio policy from quality mode and heavy-surface heuristics.
3. Create `Scene`, camera, orbit controls, and (where needed) transform controls.
4. Configure lighting and static helper groups.

Surface viewer anchors:

- `renderer/src/components/SurfaceViewer.tsx:3013` (`new THREE.WebGLRenderer`)
- `renderer/src/components/SurfaceViewer.tsx:3029` (`setPixelRatio`)
- `renderer/src/components/SurfaceViewer.tsx:3031` (`setClearColor`)
- `renderer/src/components/SurfaceViewer.tsx:3046` (`OrbitControls`)
- `renderer/src/components/SurfaceViewer.tsx:3051` (`TransformControls`)

Param viewer anchors:

- `renderer/src/components/ParamSurfaceViewer.tsx:2479`
- `renderer/src/components/ParamSurfaceViewer.tsx:2495`
- `renderer/src/components/ParamSurfaceViewer.tsx:2497`
- `renderer/src/components/ParamSurfaceViewer.tsx:2505`

Volume viewer anchors:

- `renderer/src/components/VolumeViewer.tsx:362`
- `renderer/src/components/VolumeViewer.tsx:367`
- `renderer/src/components/VolumeViewer.tsx:398`

### 3. Geometry/material build and attach

After bootstrap, viewers construct scene objects from source-specific data:

- `SurfaceViewer` dispatches by `surfaceId`, including implicit/graph presets and mesh overrides.
- `surface_mesh` path builds meshes from `SurfaceMeshOverride` typed arrays, preserves ids in `userData.__surfaceMeshOverrideId`, and applies per-object transform/style.
- The built object (mesh or group) is attached and stored in `surfaceObjRef`.

Anchors:

- `renderer/src/components/SurfaceViewer.tsx:3299` (`makeSurfaceMeshOverrideMesh`)
- `renderer/src/components/SurfaceViewer.tsx:3719` (`surfaceObjRef.current = surfaceObj`)

### 4. Sampling bridge for analysis features

Immediately after geometry creation/update, viewers build a `SurfaceSampleSet` from render geometry. This sample set is the common bridge to Gauss map, selection, geodesic picks, stats, and probe tools.

- Surface viewer sampling:
  - `renderer/src/components/SurfaceViewer.tsx:3752`
  - `renderer/src/components/SurfaceViewer.tsx:3830`
- Mesh incremental update sampling refresh:
  - `renderer/src/components/SurfaceViewer.tsx:5063`
  - `renderer/src/components/SurfaceViewer.tsx:5090`
- Param viewer sampling:
  - `renderer/src/components/ParamSurfaceViewer.tsx:3192`
  - `renderer/src/components/ParamSurfaceViewer.tsx:3265`

### 5. Interaction pipeline (pointer -> raycast -> domain callback)

Interaction is resolved in the render layer:

1. Pointer event normalizes screen coordinates.
2. `Raycaster` intersects active mesh/group.
3. Hit normal/UV/barycentric info is computed.
4. Mode-specific callbacks emit semantic events (probe, select, inspect, geodesic, drag, gizmo transforms).

Anchors:

- Surface viewer raycast and pointer modes:
  - `renderer/src/components/SurfaceViewer.tsx:4068`
- Param viewer raycast and pointer modes:
  - `renderer/src/components/ParamSurfaceViewer.tsx:3450`
- Surface gizmo event bridge:
  - `renderer/src/components/SurfaceViewer.tsx:3196`
  - `renderer/src/components/SurfaceViewer.tsx:3197`

### 6. Frame loop and draw order

Each viewer runs a continuous RAF loop:

- Update controls (and per-frame dirty work such as param slice refresh).
- Render `scene + camera`.
- Optional skip path in surface viewer via `suspendRenderingRef`.

Anchors:

- Surface viewer:
  - `renderer/src/components/SurfaceViewer.tsx:4469`
  - `renderer/src/components/SurfaceViewer.tsx:4470`
  - `renderer/src/components/SurfaceViewer.tsx:4473`
- Param viewer:
  - `renderer/src/components/ParamSurfaceViewer.tsx:3691`
  - `renderer/src/components/ParamSurfaceViewer.tsx:3697`
- Volume viewer:
  - `renderer/src/components/VolumeViewer.tsx:459`
  - `renderer/src/components/VolumeViewer.tsx:461`

### 7. Incremental mesh updates vs full scene rebuild

`SurfaceViewer` has a dedicated incremental update effect for `surface_mesh` overrides:

- Rebuild object graph only if override identity/topology structure changed.
- Otherwise patch buffer attributes in place (`position`/`index`/`normal`/`uv`), recompute bounds, and update material state.
- Recompute sample sets and bounding helpers after patching.

Anchors:

- `renderer/src/components/SurfaceViewer.tsx:4841`
- `renderer/src/components/SurfaceViewer.tsx:4907`
- `renderer/src/components/SurfaceViewer.tsx:5063`

### 8. Resize, reframe, and quality re-evaluation

All viewers handle resize with `ResizeObserver` + window resize listeners, and re-apply:

- renderer size
- camera aspect/projection
- pixel ratio policy
- optional reframe-to-fit logic using current bounds/radius

Anchors:

- Surface viewer:
  - `renderer/src/components/SurfaceViewer.tsx:4408`
  - `renderer/src/components/SurfaceViewer.tsx:4461`
- Param viewer:
  - `renderer/src/components/ParamSurfaceViewer.tsx:3709`
  - `renderer/src/components/ParamSurfaceViewer.tsx:3762`
- Volume viewer:
  - `renderer/src/components/VolumeViewer.tsx:453`

### 9. Deterministic teardown and GPU cleanup

On effect cleanup/unmount, viewers:

- remove event listeners
- detach/dispose controls
- traverse and dispose mesh geometry/material resources
- dispose renderer and remove canvas
- clear refs and emit `onSampleSet(null)` where applicable

Anchors:

- Surface viewer:
  - `renderer/src/components/SurfaceViewer.tsx:4498`
  - `renderer/src/components/SurfaceViewer.tsx:4624`
  - `renderer/src/components/SurfaceViewer.tsx:4630`
- Param viewer:
  - `renderer/src/components/ParamSurfaceViewer.tsx:3852`
  - `renderer/src/components/ParamSurfaceViewer.tsx:3859`
- Volume viewer:
  - `renderer/src/components/VolumeViewer.tsx:470`

## Installation and Runtime Scenarios

Math3D supports desktop and browser runtimes with shared React/TypeScript renderer logic.

| Scenario | Stack | Typical commands | Best use case |
|---|---|---|---|
| Desktop app | Electron shell + React + TypeScript renderer | `npm run build:core` then `npm run build` | Full desktop workflow and packaged installer distribution |
| Browser app (local) | React + TypeScript web runtime (Vite) + local worker proxy | `npm run dev:web` (dev) or `npm run build:web` and `npm run preview:web` (prod preview) | Browser-first usage and faster UI iteration |
| Browser app (Docker, self-contained) | Containerized web runtime + Python worker dependencies | `docker compose -f docker-compose.web.yml up --build` | Reproducible environment without local Python/worker setup |

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
