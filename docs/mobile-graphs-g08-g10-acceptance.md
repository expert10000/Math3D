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
