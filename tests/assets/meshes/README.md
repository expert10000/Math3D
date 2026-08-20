# Math3D Mesh Benchmark Assets

Generated/downloaded by `math3d_mesh_benchmark.py`.

## Folders

- `basic/` - deterministic small geometry.
- `standard/` - standard OBJ/STL test models.
- `stress/` - performance-oriented models.
- `libigl/` - OBJ models extracted from the libigl tutorial data set.
- `problematic/` - deterministic meshes with known mesh problems.
- `expected/` - expected/reference metadata for deterministic regression tests.
- `registry.json` - UI-facing benchmark catalog consumed by Math3D dev tools.

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
- libigl Armadillo / Face / Cube 40k
- optional Dragon High
- optional dense binary STL

## Registry

`registry.json` describes what Math3D exposes in developer-only benchmark UI.
Each model declares:

- `id` - stable UI/API id.
- `name` - display name.
- `category` - one of `basic`, `standard`, `mathematical`, `problematic`, `stress`, or `libigl`.
- `file` - OBJ/STL path relative to this folder.
- `expected` - optional expected JSON path relative to this folder.
- `tests` - capabilities/suites such as `import`, `topology`, `boundary`, `selection`, `analysis`, and `performance`.

The application reads this registry at runtime in development builds, so adding a
benchmark model should not require editing the Math3D UI catalog.

## Notes

Downloaded and bundled model files remain subject to their upstream source/license terms.
The generated deterministic meshes in `basic/` and `problematic/` are produced
by the bootstrap script specifically for Math3D testing.

`manifest.json` records exact source URLs and SHA-256 hashes of files downloaded
during the current run, plus bundled libigl OBJ files integrated from the local
`libigl-tutorial-data-master.zip` archive.
