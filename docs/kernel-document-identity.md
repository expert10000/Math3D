# Shared document identity and structural hashing

F02 introduces the minimum shared identity contract used by later kernel,
Topology, and Complex Analysis commits.  It does not migrate an existing module or
rewrite an existing file when that file is opened.

## Identity contract

A versioned identity contains four small, JSON-safe fields:

- `schemaVersion`: currently `1`;
- `id`: a stable `math3d:<kind>:<32 hex>` identifier;
- `revision`: a positive, monotonically increasing safe integer;
- `structuralHash`: `sha256:<64 hex>` over canonical mathematical source.

`createStableDocumentId(kind, stableKey)` is deterministic and has no clock,
random-number, renderer, or process dependency.  The stable key must represent a
persistent external key, import locator, or fixture seed.  It must not be mutable
document content: editing a document advances its revision but retains its ID.

`advanceDocumentIdentity(identity, source)` returns the same identity for an
unchanged canonical source.  A changed source retains the ID, increments revision
exactly once, and records the new structural hash.  Revision overflow is rejected.

## Canonical JSON and structural hash

`canonicalJsonStringify` accepts only strict JSON values.  It recursively sorts
object keys, preserves array order, normalizes negative zero, and rejects non-finite
numbers, accessors, class instances, sparse/custom arrays, unsupported values, and
cycles.  `structuralHash` hashes those canonical UTF-8 bytes with SHA-256.

Canonicalization does not reorder arrays or apply module-specific mathematical
normalization.  A module must supply its already-normalized authoritative source.

## Field authority

Every document adapter defines an exhaustive top-level field policy:

| Authority | Serialized | Structural hash | Meaning |
| --- | --- | --- | --- |
| `structural` | yes | yes | Mathematical source or semantics-bearing extension. |
| `persistent-metadata` | yes | no | Identity, labels, timestamps, ownership, or descriptive metadata. |
| `persistent-display` | yes | no | Saved cameras, overlays, and other presentation preferences. |
| `transient-display` | no | no | Hover, drag, animation, focus, and other runtime-only UI state. |

An unclassified field is an error rather than silently becoming part of, or being
excluded from, a scientific fingerprint.  `selectPersistentDocumentFields` removes
transient display fields.  `selectStructuralDocumentFields` and
`structuralDocumentHash` include only structural fields.

The initial `SCENE_DOCUMENT_FIELD_POLICY` classifies geometry, objects, surfaces,
and semantics-bearing extensions as structural.  Scene identity/title/timestamps
are persistent metadata; overlays/cameras/active camera are persistent display.

## Compatibility boundary

`SceneDocument.identity` is optional.  Legacy scene-project files therefore load
and round-trip without acquiring identity metadata.  A valid identity is preserved
only when a caller explicitly supplies and saves it; malformed supplied identity is
rejected.  F02 changes no project format version and performs no load-time rewrite.
