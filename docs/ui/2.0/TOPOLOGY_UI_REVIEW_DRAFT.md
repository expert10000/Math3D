# Math3D 2.0 — Topology UI and functionality review draft

Date: 2026-11-15. Status: **draft / proposed**. Coordination: [DRAFT_STATE.md](DRAFT_STATE.md).

## Purpose and evidence boundary

Make the existing Topology workbench easier to understand and operate, preserving its mathematical meaning and shared Project/ScientificSelection/AnalysisResult/SceneResource/Job/runtime-capability owners. This is a review and implementation plan in the style of Geometry draft #61, not an assertion that all proposed improvements or acceptance tests already pass.

Reviewed application source: `2cf4b6a4b096ff08f3e7c8e928c542d25acca065` (current main when review began). Clean production core build, Linux native Electron, isolated disposable review profile, default 1100×750 app window and software GPU. Renderer compilation required an 8 GiB Node heap; this is build-environment evidence, not an app performance fix. No installed Windows or signed-release qualification is claimed. Only the spot checks below were performed through the visible native UI.

## Visible control inventory and responsibilities

| Control group | Responsibility / behavior |
| --- | --- |
| Euler / Constructing polygon / Polyhedra / Klein / Möbius | Topology topics/preset families. |
| Torus / Möbius / Klein / Dunce cap | Concrete diagram choices; preserve the mathematical meaning of each. |
| Analyze current Mesh / Analyze selected Geometry | Explicit revisioned interoperability snapshots, not silent live editing of the originating workbench. |
| Diagram / Mark pairings / Glue / Quotient skeleton / Realisation / Inspect invariants | Construction stages. |
| Diagram / Quotient Structure / Complex / Algebra / Realization / Animation / Compare views | Views of different representations/results, not additional construction steps. |
| Realization selector | Schematic or embedded realization; display triangles are not canonical cell counts. |
| Select/Drag / Add Vertex / Add Edge / Remove Vertex / Remove Edge / Undo / Redo | Diagram editing commands. |
| Structure and exact cellular Algebra cards | Current authoritative source, quotient counts, eligibility, generation and matrix/provenance references. |

Retain established entry points until a replacement is reviewed and tested. Use workbench → task → configuration → explicit action → result/Inspector as the navigation hierarchy. A highlighted tab/step is not proof of execution, and a successful operation is not independent mathematical certification.

## Directly observed functionality

1. Opened Topology and saw a Dunce cap diagram with canonical quotient counts and separately labelled display geometry.
2. Selected Torus. The structure panel showed canonical quotient V=1, E=2, F=1 and χ=0, separately from 15,317 display mesh vertices / 30,720 triangles.
3. Opened Algebra View and observed the exact-cellular-algebra eligibility and source/hash/matrix provenance card. The review did not independently certify homology or fundamental-group results.

These are bounded manual UI observations. Save/cold-reopen, exact identity/hash preservation, unavailable-resource recovery, late-output rejection and every numerical backend remain separate acceptance checks; screenshots do not silently certify them.

## Findings and proposed corrections

1. The six-stage construction workflow and seven representation/view buttons occupy the same small central column and look equally primary.
2. Three independent scroll regions hide editing controls, diagrams and structure/provenance details; a new user cannot easily connect the current step to the result.
3. The existing canonical-versus-display count distinction is valuable and must be kept. Do not simplify it into a single misleading Euler badge.
4. Algebra initially emphasizes long IDs/hashes; show mathematical summary and eligibility first, with full provenance in an accessible disclosure.
5. The footer shows an unrelated Box/type mesh from the previous scene; SHARED-01 must remove that implication without deleting any source data.

## Implementation backlog

| ID | State | Bounded implementation |
| --- | --- | --- |
| TOP-01 | proposed | Separate construction progress from representation/view selection; name the active topic and authoritative source once. |
| TOP-02 | proposed | Make add/remove/undo controls a compact diagram toolbar; retain keyboard and source command semantics. |
| TOP-03 | proposed | Keep canonical cells, build refinement, display geometry and imported Mesh snapshot counts explicitly separated. |
| TOP-04 | proposed | Improve algebra summary and explain ineligibility reasons before raw hashes, while retaining complete inspectable provenance. |
| TOP-05 | proposed | Qualify torus/Möbius/Klein/non-manifold examples, snapshot refresh/staleness, undo and Project cold reopen. |

SHARED-01 is reserved by the current cleanup thread: remove unrelated retained mesh/analysis labels from Graphs, Topology and analytic Complex footer contexts, without clearing scene state. Module-specific layout changes are not included in that first slice.

## Important complete acceptance journey

> Choose a fundamental diagram → edit and undo pairings through the existing command adapter → build the quotient → inspect canonical counts separately from display realization → inspect algebra eligibility and a result → compare or import a revisioned Mesh/Geometry snapshot → save/reopen with source, generation, selections and result provenance intact.

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
- `renderer/src/topology/documentFormat.ts`
- `renderer/src/topology/topologyCommandAdapter.ts`

## Existing regression starting points

- `tests/e2e/kernel-workspace.spec.ts`
- `renderer/src/topology/topologyPersistence.test.ts`
- `renderer/src/kernel/domainAdapterConformance.test.ts`

These are starting points, **not a record that they were rerun for this draft**. Confirm current paths and select the smallest relevant owner/component suite plus native journey for each change; record exact source/harness commits, command, counts, exclusions and failures in DRAFT_STATE and the existing Integration Lab. Expand to broad acceptance only after focused changes pass.

## Review evidence

- [topology-overview](evidence/topology-overview.png)
- [topology-torus](evidence/topology-torus.png)
- [topology-algebra](evidence/topology-algebra.png)

Screenshots are native source-app review captures at the reviewed commit. They document visible state and layout, not a separate acceptance baseline.

## Handoff to another thread

Read DRAFT_STATE first. Claim one task with owner/branch/base SHA, exact owned files/regions, start time and next check before editing. Treat `renderer/src/App.tsx` as a shared serial-edit resource; coordinate a minimal patch rather than concurrent broad rewrites. Keep Geometry work owned by #61 separate. When handing off, record implemented commit, tests actually run, evidence and remaining checks; never mark verified from an unexecuted plan.
