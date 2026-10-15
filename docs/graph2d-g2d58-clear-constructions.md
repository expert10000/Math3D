# G2D58 — clear saved constructions

**Software status — 2026-10-15:** Implemented for desktop Graphs and native mobile Graphs.

**Clear all constructions** in the Constructions panel removes every saved point, dependent tangent or normal, candidate, curvature measurement, and osculating circle from the current Graph document. It leaves authored graph objects, variables, styles, viewport, and current selection intact. The action is one reversible command, so Undo restores the entire construction set at once. A document with no constructions no longer requires any construction capability.

Dependent objects are deleted in reverse saved order. The construction schema requires dependencies to precede their consumers, making each intermediate deletion valid. The panel also identifies the source curve of each saved point and explains that moving its parameter recomputes dependent constructions without moving the authored graph.

Acceptance covers source and viewport invariance when an anchor moves, bulk clear and one-step undo/redo, an unchanged authored plot path in the desktop interaction, and shared mobile command behavior. Physical-device and spoken screen-reader signoff remain under MOB-G13/G2D40.
