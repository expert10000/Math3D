# Math3D 2.0 — Graphs / Graph2D UI and functionality review draft

Date: 2026-11-15. Status: **draft / proposed**. Coordination: [DRAFT_STATE.md](DRAFT_STATE.md).

## Purpose and evidence boundary

Make the existing Graphs / Graph2D workbench easier to understand and operate, preserving its mathematical meaning and shared Project/ScientificSelection/AnalysisResult/SceneResource/Job/runtime-capability owners. This is a review and implementation plan in the style of Geometry draft #61, not an assertion that all proposed improvements or acceptance tests already pass.

Reviewed application source: `2cf4b6a4b096ff08f3e7c8e928c542d25acca065` (current main when review began). Clean production core build, Linux native Electron, isolated disposable review profile, default 1100×750 app window and software GPU. Renderer compilation required an 8 GiB Node heap; this is build-environment evidence, not an app performance fix. No installed Windows or signed-release qualification is claimed. Only the spot checks below were performed through the visible native UI.

## Visible control inventory and responsibilities

| Control group | Responsibility / behavior |
| --- | --- |
| Objects / Services and Classic / Geometry palette | Left-panel task and presentation choices. |
| Add Graph / Gallery / Explore Graph Gallery | Related but distinct source-authoring and curated-example paths. |
| Fit selection / Fit all / Reset view / zoom | Viewport framing/navigation; do not change authoring source. |
| Gallery / Tools / Inspector / Services / More plus corner Inspector | Workspace commands; Inspector appears in two nearby places. |
| Function / Parametric / Polar / Implicit contour / Slope field / Phase portrait / Time-dependent ODE / Inequality / Piecewise / Data series | Ten authoring types in the initial chooser. |
| Start from preset / name / expression / domain / style / Preview | Authoring configuration with explicit validation/preview before creation. |
| Preview Inspector / Back to editor / Create graph | Sampling/error-estimate/validity feedback and explicit commit action. |
| Move/select / Point/probe / Slider / numerical analysis tools | Tools have visible names and explanatory hints, including unavailable reasons. |

Retain established entry points until a replacement is reviewed and tested. Use workbench → task → configuration → explicit action → result/Inspector as the navigation hierarchy. A highlighted tab/step is not proof of execution, and a successful operation is not independent mathematical certification.

## Directly observed functionality

1. Opened an empty Graphs workspace; the footer incorrectly named the prior Complex Map Sweep and type mesh (SHARED-01).
2. Add Graph → Function opened an explicit editor with preset, expression, domain and style fields.
3. Preview of y=x showed a sampled path, expression validity, sampling count, viewport and an explicitly not-estimated error estimate. Created the graph and observed the line/object card.
4. Hide removed the line and showed Hidden; Show restored it. Opened Tools and observed named controls with useful explanatory hints.
5. Thin coloured horizontal strips remained near the plot bottom while the graph was hidden. Cause is unconfirmed; investigate canvas/overlay clipping separately, without claiming they are a second Graph object.

These are bounded manual UI observations. Save/cold-reopen, exact identity/hash preservation, unavailable-resource recovery, late-output rejection and every numerical backend remain separate acceptance checks; screenshots do not silently certify them.

## Findings and proposed corrections

1. The graph authoring chooser and preview/commit separation already work well; preserve that contract rather than replacing it with immediate side effects.
2. Duplicate Inspector entry points and overlapping local/global toolbars consume space and make command scope less clear.
3. The empty-scene callout dominates the canvas; make the next action concise and allow inspecting the empty coordinate frame.
4. The editor uses a long scrolling modal. Keep the current expression, preview/validation state and primary action visible; restore focus when returning to editor.
5. The shared footer mislabels both empty and authored Graph scenes with another workbench’s mesh state. This is the confirmed first implementation slice.

## Implementation backlog

| ID | State | Bounded implementation |
| --- | --- | --- |
| GR-01 | verified (scoped, via SHARED-01) | Fix shared footer ownership (SHARED-01) and retain the actual Graph scene label and document revision. |
| GR-02 | proposed | Clarify Gallery versus Add Graph and consolidate duplicate Inspector affordances while retaining accessible aliases. |
| GR-03 | proposed | Improve long-form authoring/preview modal focus, sticky actions and field-specific error recovery. |
| GR-04 | proposed | Investigate retained coloured strips/overlay clipping after cross-workbench navigation and hide/show; record reproduction before changing rendering. |
| GR-05 | proposed | Qualify cartesian/polar/parametric/data/scientific bundles, frame/unit/grid incompatibility, probes, Workbook/Notes pinning and portable save/reopen. |

SHARED-01 is reserved by the current cleanup thread: remove unrelated retained mesh/analysis labels from Graphs, Topology and analytic Complex footer contexts, without clearing scene state. Module-specific layout changes are not included in that first slice.

## Important complete acceptance journey

The authored/scientific import, probe, pin and portable reopen gates for GR-05 are in [Workbench acceptance criteria](WORKBENCH_ACCEPTANCE_CRITERIA.md#gr-05--authored-and-scientific-graphs). They are design requirements; no execution PASS is implied.

> Add a graph or import an existing scientific dataset → preview and validate before committing → select/probe and inspect source-linked analysis → change parameters/source and observe stale derived results → publish through existing Workbook/Notes/Project owners → save/export/import/cold-reopen with identities, selections, pinned resources and exact sidecar hashes intact.

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

- `renderer/src/graph2d/GraphsWorkspace.tsx`
- `renderer/src/graph2d/Graph2DAuthoringPanel.tsx`
- `renderer/src/graph2d/Graph2DToolsPanel.tsx`
- `packages/core/src/graph2dTools.ts`

## Existing regression starting points

- `tests/e2e/graph2d-authoring-presets.spec.ts`
- `tests/e2e/graph2d-editing-workflow.spec.ts`
- `tests/e2e/graph2d-professional.spec.ts`
- `tests/e2e/graph2d-scientific-dataset.spec.ts`
- `renderer/src/graph2d/GraphsWorkspace.test.tsx`

These are starting points, **not a record that they were rerun for this draft**. Confirm current paths and select the smallest relevant owner/component suite plus native journey for each change; record exact source/harness commits, command, counts, exclusions and failures in DRAFT_STATE and the existing Integration Lab. Expand to broad acceptance only after focused changes pass.

## Review evidence

- [graphs-empty](evidence/graphs-empty.png)
- [graphs-authoring](evidence/graphs-authoring.png)
- [graphs-created](evidence/graphs-created.png)
- [graphs-hidden](evidence/graphs-hidden.png)
- [graphs-tools](evidence/graphs-tools.png)

Screenshots are native source-app review captures at the reviewed commit. They document visible state and layout, not a separate acceptance baseline.

## Handoff to another thread

Read DRAFT_STATE first. Claim one task with owner/branch/base SHA, exact owned files/regions, start time and next check before editing. Treat `renderer/src/App.tsx` as a shared serial-edit resource; coordinate a minimal patch rather than concurrent broad rewrites. Keep Geometry work owned by #61 separate. When handing off, record implemented commit, tests actually run, evidence and remaining checks; never mark verified from an unexecuted plan.

## Implementation update — 2026-11-15

GR-01 is covered by SHARED-01: the Graphs footer preserves the Graph scene label and current document revision while excluding unrelated retained mesh facts. Production fix merged through PR70. Exact-head Windows scoped regression passed at `fa27817fb69c38dc0b6dae8bc2ec108cab03b13a`, [run43710641247](https://github.com/expert10000/Math3D/actions/runs/43710641247). GR-02…05 remain proposed. This does not qualify full Graph scientific-transfer or persistence acceptance.
