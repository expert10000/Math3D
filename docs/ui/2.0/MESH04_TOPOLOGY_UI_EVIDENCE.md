# MESH-04 topology interpretation UI evidence

This slice adds an explicit `Compare interpretations` action in Mesh Inspector Diagnostics. `Indexed source` is shown first. The spatial-weld result states its method, tolerance, counts, and source document/resource identity. It remains marked historical when the mesh or tolerance changes. The comparison does not commit a Mesh command or mutate the input buffers.

The focused native journey `tests/e2e/mesh-topology-interpretation.spec.ts` imports the split-vertex ASCII STL cube, confirms 36 indexed vertices and 36 boundary edges versus 8 position-only interpreted vertices and zero interpreted boundary edges, and compares document ID, revision, structural hash, resource checksum, selection, positions, and indices before and after the request. It then runs explicit Weld on the active Mesh document and Undo, checking the revisioned result and restored original resource checksum, selection, positions, and indices. Undo advances the document revision. The actual Weld preserves normal/UV seams and produces 24 vertices with 24 boundary edges for this cube; the UI states why it differs from the position-only interpretation. This is bounded evidence for M4.1 and part of M4.3; it does not establish full MESH-04 or MESH-05 acceptance.

The M4.2 follow-up journey `tests/e2e/mesh-topology-open-sheet.spec.ts` opens the `15_open_boundary.obj` and `16_non_manifold_edge.obj` fixtures in native Mesh Inspector. It checks indexed boundary edges and loops, manifold/closed/watertight status, closed-solid suitability, triangle validity, and the separate sampled self-intersection status. The open sheet is presented as an open surface unsuitable for a closed solid, without calling its mathematics universally invalid. The non-manifold fixture is identified by its edge incidence while its triangles remain valid. The internal health state continues to express closed-solid validation; the Inspector and Mesh Analyze labels make that scope explicit. Exact-head Windows evidence is recorded on the follow-up PR.

The M4.3 follow-up records Weld's `Replace` destination, tolerance, seam-preserving method, and exact source/result document generations and resource checksums in the Mesh replay command. The Project Mesh editor presents that lineage and marks an undone or superseded result historical. The focused native journey verifies the Project's saved replay before and after Undo; the adapter unit test verifies replay restoration and historical status. This does not qualify cold Project transfer.

## Remaining acceptance gates

- **M4.3 remaining:** Run the Project Mesh editor lineage view natively after opening a saved Project with complete sidecars. The persisted replay and active Mesh Undo path are covered above.
- **M5.1:** From built-in Box, run ready-worker Smooth or Clean with `New object`; check parameters/source/output next to Run, distinct result ID, fixed source hash, result history, and Compare identities.
- **M5.2:** Repeat with `Replace`; Validate/Compare, Undo/Redo, exact resource hashes, committed selection, destination identity/revisions, and last-operation feedback must agree.
- **M5.3:** Save Project, close the Electron process, cold reopen, and verify source/result IDs, selection, operation history, backend/method, warnings, and all sidecar hashes. In a disposable copy, remove one copied sidecar and reopen: metadata remains inspectable, output stays withheld, and relink is explicit.
- **M5.4:** Deliver a result late after its source is edited or replaced and verify it cannot publish as current. Exercise worker unavailable/recovery: the prior result stays inspectable, and Run is disabled with a stated reason until recovery.

No calculation-only or same-process test closes the cold-reopen and sidecar gates.

The M4.3 development journey exposed an M5.3 blocker: a saved Project with automatic Mesh analysis results lists 14 analysis artifacts, but `Download with resources` packed only the Mesh and Volume source resources. A fresh profile correctly withheld opening because those analysis sidecars were missing. Repair the transfer path before claiming cold-reopen acceptance.
