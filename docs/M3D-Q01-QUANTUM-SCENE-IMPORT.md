# M3D-Q01 quantum-scene import boundary

Status: implemented as a read-only Math3D import adapter. Desktop navigation
and direct Theory Lab opening belong to later integration work.

`src/main/quantumScene` pins Theory Lab's `quantum-scene/v1` schema at commit
`fde58fd` (source JSON SHA-256
`90d98ee42cae0f613cf55232f93b3faf91d0936521f156a52db6dfe4887fb237`).
It independently validates the strict versioned scene, semantic references,
f64le arrays and SHA-256 hashes. A regular `.qscene` folder must contain
exactly `bundle.json`, `scene.json`, and its declared datasets. The importer
rejects linked roots/files, unknown members, unexpected schema versions,
wrong byte lengths, changed hashes and non-finite or inconsistent data.

The adapter produces a Math3D `SceneDocument`-shaped scene. Visible source
point clouds, polylines, endpoint segments and indexed meshes map to existing
Math3D geometry without coordinate conversion; a 20,000-primitive cap defers
oversized objects rather than truncating them. The source camera, axes,
units, provenance, dataset descriptors, source object IDs and annotations
remain in the returned validated scene/extension. Vector objects, scalar or
complex fields and hidden objects are marked deferred, because rendering or
unit interpretation needs a dedicated later adapter. Verified numerical
arrays remain available on the returned import result; they are not invented
from the Math3D geometry.

This boundary has no worker call and no direct Theory Lab connection. It does
not yet expose a desktop picker or an `Open in Math3D` action. Those are
separate integration steps after the importer is accepted.

Acceptance: `npm run test:quantum-scene:import` builds the Node module and
tests a bounded bundle plus mutation refusals. The script also accepts a
Theory Lab `.qscene` folder path as an optional argument for cross-repository
acceptance; evolution, orbital and supplied-band bundles were checked during
M3D-Q01 delivery.
