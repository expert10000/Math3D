# Math3D 2.0 — Mesh UI and functionality review draft

Date: 2026-11-15. Status: **draft / proposed**. Coordination: [DRAFT_STATE.md](DRAFT_STATE.md).

## Purpose and evidence boundary

Make the existing Mesh workbench easier to understand and operate, preserving its mathematical meaning and shared Project/ScientificSelection/AnalysisResult/SceneResource/Job/runtime-capability owners. This is a review and implementation plan in the style of Geometry draft #61, not an assertion that all proposed improvements or acceptance tests already pass.

Reviewed application source: `2cf4b6a4b096ff08f3e7c8e928c542d25acca065` (current main when review began). Clean production core build, Linux native Electron, isolated disposable review profile, default 1100×750 app window and software GPU. Renderer compilation required an 8 GiB Node heap; this is build-environment evidence, not an app performance fix. No installed Windows or signed-release qualification is claimed. Only the spot checks below were performed through the visible native UI.

## Visible control inventory and responsibilities

| Control group | Responsibility / behavior |
| --- | --- |
| Outliner / Mesh tools / Object / View / Analysis / Services / Theory | Task/panel navigation; Mesh tools exposes Operations, Analyze, Topology Edit, Outliner and Snapshots. |
| Mesh presets / New / Demo / Compare / More | Source choices and demonstration entry points; Compare availability changes after an operation. |
| Source → Configure → Preview → Execute → Validate → Compare | Navigation through operation stages; a step is not proof that a job completed. |
| Operation groups and expandable rows | Clean/decimate/smooth, boolean and implicit tasks; configuration and Run are hidden until a row expands. |
| New object / Replace | Explicit output destination; preserve this choice before execution. |
| Mesh Object / Face / Edge / Vertex | Selection scope for discrete operations and mappings. |
| Apply preview / Open in Geometry / Save edited | Geometry handoff and derived-mesh controls with applicability conditions. |
| Inspector / Workbook and seven Inspector sections | Selection, geometry, analysis, diagnostics, provenance and history remain accessible. |

Retain established entry points until a replacement is reviewed and tested. Use workbench → task → configuration → explicit action → result/Inspector as the navigation hierarchy. A highlighted tab/step is not proof of execution, and a successful operation is not independent mathematical certification.

## Directly observed functionality

1. Opened Mesh tools, expanded Smooth and observed iterations/passband and New object/Replace controls.
2. Ran Smooth on the built-in Box with default values. The UI reported Done: whole mesh and selected Box (Smooth); Compare became available.
3. Clicked the visible Undo action. Selection returned to Box and Compare was disabled again. This is UI observation, not an identity/hash or numerical-quality acceptance certificate.

These are bounded manual UI observations. Save/cold-reopen, exact identity/hash preservation, unavailable-resource recovery, late-output rejection and every numerical backend remain separate acceptance checks; screenshots do not silently certify them.

## Findings and proposed corrections

1. The default 1100×750 window has a narrow operation column with two nested levels of task tabs, source cards, presets and long operation lists. Running a simple operation requires substantial scrolling.
2. Source Box and destination selection appear away from the expanded operation. Keep both beside the Run action so Replace cannot be mistaken for New object.
3. The existing last-operation/Undo feedback is useful and must survive any layout change. Do not replace it with a transient toast alone.
4. Worker-ready UI and STANDARD/FAST/ROBUST badges describe different things. A capability label must not imply that an operation or scientific validation has passed.
5. Mesh state warnings need explicit scope: triangle quality, open boundaries and closed-solid suitability are different claims.

## Implementation backlog

| ID | State | Bounded implementation |
| --- | --- | --- |
| MESH-01 | basic-operation slice implemented; local native pass; CI pending | Group the operation form into Source, Parameters, Output and Run; retain all existing operation IDs and handlers. |
| MESH-02 | proposed | Show engine/capability reason adjacent to disabled Run, with a link to existing Compute Center; keep offline results inspectable. |
| MESH-03 | proposed | Make Last operation, Undo, Validate and Compare reachable without scrolling the full registry. |
| MESH-04 | proposed | Clarify raw indexed topology versus connected interpretation; coordinate with Geometry #61 and do not silently weld. |
| MESH-05 | proposed | Qualify source → operation → validate → compare → undo → save/cold reopen, including missing sidecar and stale-result behavior. |

SHARED-01 is reserved by the current cleanup thread: remove unrelated retained mesh/analysis labels from Graphs, Topology and analytic Complex footer contexts, without clearing scene state. Module-specific layout changes are not included in that first slice.

## Important complete acceptance journey

> Open the Box source → select an operation → inspect source identity/revision and explicit New object/Replace choice → run through the existing Job/runtime owner → inspect warnings and real output → validate or compare with the source → undo → save and cold-reopen with document identities, committed selection, result history and exact resource hashes intact.

Qualify the complete journey; passing isolated toolbar clicks is insufficient. Preserve the distinction between exact mathematics, sampled approximation, display geometry and cached/historical output. Report unsupported operations explicitly rather than changing the scientific claim to fit a badge.

## Required regression boundaries

- Preserve Project/document IDs, revisions, generations and hashes; UI navigation must not mutate document owners or resource stores.
- Nullable legacy source information and legacy selections remain supported at the documented boundary. Unknown provenance is not invented.
- Historical artifact references may remain valid metadata even when bytes are missing. Missing bytes require safe withholding/relink behavior, not fabricated output.
- Source edits make old results stale. Stale payload cannot republish into the viewport; late Job output from an earlier generation must be rejected.
- Frames/units and partial/unavailable cross-module mappings remain explicit. Never silently reinterpret coordinates or weld geometry.
- Offline scientific runtimes retain inspectable results; refresh/reconnect/retry uses the existing capability and Job paths, respecting restart backoff.
- Keep Workbook/Notes, resource pinning, undo/redo and shared Project save/export/import behavior. No duplicate scientific state or parallel history system.
- Keep visible button names, keyboard/focus recovery, disabled reasons and 1100×750/narrow-layout usability. Avoid changing stable test IDs merely for styling.

## Source owners to inspect before editing

- `renderer/src/components/MeshOperationsPanel.tsx`
- `renderer/src/App.tsx`
- `renderer/src/services/meshOperations.ts`
- `renderer/src/projects/SavedMeshAnalysisPanel.tsx`

## Existing regression starting points

- `tests/e2e/mesh-topology-persistence.spec.ts`
- `tests/e2e/project-mesh-generation.spec.ts`
- `tests/e2e/project-mesh-result-comparison.spec.ts`
- `renderer/src/mesh/meshDocumentAdapter.test.ts`

These are starting points, **not a record that they were rerun for this draft**. Confirm current paths and select the smallest relevant owner/component suite plus native journey for each change; record exact source/harness commits, command, counts, exclusions and failures in DRAFT_STATE and the existing Integration Lab. Expand to broad acceptance only after focused changes pass.

## Review evidence

- [mesh-overview](evidence/mesh-overview.png)
- [mesh-smooth-configure](evidence/mesh-smooth-configure.png)
- [mesh-smooth-result](evidence/mesh-smooth-result.png)
- [mesh-undo](evidence/mesh-undo.png)

Screenshots are native source-app review captures at the reviewed commit. They document visible state and layout, not a separate acceptance baseline.

## Handoff to another thread

Read DRAFT_STATE first. Claim one task with owner/branch/base SHA, exact owned files/regions, start time and next check before editing. Treat `renderer/src/App.tsx` as a shared serial-edit resource; coordinate a minimal patch rather than concurrent broad rewrites. Keep Geometry work owned by #61 separate. When handing off, record implemented commit, tests actually run, evidence and remaining checks; never mark verified from an unexecuted plan.

## Implementation update — 2026-11-15

The first MESH-01 slice groups Clean normals, Decimate and Smooth into Source, Parameters, Output and Run fieldsets. Source and the New object/Replace choice are repeated together beside the existing Run action. Existing operation IDs, handlers, runtime gates, history and undo are preserved. Boolean/CGAL/implicit form restructuring remains outside this slice.

Local source-app core build passed (renderer39.42s). Native Linux regression passed1test in6.847s (suite8.349s),0skips/0retries: all three forms expose the groups and update the Run summary; Smooth creates a new result and Undo returns to Box. This is a working-tree build based ond7010fc3, not clean exact-commit CI or full identity/hash/save-reopen acceptance. Windows CI and typecheck results remain pending until recorded in DRAFT_STATE.
