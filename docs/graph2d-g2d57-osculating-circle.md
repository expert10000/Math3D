# G2D57 — saved osculating circle

**Software status — 2026-10-14:** Implemented in the shared Graph document and resolver, desktop Constructions, and mobile Constructions. Physical-device and spoken screen-reader signoff remain under MOB-G13/G2D40.

**Add osculating circle** on a saved point creates dependent geometry with the capability `graph2d.constructions.osculating-circle.v1`. The document stores only its point reference and style. It does not store a sampled circle, center, radius, or curvature value. Older readers reject the capability before opening the document; desktop and mobile handoff preserve the same intent. Undo, redo, source edits, anchor moves, and deletion use the existing construction commands and dependency rules.

The resolver reevaluates the source point, tangent, and signed curvature. For a unit tangent **T** in the increasing `x`, `t`, or `theta` direction and its left normal **N**, the center is **P + N/κ** and the geometric radius is **1/|κ|**. Reversing the orientation changes both **N** and **κ**, preserving the circle. Undefined or zero speed, unresolved curvature, zero or nearly zero curvature, nonfinite center, or geometry above the finite-radius limit yields an unavailable construction with a reason. Differential work reserves 256 units of the existing 12,000-unit artifact budget; the 1 MiB artifact cap still applies. The result is approximate and has no certified error bound.

Desktop renders the world circle as an SVG ellipse in screen coordinates. Mobile renders at most 96 clipped segments. The geometry is hidden on logarithmic axes because a Euclidean world circle is not an ellipse in that projection. The construction remains in the panel with its source-linked center and radius.
