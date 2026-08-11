# Math3D Mesh Benchmark Assets

Generated/downloaded by `math3d_mesh_benchmark.py`.

## Folders

- `basic/` - deterministic small geometry.
- `standard/` - standard OBJ/STL test models.
- `stress/` - performance-oriented models.
- `problematic/` - deterministic meshes with known mesh problems.
- `expected/` - expected/reference metadata for deterministic regression tests.

## Recommended test tiers

### Smoke
- `01_tetrahedron.obj`
- `02_cube.obj`
- `03_cube_ascii.stl`
- `15_open_boundary.obj`
- `16_non_manifold_edge.obj`
- `18_degenerate_faces.obj`

### Standard
- Torus
- Suzanne
- Fandisk
- Stanford Bunny
- Spot
- 3DBenchy
- problematic meshes

### Performance
- Armadillo
- Dragon Medium
- optional Dragon High
- optional dense binary STL

## Notes

Downloaded model files remain subject to their upstream source/license terms.
The generated deterministic meshes in `basic/` and `problematic/` are produced
by the bootstrap script specifically for Math3D testing.

`manifest.json` records exact source URLs and SHA-256 hashes of files downloaded
during the current run.
