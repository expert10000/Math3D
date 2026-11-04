# QI-07–09: semantic views, QWZ study handoff, and source fork

## QI-07 semantic viewer registry

`renderer/src/components/quantumViewHandlers.tsx` negotiates typed handlers for geometry, supplied bands, lattices, trajectories, field slices, density surfaces, and volumes. Existing GeometryViewer and field components remain the renderers. A handler is mounted behind a keyed error boundary, so changing routes unmounts its resources and a rendering failure is visible in the preview. A new dataset handler is added to the registry without changing the preview's display branch. Exact sample selection remains in the verified reader paths.

## QI-08 two-scene study handoff

For a selected saved QWZ run, Theory Lab writes `quantum-study-handoff/v1`: `study.json` plus separate curvature and bands `.qscene` folders. The manifest fixes the run ID, result SHA-256, declared scene IDs and roles. Math3D's main process independently imports and verifies both folders, checks their shared result identity, role semantics and complete top-level inventory, then returns exact scene fingerprints. The Project panel offers a new Project or the current editable Project; it reverifies both sources before staging either document and links them as same-result views. Save Project retains both documents and source references.

The existing single `.qscene` route remains. The study folder is also a manual fallback through **Open Theory Lab study folder** in the Project panel. Lab supports a built source checkout and discovers or lets the user choose an installed Windows Math3D application. This first study handoff covers the QWZ curvature/bands pair; other Lab study types need their own declared scene sets.

## QI-09 explicit source fork

The existing **Open source run in Theory Lab** route still sends `--quantum-source-run <runId> <resultSha256>`. The separate **Fork as new Theory Lab run** action sends `--quantum-source-fork` after Math3D rehashes the active scene. Lab resolves either request only against a matching verified saved result. A fork request opens the parent for review and requires a second **Fork verified run** click. It rechecks the parent result hash and saved-run preflight before using Lab's existing rerun pipeline. That pipeline creates a new run ID and stores the exact parent job/result hashes as immutable lineage; the parent run and scene are left unchanged. Math3D never invokes Python directly.

## Verification

- Math3D TypeScript and main/renderer builds; semantic handler and Project admission tests; independently verified handoff and tamper tests; desktop study-to-Project save test.
- Theory Lab TypeScript/build; QWZ recipe/handoff and fork launch tests; existing saved-rerun lineage test.
