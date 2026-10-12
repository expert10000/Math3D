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

Next: SSR-02 wraps one already-verified hydrogenic 2p `.qscene` into this manifest without changing its bytes, old schema, importer or viewer. SSR-03 adds the independent non-quantum fixture and common read-only display path. A Python publisher is outside the first release.
