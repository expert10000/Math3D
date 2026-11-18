# Math3D 2.0 — Surfaces UI and functionality review draft

Date: 2026-11-15. Status: **draft / proposed**. Coordination: [DRAFT_STATE.md](DRAFT_STATE.md).

## Purpose and evidence boundary

Make the existing Surfaces workbench easier to understand and operate, preserving its mathematical meaning and shared Project/ScientificSelection/AnalysisResult/SceneResource/Job/runtime-capability owners. This is a review and implementation plan in the style of Geometry draft #61, not an assertion that all proposed improvements or acceptance tests already pass.

Reviewed application source: `2cf4b6a4b096ff08f3e7c8e928c542d25acca065` (current main when review began). Clean production core build, Linux native Electron, isolated disposable review profile, default 1100×750 app window and software GPU. Renderer compilation required an 8 GiB Node heap; this is build-environment evidence, not an app performance fix. No installed Windows or signed-release qualification is claimed. Only the spot checks below were performed through the visible native UI.

## Visible control inventory and responsibilities

| Control group | Responsibility / behavior |
| --- | --- |
| Explicit / Implicit / Parametric / Spline / Constructed / More | Surface representation families. |
| Scene / Object / View / Analysis / Services / Theory | Panel navigation; Analysis exposes the canonical Surface workflow. |
| Gallery / New / Demo / Edit custom / Compare / More | Source creation/edit and comparison entry points. |
| Preset gallery and subtype choices | Recipe selection; formulas and source identity must remain visible. |
| Mesh / Surface editor / Bake to Mesh / Promote to SurfaceMesh | Analytic source versus sampled/derived representation handoff. |
| Equation / Parse / Domain / Preview / Analyze / Mesh / Promote / Save | Analysis workflow stages; keep the distinction between navigation and actual computation. |
| Curvature atlas / Local frame / Principal flow / Feature map / Chart + seams | Analysis stack presets using existing layer/result owners. |
| Display and viewport quality controls | Wireframe, bounds, gizmo, grid, chart, face picking, overlays and camera options; not scientific method selection. |

Retain established entry points until a replacement is reviewed and tested. Use workbench → task → configuration → explicit action → result/Inspector as the navigation hierarchy. A highlighted tab/step is not proof of execution, and a successful operation is not independent mathematical certification.

## Directly observed functionality

1. Opened the default Implicit Surface preset gallery and inspected the sphere view.
2. Selected Two-sheet hyperboloid; after the UI transition the preset heading and displayed surface changed accordingly.
3. Opened the Analysis panel and observed the Equation→Save workflow, layer presets, Canonical Surface card and current dependency/provenance explanation.
4. The canonical Surface card explicitly limits its claim: dependency freshness is recorded, not independent mathematical certification. Preserve that distinction.

These are bounded manual UI observations. Save/cold-reopen, exact identity/hash preservation, unavailable-resource recovery, late-output rejection and every numerical backend remain separate acceptance checks; screenshots do not silently certify them.

## Findings and proposed corrections

1. The header/panel/action strips plus analysis stepper consume a large fraction of the default window before the source form or viewer.
2. Analytic recipe, implicit shader/preview, baked mesh and promoted SurfaceMesh can be visible in one workflow. The general Mesh Details card can look like it describes the currently displayed analytic recipe; make ownership and source revision explicit. After Complex→Surfaces navigation, the footer also retained Complex Map Sweep while the visible recipe was a Plane or Two-sheet hyperboloid. This representation-level Surface status issue remains SURF-01; the first SHARED-01 patch deliberately changes only independent workbench footers.
3. The view contains multiple camera/display/quality controls. Sampling quality and rendering quality must not be conflated.
4. Source editing and Bake/Promote destination choices should be visible before destructive or derived updates; no silent replacement of a source document.
5. The canonical-source/result lifecycle explanations are useful but verbose for default view. Use concise summary plus accessible detail, retaining assumptions and backend/method limitations.

## Implementation backlog

| ID | State | Bounded implementation |
| --- | --- | --- |
| SURF-01 | proposed | Present source representation, current derived representation and their revisions in one compact source/representation header. |
| SURF-02 | proposed | Consolidate repeated panel/display navigation progressively, retaining all existing entry points as aliases until verified replacement. |
| SURF-03 | proposed | Make sampling/domain/precision and rendering controls distinguishable, with units/frame and backend readiness near Run. |
| SURF-04 | proposed | Explain Bake and Promote consequences, target identity/lineage and unavailable bytes before committing a handoff. |
| SURF-05 | proposed | Qualify implicit/parametric/Weierstrass/spline recipes, stale analysis, bake/promote, mapped return and save/reopen with resources. |

SHARED-01 is reserved by the current cleanup thread: remove unrelated retained mesh/analysis labels from Graphs, Topology and analytic Complex footer contexts, without clearing scene state. Module-specific layout changes are not included in that first slice.

## Important complete acceptance journey

The four-family recipe, analysis, derived-representation and reopen gates for SURF-05 are in [Workbench acceptance criteria](WORKBENCH_ACCEPTANCE_CRITERIA.md#surf-05--recipe-analysis-and-derived-representation). They are design requirements; no execution PASS is implied.

> Choose a surface recipe → inspect/edit its parameters and domain → preview → run an existing analysis with explicit method and precision → inspect saved result/provenance → Bake or Promote to a derived Mesh with explicit destination → edit the source and observe staleness → save/cold-reopen with recipe, selections, source/derived identities and resource references intact.

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

- `renderer/src/App.tsx`
- `renderer/src/screens/SurfacePanel.tsx`
- `renderer/src/components/SurfaceAnalysisWorkspacePanels.tsx`
- `renderer/src/components/SurfaceAnalysisInspectorPanel.test.tsx`

## Existing regression starting points

- `tests/e2e/project-surface-module.spec.ts`
- `tests/e2e/project-surface-custom.spec.ts`
- `tests/e2e/project-surface-module-navigation.spec.ts`
- `tests/e2e/project-surface-exploration.spec.ts`
- `renderer/src/components/SurfaceAnalysisInspectorPanel.test.tsx`

These are starting points, **not a record that they were rerun for this draft**. Confirm current paths and select the smallest relevant owner/component suite plus native journey for each change; record exact source/harness commits, command, counts, exclusions and failures in DRAFT_STATE and the existing Integration Lab. Expand to broad acceptance only after focused changes pass.

## Review evidence

- [surfaces-before](evidence/surfaces-before.png)
- [surfaces-analysis](evidence/surfaces-analysis.png)

Screenshots are native source-app review captures at the reviewed commit. They document visible state and layout, not a separate acceptance baseline.

## Handoff to another thread

Read DRAFT_STATE first. Claim one task with owner/branch/base SHA, exact owned files/regions, start time and next check before editing. Treat `renderer/src/App.tsx` as a shared serial-edit resource; coordinate a minimal patch rather than concurrent broad rewrites. Keep Geometry work owned by #61 separate. When handing off, record implemented commit, tests actually run, evidence and remaining checks; never mark verified from an unexecuted plan.
