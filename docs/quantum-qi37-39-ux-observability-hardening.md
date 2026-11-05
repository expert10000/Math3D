# QI-37–39 evidence · 2026-11-05

## QI-37 · Inspector and keyboard UX

The verified quantum viewer now has View, Data, Science and Provenance tabs. Arrow keys wrap between tabs; Home and End select the first and last. Opening focuses Close, Escape closes the dialog, Tab stays inside it, and focus returns to the prior control. The layout stacks the viewer and inspector below 760 px. Dataset summaries page in groups of 16; the existing detailed source inspection remains below the summary. Stream, selection and source verification errors continue to use status and alert regions. Rendering remains bounded by the scene importer's existing primitive, vector and stream-level limits.

## QI-38 · Cross-app trace correlation

Theory Lab's saved-run Support JSON exports verified job ID, run ID, job/result/artifact hashes, engine and worker versions, and measured duration. Math3D's viewer Support JSON exports run ID, result hash and exact scene fingerprint, import time, dataset bytes, mapped primitives, first browser-frame delay after mount, and at most 64 relative viewer events. The common run ID and result SHA-256 join the two reports. The viewer has no job ID in the frozen scene contract and reports it as `null`; the Lab report supplies it. Neither report includes paths, parameters, scientific arrays or selected sample values. Metrics are observations, with no invented release threshold.

## QI-39 · Import and broker threat review

| Threat | Boundary and check | Evidence |
| --- | --- | --- |
| Path traversal or linked files | `.qpack` accepts fixed top-level names, constrained dataset names and exact scene references; its cache root must be a real directory. `.qscene` rejects linked roots and files. | Traversal descriptor and linked-cache rejection tests; existing scene-bundle checks. |
| Oversized or changed data | Manifest, blobs, total pack and scene datasets have byte caps and SHA-256 checks. Portable file reads now verify file identity between metadata and open, and reject size changes during read. | Oversized descriptor and blob tamper tests. |
| Schema confusion or decompression | Pack, scene and stream schema versions are explicit; `.qpack` is an uncompressed directory and does not run an archive extractor. | Unknown `zip-bundle/v1` manifest rejection test. |
| Code execution | Scene contracts accept data and bounded numeric arrays, without evaluating expressions or scripts. Renderer uses sandboxed IPC verification for external scenes. | Existing importer schema and IPC tests; no executable payload path in `.qpack`. |
| Broker transport trust | Theory Lab's SSH adapter requires strict host key checking, bounded POSIX paths and a fixed artifact name; WSL/Docker targets and artifact hashes are validated. | Theory Lab remote and transport-adapter tests, including injected Python and artifact paths. |

Residual release work: live adversarial race testing, full large-data keyboard review, and end-to-end support bundle collection through the installed apps belong to QI-40 certification.
