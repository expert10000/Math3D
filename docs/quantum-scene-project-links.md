# Quantum scenes in saved Math3D Projects

Math3D Projects can retain a `quantum-scene/v1` source as a sealed, external, read-only link. The Project envelope stores a title, bundle directory and 64-character scene fingerprint under `quantumScenes`. Its structural hash covers these references. Existing Project revisions without this optional field remain valid.

The Project contents panel offers **Attach open verified scene** after a desktop scene has been opened. Attachment re-verifies the source and remains staged until **Save project**. **Verify and view scene** reopens through the existing Electron quantum-scene importer, which checks the bundle manifest and datasets before showing the existing geometry, field-slice or density-surface preview. If the directory is absent or bytes have changed, the Project stays intact and the scene is unavailable; no unverified visualization is shown.

The link is not a Geometry, Mesh or Volume document and cannot enter their source editors, analysis commands or kernel worker. Project JSON does not embed scene arrays. A portable Project can therefore retain the reference on another machine, but its source must be present and verify at that directory before it can be viewed. The normal Theory Lab → `quantum-scene/v1` → Math3D boundary remains unchanged; Math3D does not call the Theory Lab worker.

If the bundle moves, the Project may update only the directory of an existing scene fingerprint. The core replacement operation leaves the linked title, format, fingerprint, and scientific workspace unchanged. The desktop picker must independently verify the replacement bundle and require the exact same fingerprint before the new location is staged for a Project save. A canceled or rejected pick cannot update Project bytes.
