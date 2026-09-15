# Geometry command migration boundary

GK05 makes `GeometryDocumentAdapter.dispatch` the shared committed-operation boundary
for Geometry GUI gestures, Scene Script, and the supported Scratch interchange.

The command vocabulary covers object add/update/remove/visibility, construction and
relationship add/remove, parameters, topology-edit records, Scratch graph replace,
scene clear, and committed selection. A batch is validated and projected atomically
by the shared kernel; its inverse checkpoint, undo/redo, and compact replay log are
owned by the same history service. Pointer hover, drag samples, temporary picks, and
editor/script previews never dispatch commands.

Scene Script retains its released parser diagnostics, field coercion, clamping, and
snapshot text. Successful detached normalization is lowered to one kernel batch;
failed scripts never reach document authority. Snapshot scripts and versioned
operation logs are separate exports and both replay to canonical Geometry state.

The advertised editable Scratch subset is a published `constructed` object with
`constructionKind=scratch-scene` and a canonical graph payload. Its nodes, checks,
constraints, IDs, dependencies, authoring script, and committed selection survive
Scratch → Scene Script → Scratch. Other Scene Script scenes return structured
`unsupported-scene-script-subset` diagnostics without modifying the document.

## Compatibility path and removal gate

The large existing Geometry React setter surface in `renderer/src/App.tsx`, including
ConstructionLabPanel's local interaction history, remains a compatibility consumer.
It is not claimed as authoritative kernel history. Its removal gate is: migrate each
remaining App mutation site to `dispatchGeometryGuiBatch`, mirror committed state
from `GeometryDocumentAdapter.state()`, and pass the existing professional Geometry
E2E suite plus `test:kernel:gk05`. New committed Geometry work must use the adapter.
