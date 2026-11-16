# Math3D 2.0 — Complex Analysis UI and functionality review draft

Date: 2026-11-15. Status: **draft / proposed**. Coordination: [DRAFT_STATE.md](DRAFT_STATE.md).

## Purpose and evidence boundary

Make the existing Complex Analysis workbench easier to understand and operate, preserving its mathematical meaning and shared Project/ScientificSelection/AnalysisResult/SceneResource/Job/runtime-capability owners. This is a review and implementation plan in the style of Geometry draft #61, not an assertion that all proposed improvements or acceptance tests already pass.

Reviewed application source: `2cf4b6a4b096ff08f3e7c8e928c542d25acca065` (current main when review began). Clean production core build, Linux native Electron, isolated disposable review profile, default 1100×750 app window and software GPU. Renderer compilation required an 8 GiB Node heap; this is build-environment evidence, not an app performance fix. No installed Windows or signed-release qualification is claimed. Only the spot checks below were performed through the visible native UI.

## Visible control inventory and responsibilities

| Control group | Responsibility / behavior |
| --- | --- |
| Function Explorer / Möbius Lab / Riemann Sphere / Residue Lab / Branch Lab / Covering Lab / Complex map | Different mathematical views; do not collapse them into one generic mesh tool. |
| Preset / Function / Screenshot / Export / Reset | Explorer-level actions, distinct from global app navigation. |
| Setup / Gallery | Left-panel configuration and examples. |
| Domain / Grid / Path / Sphere / Residue / Covering | View/task selection within Function Explorer. |
| 2-pane / 3-pane / Focus Z | Plot layout controls, separate from global left/right dock controls. |
| Z-plane / W-plane | Domain/image views of the current complex function. |
| Inspector sections and Analyze adaptive continuation | Source/branch inspection and a separate computation action. |
| Analyze / Map path / Integral / Promote | Contextual bottom actions; availability must follow current analytic source. |

Retain established entry points until a replacement is reviewed and tested. Use workbench → task → configuration → explicit action → result/Inspector as the navigation hierarchy. A highlighted tab/step is not proof of execution, and a successful operation is not independent mathematical certification.

## Directly observed functionality

1. Opening Complex Analysis initially showed Complex map with a baked 3D sweep, mesh state diagnostics and the inherited Surfaces / Complex breadcrumb.
2. Switched to Function Explorer. Its own breadcrumb and 2D Z/W plots became visible; f(z)=z was displayed.
3. Selected the visible 1/z preset. The expression and plotted domain/image changed to 1/z. No contour-integral, continuation or residue correctness claim is made by this observation.

These are bounded manual UI observations. Save/cold-reopen, exact identity/hash preservation, unavailable-resource recovery, late-output rejection and every numerical backend remain separate acceptance checks; screenshots do not silently certify them.

## Findings and proposed corrections

1. At 1100×750 the preset column is narrow enough to clip longer formula labels, while the Inspector overlays substantial W-plane plot space.
2. Function Explorer initially displays f(z)=z while one branch detail says function: none. Distinguish identity-function default, absent specialized branch profile and invalid expression.
3. The shared footer continued to show the prior Complex Map Sweep mesh and type mesh while using the analytic Function Explorer; this is confirmed shared footer leakage (SHARED-01).
4. The 3D Complex map showed Invalid with boundary-edge counts. An open sampled sheet is not by itself a mathematically invalid complex function; distinguish mesh health from analytic-domain validity.
5. Use one visible current-source/function heading shared by plots, Inspector, actions and export; source identity remains in the existing Complex document.

## Implementation backlog

| ID | State | Bounded implementation |
| --- | --- | --- |
| CA-01 | proposed | Allocate plot/Inspector space explicitly; make 2-pane/3-pane/Focus Z visibly reflect actual usable plot area. |
| CA-02 | proposed | Unify default function, expression validity and branch-profile messages without changing analytic results. |
| CA-03 | proposed | Differentiate Mesh diagnostics for baked maps from analytic function/domain/branch diagnostics. |
| CA-04 | proposed | Expose contour orientation, branch/cut policy, numerical versus exact method, backend and error estimate before execution/publication. |
| CA-05 | proposed | Qualify preset → domain/image → path/residue/continuation → saved result → source edit/stale result → Project save/reopen. |

SHARED-01 is reserved by the current cleanup thread: remove unrelated retained mesh/analysis labels from Graphs, Topology and analytic Complex footer contexts, without clearing scene state. Module-specific layout changes are not included in that first slice.

## Important complete acceptance journey

The preset, analytic-result, stale-history and reopen gates for CA-05 are in [Workbench acceptance criteria](WORKBENCH_ACCEPTANCE_CRITERIA.md#ca-05--analytic-source-result-and-stale-history). They are design requirements; no execution PASS is implied.

> Choose a function such as 1/z → inspect domain and image → choose the contour and its orientation → explicitly run the appropriate existing analysis → inspect method, source revision, branch policy, assumptions and warnings → save the result → edit the source and observe stale state → restore/cold-reopen without losing identities, paths, historical references or available bytes.

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
- `renderer/src/math/complexCommandAdapter.ts`
- `renderer/src/graph2d/Graph2DComplexLinkPanel.tsx`

## Existing regression starting points

- `tests/e2e/complex-exact-mvp.spec.ts`
- `tests/e2e/complex-continuation.spec.ts`
- `tests/e2e/complex-analysis-corpus.spec.ts`
- `tests/e2e/complex-riemann-lineage.spec.ts`

These are starting points, **not a record that they were rerun for this draft**. Confirm current paths and select the smallest relevant owner/component suite plus native journey for each change; record exact source/harness commits, command, counts, exclusions and failures in DRAFT_STATE and the existing Integration Lab. Expand to broad acceptance only after focused changes pass.

## Review evidence

- [complex-map](evidence/complex-map.png)
- [complex-explorer](evidence/complex-explorer.png)
- [complex-one-over-z](evidence/complex-one-over-z.png)

Screenshots are native source-app review captures at the reviewed commit. They document visible state and layout, not a separate acceptance baseline.

## Handoff to another thread

Read DRAFT_STATE first. Claim one task with owner/branch/base SHA, exact owned files/regions, start time and next check before editing. Treat `renderer/src/App.tsx` as a shared serial-edit resource; coordinate a minimal patch rather than concurrent broad rewrites. Keep Geometry work owned by #61 separate. When handing off, record implemented commit, tests actually run, evidence and remaining checks; never mark verified from an unexecuted plan.
