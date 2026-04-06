# Mesh Promotion Pipeline

Pipeline:

`Equation/Surface definition -> SurfaceMesh dataset -> Detached Mesh object (Geometry)`

## Equation input is held in app state

Graph/implicit/param/weierstrass expressions and domains are stored in app state.

- `renderer/src/App.tsx:6525`
- `renderer/src/App.tsx:6659`

## Promote to SurfaceMesh (equation -> mesh dataset)

Main entry is `handleConvertToMesh`.

- `renderer/src/App.tsx:15458`

Routing by viewer kind:

- Graph -> `bakeGraphSurface`
  - `renderer/src/math/bakeSurface.ts:500`
- Param -> `bakeParamSurface`
  - `renderer/src/math/bakeSurface.ts:523`
- Weierstrass -> `bakeWeierstrassSurface`
  - `renderer/src/math/bakeSurface.ts:577`
- Implicit -> CGAL request `runCgalMesh`
  - `renderer/src/App.tsx:18903`
  - IPC bridge: `src/main/ipc/cgalMeshIpc.ts:69`

## Mesh post-processing/quality pass

Every produced mesh goes through `applySurfaceMeshOps` (normals, adjacency, mean edge, validation).

- `renderer/src/App.tsx:1043`

## Store as SurfaceMesh dataset

Stored via `setMeshDataset`, wrapped as `MeshDataset`.

- `renderer/src/App.tsx:6981`

## Render dataset mesh in Surfaces viewer

Viewer renders `surfaceId="surface_mesh"` using mesh override path.

- `renderer/src/components/SurfaceViewer.tsx:3245`

## Convert to Mesh object (SurfaceMesh dataset -> detached Geometry object)

`handleDatasetToGeometryScene` creates a `GeometryDatasetMeshObject` from current dataset.

- `renderer/src/App.tsx:7117`

Source is marked detached by `toDetachedMeshData`.

- `renderer/src/App.tsx:1076`

## Geometry scene rendering + transform gizmo

Geometry passes mesh list to `GeometryViewer` via `meshOverrides`, then into `SurfaceViewer`.

- `renderer/src/App.tsx:28714`
- `renderer/src/components/GeometryViewer.tsx:208`

Per-object IDs are stored as `__surfaceMeshOverrideId`, and gizmo attaches by selected `gizmoMeshKey`.

- `renderer/src/components/SurfaceViewer.tsx:3332`
- `renderer/src/components/SurfaceViewer.tsx:5126`

## Important naming distinction

- Promote to SurfaceMesh = equation/surface definition -> dataset mesh
- Convert to Mesh object = dataset mesh -> detached scene object

## Render pipeline (similar)

### Surfaces render pipeline

`App state -> SurfaceViewer props -> Three.js scene object build -> frame loop -> pick/gizmo`

1. App computes active source state (`surfaceViewerKind`, `surfaceMeshData`, implicit/graph inputs) and mounts `SurfaceViewer`.
   - `renderer/src/App.tsx:24393`
   - `renderer/src/App.tsx:24400`
2. `SurfaceViewer` initializes renderer/camera/orbit/gizmo controls.
   - `renderer/src/components/SurfaceViewer.tsx:1290`
   - `renderer/src/components/SurfaceViewer.tsx:3051`
3. For `surfaceId="surface_mesh"`, mesh geometry is built from `surfaceMeshOverride`/`surfaceMeshOverrides` via `makeSurfaceMeshOverrideMesh`.
   - `renderer/src/components/SurfaceViewer.tsx:3299`
   - `renderer/src/components/SurfaceViewer.tsx:3332`
4. Built object is added to scene and cached in `surfaceObjRef`.
   - `renderer/src/components/SurfaceViewer.tsx:3719`
5. Render loop runs every frame (`controls.update()` + `renderer.render(scene, camera)`).
   - `renderer/src/components/SurfaceViewer.tsx:4468`
   - `renderer/src/components/SurfaceViewer.tsx:4473`
6. Pointer picks resolve mesh ids (`__surfaceMeshOverrideId`) and gizmo attaches to selected mesh key.
   - `renderer/src/components/SurfaceViewer.tsx:4129`
   - `renderer/src/components/SurfaceViewer.tsx:5126`
   - `renderer/src/components/SurfaceViewer.tsx:5136`

### Geometry render pipeline

`Geometry scene model -> Geometry render data + mesh overrides -> SurfaceViewer(surface_mesh) -> gizmo callback -> transform state update`

1. `GeometryViewer` derives render payload from geometry scene via `buildGeometryRenderData`.
   - `renderer/src/components/GeometryViewer.tsx:95`
   - `renderer/src/components/GeometryViewer.tsx:138`
   - `renderer/src/geometry/render.ts:145`
2. App passes procedural mesh instances as `meshOverrides` and current selection as `gizmoMeshKey`.
   - `renderer/src/App.tsx:28709`
   - `renderer/src/App.tsx:28714`
   - `renderer/src/App.tsx:28757`
3. `GeometryViewer` forwards everything into `SurfaceViewer` as `surfaceId="surface_mesh"` + `surfaceMeshOverrides`.
   - `renderer/src/components/GeometryViewer.tsx:215`
   - `renderer/src/components/GeometryViewer.tsx:229`
4. Transform gizmo events flow back through `onGizmoTransform`, then App updates object transforms.
   - `renderer/src/components/GeometryViewer.tsx:273`
   - `renderer/src/App.tsx:5463`
   - `renderer/src/App.tsx:5154`

## SurfaceMesh vs Mesh object

`SurfaceMesh` and `Mesh object` are different layers in Math3D.

### SurfaceMesh

- Dataset representation of one surface (positions/indices/normals/uvs + analysis metadata)
- Lives in Surfaces dataset state (`meshDataset`)
  - `renderer/src/App.tsx:6527`
  - `renderer/src/App.tsx:6659`
- Used for analysis and processing (normals, adjacency, curvature/geodesics, export)

### Mesh object

- Scene object instance in Geometry mode
- Wraps mesh data plus object properties (`id`, `name`, `transform`, `visible`, `material`)
- Type is `GeometryDatasetMeshObject`
  - `renderer/src/App.tsx:1147`
- Can be moved/rotated/scaled with gizmo and managed as a scene object

### Conversion summary

- Promote to SurfaceMesh: equation/surface definition -> dataset mesh
- Convert to Mesh object: dataset mesh -> detached scene mesh object (`source.kind = "detachedMesh"`)
  - `renderer/src/App.tsx:1076`
  - `renderer/src/App.tsx:7117`

In short:

- `SurfaceMesh` = analysis dataset
- `Mesh object` = editable scene instance
