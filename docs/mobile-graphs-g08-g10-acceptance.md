# Mobile Graphs G08–G10

## MOB-G08 — display and bounded overlays

Display controls and diagnostics are collapsed until requested. Axes/grid/labels and quick/balanced/fine quality use reversible shared scene commands without advancing the mathematical source. Tick labels are independent of grid visibility. Imported sampling intent is preserved; execution caps at 2048 settled / 256 interaction samples, depth 10/6, and at least 1/3 px tolerance. Native lines are capped at 4096.

Tangent, area and feature overlays default off and are session preferences. Only a current matching analysis can render them; hidden-source and stale-result overlays are suppressed. Approximate area uses at most 256 clipped midpoint strips from shared integral fill segments, preserving their gaps. Feature markers are capped at 128. Diagnostics expose convergence, evaluations, sampler reasons and rendering truncation.

Evidence: mobile typecheck and focused display/analysis tests. Device/physical/iOS acceptance is tracked separately; no release claim.
