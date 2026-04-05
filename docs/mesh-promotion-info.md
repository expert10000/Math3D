# Mesh Promotion Info

This note explains why `Promote` can create a detached mesh object and where both mesh forms are stored.

## Why `Promote` can produce a detached mesh

`Promote` first tries bake/promotion to `SurfaceMesh`.  
If bake is unavailable but a mesh dataset exists, it falls back to converting the dataset into a Geometry mesh object.

Key paths:

- `renderer/src/App.tsx:21306` (`promote` action chooses bake first)
- `renderer/src/App.tsx:21309` (fallback to `convertMesh`)
- `renderer/src/App.tsx:20735` (`convertMesh` action route)
- `renderer/src/App.tsx:7030` (`handleDatasetToGeometryScene`)
- `renderer/src/App.tsx:7044` (`mesh: toDetachedMeshData(surfaceMeshData)`)

`toDetachedMeshData` marks the source as detached so it is treated as an independent object:

- `renderer/src/App.tsx:1075`
- `renderer/src/mesh/surfaceMesh.ts:16`
- `renderer/src/mesh/surfaceMesh.ts:61`

UI text also documents this behavior:

- `renderer/src/App.tsx:25320`
  - "Promotion stays in Surfaces. Conversion creates a detached mesh object in Geometry."

## Where each one is kept (runtime state)

### 1. Surface mesh dataset (`surface_mesh`)

Stored in Surfaces dataset state:

- `renderer/src/App.tsx:6440` (`meshDataset`)
- `renderer/src/App.tsx:6572` (`surfaceMeshData = meshDataset?.mesh ?? null`)
- `renderer/src/App.tsx:6894` (`setMeshDatasetState(toMeshDataset(mesh))`)

### 2. Detached mesh object (Geometry)

Stored as scene mesh objects in Geometry:

- `renderer/src/App.tsx:4736` (`geometryDatasetMeshObjects`)
- `renderer/src/App.tsx:1146` (`GeometryDatasetMeshObject` type)
- `renderer/src/App.tsx:7053` (detached object inserted into `geometryDatasetMeshObjects`)

## Persistence in `.math3d` bundle

### Surface mesh dataset

Saved as dataset item `id: "surface:mesh"` and restored on load:

- `renderer/src/App.tsx:13155`
- `renderer/src/App.tsx:13162`
- `renderer/src/App.tsx:13602`
- `renderer/src/App.tsx:13604`

### Detached Geometry mesh objects

Detached mesh objects are in runtime `geometryDatasetMeshObjects`, while workspace geometry serialization maps `geometryObjects`:

- `renderer/src/App.tsx:13235`

So conceptually:

- `surface_mesh` is the active Surfaces dataset mesh.
- detached mesh is a copied Geometry scene object (independent snapshot), not a live two-way link.
