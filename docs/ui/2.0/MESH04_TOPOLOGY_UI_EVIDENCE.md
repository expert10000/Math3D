# MESH-04 topology interpretation UI evidence

This slice adds an explicit `Compare interpretations` action in Mesh Inspector Diagnostics. `Indexed source` is shown first. The spatial-weld result states its method, tolerance, counts, and source document/resource identity. It remains marked historical when the mesh or tolerance changes. The comparison does not commit a Mesh command or mutate the input buffers.

The focused native journey `tests/e2e/mesh-topology-interpretation.spec.ts` imports the split-vertex ASCII STL cube, confirms 36 indexed vertices and 36 boundary edges versus 8 position-only interpreted vertices and zero interpreted boundary edges, and compares document ID, revision, structural hash, resource checksum, selection, positions, and indices before and after the request. It then runs explicit Weld on the active Mesh document and Undo, checking the revisioned result and restored original resource checksum, selection, positions, and indices. Undo advances the document revision. The actual Weld preserves normal/UV seams and produces 24 vertices with 24 boundary edges for this cube; the UI states why it differs from the position-only interpretation. This is bounded evidence for M4.1 and part of M4.3; it does not establish full MESH-04 or MESH-05 acceptance.

## Remaining acceptance gates

- **M4.2:** Native open-boundary sheet and non-manifold edge journeys must verify boundary edges/loops, manifold and closed-solid suitability independently of triangle validity and sampled self-intersection status. An open sheet must not be labeled universally invalid.
- **M4.3:** Verify the Weld result's destination and lineage in Project and any cross-workspace history, beyond the active document revision and buffer restoration in this slice.
- **M5.1:** From built-in Box, run ready-worker Smooth or Clean with `New object`; check parameters/source/output next to Run, distinct result ID, fixed source hash, result history, and Compare identities.
- **M5.2:** Repeat with `Replace`; Validate/Compare, Undo/Redo, exact resource hashes, committed selection, destination identity/revisions, and last-operation feedback must agree.
- **M5.3:** Save Project, close the Electron process, cold reopen, and verify source/result IDs, selection, operation history, backend/method, warnings, and all sidecar hashes. In a disposable copy, remove one copied sidecar and reopen: metadata remains inspectable, output stays withheld, and relink is explicit.
- **M5.4:** Deliver a result late after its source is edited or replaced and verify it cannot publish as current. Exercise worker unavailable/recovery: the prior result stays inspectable, and Run is disabled with a stated reason until recovery.

No calculation-only or same-process test closes the cold-reopen and sidecar gates.
