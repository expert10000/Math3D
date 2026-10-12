# SSR-01 — minimal scientific scene manifest

**Status:** Implemented as a pure shared TypeScript contract and strict metadata validator. It is **not** yet a scene importer, renderer route, Project document or compute provider. No existing `.qscene` bundle is rewritten or admitted through this new validator.

The contract is `ScientificSceneManifest` in `packages/core/src/scientificSceneManifest.ts`, exported from `@math3d/core`. Desktop, web and mobile can use this small, dependency-free module. `parseScientificSceneManifest` caps raw JSON before parsing; `normalizeScientificSceneManifest` validates in-memory data and returns a detached JSON value. Importers must still read each referenced file under their own trusted file boundary and check its declared SHA-256 against the bytes. A well-formed descriptor alone is not a verified artifact.

## Deliberately narrow v1 vocabulary

| Part | Current bounded rule |
| --- | --- |
| Envelope | Exact `scientific-scene/v1` version, stable scene ID/title and supplied source ID/schema/hash. Unknown keys or versions fail closed. |
| Resources | Flat local `.f64` names only; little-endian Float64, scalar count, exact byte size and lowercase SHA-256. No URL, traversal, nested path, Windows device name or executable payload. |
| Coordinates | One to three named axes with units, kind (`cartesian`, `reciprocal` or `index`), origin, positive spacing and periodic flags. Native coordinates remain separate from any later displayed 3D projection. |
| Datasets | `scalar-field` or planar `complex-scalar-field`; explicit shape, `last-axis-fastest` order, quantity/unit and resource IDs. Real/imaginary resources must match the same shape. |
| Views | Optional `slice` for a 3D field or `height-surface` for a 2D field. Operations are only `identity` on scalar data or registered `complex-density/v1` on complex data. No expressions are evaluated from the manifest. |
| Budgets | 64 KiB metadata, 16 MiB total binary descriptors, at most 16 resources/datasets/views and eight coordinate systems. |

This vocabulary is enough to describe the planned pinned hydrogenic 2p adapter and a non-quantum `sin(x)cos(y)` scalar fixture. It does not yet represent QWZ band/topology semantics, arbitrary meshes, vector/tensor fields or streaming; those require explicit later extensions and acceptance. Source hashes identify bytes, not producer authenticity or scientific correctness.

## Verification performed

- Six unit tests cover valid scalar/complex descriptors, unknown versions/fields, formula refusal, paths and hashes, shape/unit mismatches, duplicate/orphan resources, view compatibility and metadata budgets.
- Full TypeScript check and `npm run build:core` pass.
- Existing `npm run test:quantum-scene:import` passes unchanged, including the pinned orbital, QWZ, SSH and tamper tests.
- The renderer entry remains exactly **864,267 gzip bytes** with the same generated filename as the [pre-contract baseline](scientific-scene-footprint-baseline.md). The new contract is tree-shaken out of the startup bundle because no runtime view imports it yet. A three-run idle memory sample showed the same approximate 42.1 MB renderer heap; process working-set variation was within the baseline run-to-run spread. These observations are not a release performance guarantee.

SSR-02 now wraps the pinned hydrogenic 2p `.qscene` through `importQuantumFieldScientificManifest`. It calls the original bounded, hash-verifying `.qscene` importer first; the adapter only maps its verified descriptors. The original source, arrays, camera, annotations and provenance remain in the imported result. The generic manifest retains the same real/imaginary file paths, byte counts and hashes, plus the existing verified-scene fingerprint as its source identity. `complex-density/v1` is a declarative display derivation, not a supplied dataset. Scenes outside the current single regular Cartesian complex-field subset fail closed. The old open/restart/viewer path is unchanged, and no new UI action is claimed.

SSR-03 adds the deterministic non-quantum `tests/fixtures/scientific-scene/sincos.sscene` bundle. Its `manifest.json` is protected by a small `scientific-scene-bundle/v1` envelope; `values.f64` is protected by its descriptor SHA-256. The desktop reader applies the **same** pure `scientific-scene/v1` validator compiled into the main process, then performs bounded file, byte-hash and finite-value checks. The original shared TypeScript source remains the renderer/web validator. The fixture generator supports `--check` to detect drift, and the packaged desktop includes this one example.

In Math3D desktop, open **File → Verified quantum examples… → Scientific interchange proof → sin(x) cos(y**. This temporary examples-picker placement adds a non-quantum proof without changing the existing quantum entries. The read-only height mesh uses the existing GeometryViewer/SurfaceViewer path. Clicking the mesh or **Inspect center sample** requests a fresh source verification and reports the exact stored grid index, coordinates and units. The formula was used to create the fixture offline; no expression from the bundle is executed on import. Source identity is producer-supplied; manifest and resource hashes prove byte integrity, not authenticity or physical correctness.

Acceptance: `npm run test:scientific-scene` covers both quantum and scalar manifests, exact samples, malformed shape/version, changed metadata and changed binary data. The desktop Playwright test covers opening and selection. The original quantum importer suite remains green. The renderer entry grew by 59 gzip bytes versus the SSR baseline (864,267 → 864,326); all JavaScript chunks grew by 3,377 gzip bytes (2,379,502 → 2,382,879), well below the initial 100 KiB incremental target. These are build measurements, not startup or memory guarantees.

SSR-04 [measured](scientific-scene-lifecycle-measurements.md) loading, idle cost, bounded dataset copies and unload for both proof fixtures. A general `.sscene` picker, Project link and Python publisher remain separate decisions.
