# G2D56 — persistent signed curvature measurement

**Software status — 2026-10-14:** Implemented in the shared Graph document and resolver, desktop Constructions, and mobile Constructions. Physical-device and spoken screen-reader signoff remain under MOB-G13/G2D40.

**Add curvature** on a saved point creates a dependent scalar measurement. The document saves the point reference and the new `graph2d.constructions.curvature.v1` capability; it does not save a curvature value, sampled polyline, or osculating circle. Older readers reject the capability before opening the document. Deletion requires removing the dependent measurement first. Undo, redo, save/reopen, and desktop/mobile handoff preserve the same intent.

The construction resolver reevaluates the point and uses the shared local differential operation for its curve kind. Explicit curvature is signed for increasing `x`; parametric and polar curvature are signed for increasing `t` and `theta`. The result reports its derivative method and has no certified error bound. A cusp, zero-speed parameterization, undefined point, unresolved derivative, or budget limit produces an unavailable measurement with a reason. The existing 12,000-work-unit and 1 MiB construction artifact limits apply; each differential reserves a conservative 256 work units against that budget.

The scalar appears in the Constructions panel. It adds no duplicate point marker to the graph. Acceptance covers all three coordinate conventions, a reflected sign, singular states, source and anchor edits, undo/redo, save/reopen, handoff, and a desktop interaction journey.
