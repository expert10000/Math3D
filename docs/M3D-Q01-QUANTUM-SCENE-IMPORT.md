# M3D-Q01 quantum-scene import boundary

Status: complete as a strict read-only importer and native Project-document
lifecycle. Direct Theory Lab opening is supported through a verified handoff;
editable Geometry/Volume conversion remains outside M3D-Q01.

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
remain in the returned validated scene/extension. Vector objects, native scalar
or complex field documents and hidden objects are marked deferred, because full
project admission or unit interpretation needs a dedicated later adapter. A
bounded field-slice inspector covers supplied scalar/complex grids: main retains
verified arrays and the renderer receives a small RGBA plane or bounded derived
surface plus exact selected samples. Verified numerical
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
The read-only preview can reveal its exported `.qscene` folder in the system
file manager. That action reopens and hashes the source bundle first, accepts
only the active scene fingerprint from the renderer, and refuses changed or
missing sources. It does not infer a path to the original Theory Lab run.

Projects may retain the scene as a link or explicitly admit a compact
`math3d.quantum-scene-document`. The latter stores versioned source descriptors,
run and result provenance, units, dataset hashes and the scene fingerprint; it
does not copy field arrays. The Project save/open path re-verifies the complete
external bundle. Portable JSON import retains the document but requires that
same verified folder to activate it. Relinking changes only the local location
in the Project link and checkpoint, not the scientific document identity.
Navigation uses the existing scene preview and inspectors, never an editable
Geometry/Volume editor or a physics worker. The desktop acceptance checks
admission, save, portable import, restart, tamper refusal and rollback.
