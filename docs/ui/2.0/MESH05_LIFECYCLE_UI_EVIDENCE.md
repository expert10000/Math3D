# MESH-05 Mesh operation lifecycle evidence

Local Windows Electron acceptance on the stacked `codex/m3d20-mesh05-lifecycle` branch uses
`tests/e2e/mesh-operation-lifecycle.spec.ts` with three native journeys. All three pass
with one worker and no retries. `npm run build:core` and `npm run typecheck:noemit` pass.

| Slice | Native evidence |
| --- | --- |
| M5.1 New object | Box Smooth with two iterations preserves the source, creates a distinct Mesh document and resource checksum, shows source provenance in History, and enables read-only quick Compare. The saved Project contains both exact generations and a `derived-from` relation. |
| M5.2 Replace | Box Smooth Replace advances the same document with a new resource checksum. Quick Compare leaves source bytes unchanged; Validate completes. Saved Project replay retains the replace command. Project editor Undo restores original positions, indices, checksum, and selection; Redo restores the result. |
| M5.3 Portability | Download with resources from the New object journey opens in a fresh Electron profile. Both Mesh documents reopen with the original IDs, revisions, structural hashes, and resource checksums. A missing required Mesh sidecar disables Open; altered sidecar bytes are rejected; the intact archive then opens. |
| M5.4 Worker lifecycle | An IPC-simulated VTK failure leaves Box unchanged. A delayed Smooth result is discarded after importing a different Mesh. A subsequent simulated successful response publishes on the current Mesh. |

Production changes: the workspace Mesh card now wires Quick Compare to its topology history preview;
Project capture excludes the active Mesh viewer's temporary `mesh-backed` Surface wrapper, whose
internal `meshId` has no restorable Surface source; and Smooth checks its source generation before
publishing a worker result. Smooth uses the VTK runtime and no longer stops because an unrelated
CGAL health probe is stale.

These checks cover Smooth and the stated Project transfer path. They do not establish that every
Mesh operation has a late-result guard, nor that optional analysis caches transfer with source
resources. The M5.4 failure and recovery response is IPC simulated; M5.1 and M5.2 use native workers.
