# Mobile Graphs G08–G10

## MOB-G08 — display and bounded overlays

Display controls and diagnostics are collapsed until requested. Axes/grid/labels and quick/balanced/fine quality use reversible shared scene commands without advancing the mathematical source. Tick labels are independent of grid visibility. Imported sampling intent is preserved; execution caps at 2048 settled / 256 interaction samples, depth 10/6, and at least 1/3 px tolerance. Native lines are capped at 4096.

Tangent, area and feature overlays default off and are session preferences. Only a current matching analysis can render them; hidden-source and stale-result overlays are suppressed. Approximate area uses at most 256 clipped midpoint strips from shared integral fill segments, preserving their gaps. Feature markers are capped at 128. Diagnostics expose convergence, evaluations, sampler reasons and rendering truncation.

Evidence: mobile typecheck and focused display/analysis tests. Device/physical/iOS acceptance is tracked separately; no release claim.

## MOB-G09 — kind authoring and data previews

The capability chooser exposes all seven current shared-core kinds. Compact editors retain raw drafts until Apply; parametric/polar formulas, implicit bounds, up to eight AND/OR inequality clauses, up to sixteen piecewise intervals with endpoint inclusion, and CSV/TSV import previews all use ordinary reversible authoring commands. Advanced objects support edit/duplicate/reorder/visibility/delete; no host expression evaluation is introduced. Numerical analysis and saved pins remain explicit-only, as stated in the interface. Unknown future required capabilities are rejected by the shared compatibility validator rather than silently discarded.

Native rendering uses the shared bounded scene sampler for every kind. Regions have at most 256 clipped fill Views; strict boundaries are dashed, inclusive boundaries solid. Point markers are capped at 128 and retain checked row IDs for nearest-row probes. Missing y rows split line segments. Incomplete samples or truncated fills/markers show a persistent approximation warning.

Point imports preview two-column CSV/TSV before Apply, including errors and missing counts. Valid data is stored in checksum-checked, content-addressed local files outside the graph document and history. Reopening on this device resolves the same references. Graph JSON alone does **not** transfer table contents: transfer/reimport the original CSV/TSV separately. Missing sidecars remain diagnosed, never silently synthesized. Native limits may prevent rendering large otherwise-valid imported tables.

Evidence: focused mobile kind tests cover six advanced kinds, edits/undo, portable round trips, invalid draft rejection, strict boundaries, gaps, checksum failures and missing sidecars. Physical-device/iOS and full native file-picker/keyboard QA remain pending.

## MOB-G10 — portable Curve/Surface promotion

The Promote destination exposes explicit/parametric → Curve, Revolve → Surface (axis/orientation/angular interval), and Extrude → Surface (direction/length/cap policy). Shared constructors validate profiles and cap policies; bounded shared geometry evaluation precedes preview and Create. Preview and cancel only change session state. Source/selection/option changes invalidate the old preview. The portable orthographic 3D wireframe shows at most 768 native line Views and supports rotation; it is not a full shaded desktop viewport or a scientific result.

Create requires the actual mobile persistent-storage facility and saves the Graph, ordinary Curve/Surface checkpoint and shared promoted-from relation as one mixed-workspace project through the normal project-storage transaction. No new mobile mathematical source schema is introduced. Local bounded previews do not need a worker, and the mobile adapter does not falsely advertise browser Web Workers/WebGL2. Advanced Curve/Surface worker analyses and target regeneration/fork remain desktop-only and are explained in the panel. MOB-G11/12 concern layout/performance, not delivery of these worker analyses.

Saved targets can be located with their 3D preview; Locate source returns to the shared graph selection. Relations retain captured source generations and report stale after source edits without modifying targets. Existing targets are never implicitly overwritten. Graph save, rename, import, export and reopen preserve all checkpointed companion documents, relations, results and artifact references. Companion replay logs require checkpoint export on desktop. Mixed-workspace duplication/colliding imports with companions are explicitly rejected until a full identity fork is available; raw Graph-only copies retain their existing behavior. Data/artifact sidecar bytes are not embedded by mixed-workspace export.

Evidence: mobile promotion tests cover all three operations, pure preview/history isolation, bounded finite 3D geometry, capability rejection, source staleness, duplicate-target rejection, unrelated companion preservation, invalid profiles/caps and lossless export/reopen. Native table transport tests cover file creation, restart resolution, partial-file checksum rejection, bounded picker text and cancellation. Physical-device/iOS acceptance remains pending.

## Verification — 2026-09-28

- 185 mobile unit tests across 42 files; 97 desktop Graph/kernel-workspace tests across 28 files; mobile and repository TypeScript checks; renderer production build and Android debug build all passed.
- Android emulator API 35: Display grid toggle and Undo; create/apply/render/fit/select a parametric circle with parameter-aware readout; preview/cancel Curve without a saved companion; Create Curve and inspect ordinary mixed-workspace/lineage storage; preview/apply CSV point data with row-aware probe and native sidecar file; save/restart/reopen Graph plus Curve and point table; locate the captured source and observe stale Curve status; preview/Create Extrude Surface, current relation and bounded 3D wireframe. Test project is saved as `Graphs`; existing projects were not cleared. Emulator remains open.
- A visual check caught triangle-stride aliasing of extrusion sides. Native wireframes now use the shared derived parameter grid; a regression test requires visible longitudinal edges. This metadata is derived-only and does not enter document source or identity.
- Full native CSV/TSV picker, free-form keyboard authoring (Android stylus onboarding previously interfered), all-kind device coverage, physical devices and iOS remain pending. No public-release acceptance is asserted.
