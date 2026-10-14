# G2D55 — save a tangent from a local differential result

**Software status — 2026-10-14:** Implemented in shared Graph construction commands, desktop Inspector, and mobile Analyze. Physical-device and spoken screen-reader signoff remain under MOB-G13/G2D40.

For a current explicit, polar, or parametric tangent result, **Save tangent as construction** creates a point-on-curve and a tangent depending on that point. The point stores the source ID and its `x`, `theta`, or `t` anchor; the line stores only the point dependency. Both are validated before one reversible kernel transaction, so one Undo removes the pair. Save/reopen and handoff preserve the same intent, and edits recompute the line through the existing construction resolver.

The saved line direction is an approximate bounded derivative of the source. The transient local differential may use symbolic rules, so its displayed equation and the saved line can differ slightly. A singular or unavailable tangent cannot be saved. No curvature value or sampled polyline is persisted.
