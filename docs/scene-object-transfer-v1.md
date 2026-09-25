# Math3D semantic scene-object transfer v1

`math3d.scene-object` is the portable, deterministic envelope for moving one supported scene object without losing its editable mathematical definition.

## Supported object kinds

- `explicit`, `parametric`, `implicit`, and `weierstrass` retain their formulas, domains, and resolution intent.
- `mesh` requires bounded embedded positions/indices or an explicit computed-result reference. A mesh source string alone is insufficient.
- Transform, visibility, supported style, source provenance, compatible analysis metadata, producer identity, and a canonical SHA-256 content hash travel with the object.

The v1 content hash covers `object`, `geometry`, and `analysisMetadata`. Producer and transfer provenance are deliberately excluded so repackaging identical semantic content does not change its identity. Serialization uses recursively key-sorted canonical JSON.

## Dependency and safety boundary

V1 rejects undeclared dependency fields, external URLs, device paths, parent-path traversal, access tokens, malformed/future versions, hash mismatches, non-finite values, invalid indices, and payloads over the published bounds. Provenance contains logical source identities only—never device paths or credentials.

Self-contained embedded meshes are limited to 250,000 vertices and 500,000 triangles. Larger geometry belongs in a separately admitted project/object import pipeline. A `computed-result-reference` is explicit and hash-addressed; consumers must resolve it through a trusted result registry and cannot silently treat it as embedded geometry.

## Migration

The reader migrates the legacy v0 semantic-surface fixture to v1 with identity transform, visible state, empty style, no cached geometry, and limited provenance. Legacy mesh records are rejected because they do not contain reconstructable geometry. Unknown future versions are rejected without mutation.

The reviewed fixture corpus is in `packages/core/fixtures/scene-object`.
