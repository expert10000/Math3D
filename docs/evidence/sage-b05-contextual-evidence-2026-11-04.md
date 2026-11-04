# SAGE-B05 contextual operations and Project evidence — 2026-11-04

## Delivered

CAS → Algebra → Operations now offers inputs and run controls for the selected saved object. The B01 registry checks object kind, parent domain and freshness, then probes advertised Docker or private capabilities. Every operation remains visible, with incompatible or unavailable actions disabled and their reason stated. A completed calculation runs through the shared Sage broker. Cancel stops the pending job.

Successful results are parsed against the operation's exact output schema and stored in the `.math3d` Project as immutable algebra evidence. Each record pins the Project ID, object ID and revision, definition hash, operation request, validated result and result hash, Sage engine version, backend, job ID, elapsed time and warnings. The Project parser checks these links on import, rejects duplicate IDs or altered evidence, and keeps historical evidence when the object advances. A concurrent Project change prevents a pending result from overwriting newer saved data. The Operations view can reopen the saved result.

## Acceptance

- Unit acceptance creates `ZZ`, runs the typed `gcd(84,30)` request, stores exact result `6`, serializes and independently parses the Project, then checks pinned revision and Sage 9.5 provenance. It rejects duplicate evidence, missing targets, changed result bytes and mismatched backend provenance. A new object revision retains prior evidence.
- Desktop acceptance uses a controlled Sage HTTP worker to run exact reconstruction from the selected `Q` structure, saves it through the CAS UI, exports the Project bytes and independently parses the result and Sage 10.10 provenance. Incompatible actions are disabled with an explicit reason.
- `npm run typecheck:noemit`, `npm run build:core`, `npm run check:kernel:boundaries`, focused Vitest and desktop Playwright gates are recorded in the implementation run. Live Docker Sage is unavailable on this PC; the desktop test exercises the same broker and HTTP contract with a controlled worker.

## Next

**SAGE-B06** adds structured Results, Structure, Verification and Execution panels in the Inspector for saved object-linked evidence.
