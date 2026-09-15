# Kernel-owned GeometryDocument adapter

GK04 introduces a strict, versioned `math3d.geometry-document` boundary without
changing the released SceneDocument file format or Geometry construction
algorithms.

## Authority split

- `source` owns mathematical geometry, procedural objects, surfaces, construction
  definitions, relationships, parameters, and JSON-only extensions. It alone drives
  document revision and structural hash.
- `metadata` owns title, timestamps, custom project metadata, and creation-time
  annotations.
- `display` owns object material/visibility/name/group, construction presentation,
  overlays, cameras, and active camera.
- `GeometryTransientViewState` documents hover, drag preview, temporary picks, and
  live camera interaction as viewer-owned state that is never serialized into the
  canonical document.

The canonical validator rejects class instances, typed arrays, circular references,
accessors, non-finite numbers, and other non-JSON runtime state. This prevents React,
Three.js, and large mesh buffers from leaking across the document boundary.

## Legacy compatibility

`geometryDocumentFromSceneDocument` is an explicit read adapter. It clones the
released scene, preserves object/construction identifiers, extracts construction
extensions, and never mutates or rewrites the opened legacy value.
`geometryDocumentToSceneDocument` is the separate user-controlled compatibility
export path.

## Kernel adapter

`GeometryDocumentAdapter` owns canonical state through the shared in-memory command
kernel. Structural source and persistent-display replacements are validated command
transactions with inverse history, undo/redo, replay, and isolated queries. Source
replacement advances identity once; display replacement preserves it. GK05 will
replace these coarse migration commands with the shared fine-grained GUI, Scratch,
and Scene Script command families.

Run `npm run test:kernel:gk04` for the Geometry adapter's GK03 conformance fixture,
authority split, legacy compatibility, canonical round-trip, replay, identity, and
runtime-buffer rejection gates.
