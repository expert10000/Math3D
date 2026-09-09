# Algorithms Used in Math3D

This page explains what we use Marching Cubes for, plus the other core geometry/analysis algorithms in this project.

## Marching Cubes: what and why

Marching Cubes extracts a triangle mesh for an isovalue from a 3D scalar grid.

In Math3D, it is used for **volume isosurface extraction**:

- Local CPU path: `renderer/src/math/marchingCubes.ts` (`marchingCubesVolume`).
- Runtime use: `renderer/src/components/VolumeViewer.tsx` (`buildCpuIsosurface`).
- It is a fallback path when the VTK isosurface request fails, and only for moderate grid sizes.

So, in this app, Marching Cubes is mainly a **reliable local fallback** for isosurface rendering in the Volume viewer.

## Other algorithms (what we use them for)

| Algorithm | What it is used for | Main code paths |
|---|---|---|
| VTK Flying Edges (fallback: VTK Marching Cubes) | Fast backend isosurface extraction for implicit preview and volume isosurfaces | `python/worker/worker_impl.py` (`handle_vtk_preview`, `handle_volume_isosurface`) |
| Marching Squares | 2D contour extraction and plane/surface intersection curves | `renderer/src/math/marchingSquares.ts`, used in `renderer/src/scene/volume/sliceVolume.ts`, `renderer/src/components/SurfaceViewer.tsx`, `renderer/src/components/ParamSurfaceViewer.tsx`, `renderer/src/App.tsx` |
| Regular grid triangulation (quad split) | Build meshes from explicit/parametric/Weierstrass sampled grids | `renderer/src/math/bakeSurface.ts` |
| CGAL implicit meshing (via `pygalmesh`) | Final-quality robust implicit surface meshing | `python/worker/worker_impl.py` (`pygalmesh.generate_surface_mesh`) |
| Dijkstra shortest path on mesh graph | Discrete geodesic path and distance on triangle meshes | `renderer/src/math/selection/geodesicGraph.ts` |
| Heat method geodesics (cotan Laplacian + sparse solves) | Continuous geodesic path in Python worker | `py/geodesic/heat.py`, `py/geodesic/mesh_ops.py` |
| Cotangent surface field calculus | Vertex gradient, weak FEM divergence, oriented normal-curl, and Laplace–Beltrami fields in Mesh Analyze | `renderer/src/mesh/meshSurfaceFieldCalculus.ts` |
| Trilinear interpolation + central differences | Scalar sampling and gradient magnitude on volume slices | `renderer/src/scene/volume/sliceVolume.ts` (`sampleGridTrilinear`, `gradientMagnitudeAt`) |
| RK4 streamline integration (VTK StreamTracer) | Vector-field streamlines in volume mode | `python/worker/worker_impl.py` (`handle_volume_streamlines`) |
| VTK clean/decimate/smooth filters | Mesh cleanup and optimization after generation/import | `python/worker/worker_impl.py` (`handle_vtk_job`) |

## Surface field-calculus conventions

Mesh Analyze uses a lumped barycentric vertex mass, `Mᵢᵢ = Σ Aₜ/3`. Its cotangent Laplace–Beltrami operator is `Δf = M⁻¹Lf`, with off-diagonal edge weights `(cot α + cot β)/2` and a diagonal equal to the negative row sum. With this sign convention, coordinate functions on the unit sphere satisfy `Δx ≈ -2x`, and similarly for `y` and `z`.

Scalar gradients are piecewise linear on each triangle and area-averaged at vertices. Divergence uses the weak finite-element form after projecting the input vector onto each face tangent plane. Normal-curl follows the triangle-winding orientation and is defined by `curlₙ X = divₛ(X × n)`. Divergence, normal-curl, and Laplacian values at boundary vertices are marked invalid rather than silently imposing a boundary condition.

## Practical rule of thumb

- Need fast implicit/volume preview: use VTK path (Flying Edges / VTK MC fallback).
- Need robust final implicit mesh: use CGAL meshing path.
- Need contours or section lines: use Marching Squares.
- Need local isosurface fallback in viewer: use Marching Cubes path.
