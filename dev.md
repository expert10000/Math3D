# Math3D Developer Notes

This file holds developer-focused notes that were previously mixed into `readme.md`.

User-facing setup/run/build instructions are now in [readme.md](readme.md).

## Recent Additions

- Added an Object tab with selected-object identity/properties/actions.
- Added scalable Scene contents with row actions and grouped/flat modes.
- Added explicit scene roles for multi-object workflows:
  `PrimaryObject`, `Overlay`, `DerivedResult`, `ReferenceObject`.
- Added a docked status bar with persistent context and wrapped tokens.
- Added Geometry Viewer construction primitives, constraints, stereometry analysis, and face overlays.
- Added `Convert to Mesh...` for baking active surfaces into SurfaceMesh datasets.
- Added an implicit baker (marching cubes) with independent bounds/resolution, progress, and cache.
- Added SurfaceMesh exports (GLB/OBJ) and weld-vertices tooling.
- Added graph/param/Weierstrass baking paths (sampling + triangulation + invalid-point skipping).
- Added Complex map tab with sweep output choices and 3D isolines.
- Split SurfaceMesh controls into Surface/Volume tabs.
- Added linked orthogonal volume slices with crosshair readout.
- Added geodesic disk selection (heat/Dijkstra), boundary extraction, and disk stats.
- Added volume slice overlays (contours, probe, histogram, auto window/level).
- Added VTK-backed volume isosurface extraction with optional smoothing.
- Added volume sampling controls with crop box + gizmo.
- Added volume presets with adjustable parameters and custom `F(x,y,z)` entry.
- Added Weierstrass mode and presets (Enneper, Catenoid, Helicoid).
- Added Gauss map inspector and density heatmap.
- Added selection stats panel with curvature statistics/histogram.
- Added inspect mode with persistent probe markers/readout.
- Added domain navigator for graph/param/Weierstrass with 2D pick + sync.
- Added curvature line streamlines and ridge/valley overlays.
- Added geodesic distance heatmaps for graph/param/Weierstrass mesh flows.
- Added VTK worker operations for mesh/volume processing and streamlines.
- Refined Surfaces UI hierarchy with grouped `Surface family`/`Tools`/`Advanced` controls,
  stronger active states, and progressive disclosure (`More/Less`) for lower-frequency families.
- Reworked preset selection into a thumbnail card gallery with a linked details pane
  (selected preset, formula/profile map, and quick actions) and integrated top header/navigation
  controls into one coherent section/mode/view system.

## Browser + Worker Notes

- Browser mode uses `apps/web/server/worker-proxy.cjs`.
- Proxy route base: `/api/worker`.
- Preferred browser worker backend for distribution:
  - `MATH3D_WORKER_MODE=exe`
  - worker binary at `build/python-worker-dist/worker.exe`
- Script backend remains supported for local development:
  - `MATH3D_WORKER_MODE=python` or `auto`
  - uses `MATH3D_PYTHON` + `python/worker/main.py`

## Release Assets

GitHub release workflow publishes Windows installer assets:

- `Math3D-Setup-<version>.exe`
- `Math3D-<version>-win-portable.zip` (when available)
- `SHA256SUMS.txt`

Tag format:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

## Docs

- MkDocs content: `docs/`
- API docs: `docs/api/` (generated via TypeDoc)
- Site build output: `site/`

## Docker

- Web preview container files:
  - `Dockerfile.web-preview`
  - `docker-compose.web.yml`
- Container mode uses Python worker backend (`MATH3D_WORKER_MODE=python`).
- Windows bundled worker executable (`worker.exe`) is not used in Linux containers.
