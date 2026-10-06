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
remain in the returned validated scene/extension. Vector objects, full scalar or
complex field surfaces and hidden objects are marked deferred, because rendering or
unit interpretation needs a dedicated later adapter. A bounded field-slice
inspector now covers supplied scalar/complex grids without claiming a 3D
isosurface: the main process retains verified arrays, and the renderer receives
only a small RGBA plane plus an exact selected sample. Verified numerical
arrays remain available on the returned import result; they are not invented
from the Math3D geometry.

This boundary has no worker call and no direct Theory Lab connection. The
first desktop integration slice adds a main-process folder picker exposed as
`window.quantumScenes.open()`. The renderer cannot supply an arbitrary path;
main verifies the selected bundle before returning a read-only scene document
and explicit mapped/deferred IDs. Theory Lab can launch this preview directly.
A saved `.math3d` workspace retains the source folder and fingerprint; opening
the workspace rechecks the complete `.qscene` and refuses a missing or changed
source. An editable Math3D scene workspace remains later integration work.

Acceptance: `npm run test:quantum-scene:import` builds the Node module and
tests a bounded bundle plus mutation refusals. The script also accepts a
Theory Lab `.qscene` folder path as an optional argument for cross-repository
acceptance; evolution, orbital and supplied-band bundles were checked during
M3D-Q01 delivery. Real 1s and 2p orbital bundles are now pinned as ongoing
M3D-Q02 compatibility fixtures, joined by real 2s, 3p and 3d bundles. Their
stored inputs, density/node samples, units and surface phase/sign bins are
checked without adding a Math3D physics engine. A bounded, read-only density
isosurface preview is derived from those verified amplitude grids in Electron
main; it does not create a native editable Volume document.
