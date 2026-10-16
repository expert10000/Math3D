# Graphs GRA-N01–N10 implementation plan

**Updated 2026-10-16.** The [canonical Graphs roadmap](math3d-graph2d-desktop-mobile-roadmap.md) owns this sequence and the platform release gates. IDs below follow the requested N01–N10 order. Earlier consolidation notes used N03 for numerical validation and N06 for dragging; the delivered work is mapped to N05 and N08 here. The historical drag commit is `65d51c3e`.

| ID | Priority | Task | Status and evidence |
| --- | --- | --- | --- |
| GRA-N01 | P0 | Audit construction capabilities and dependencies | Delivered for the reviewed construction kinds through G2D47–49. The 32-object limit is an evaluation budget, not a permanent model limit. |
| GRA-N02 | P0 | Correct Fit selection, Fit all and aspect ratio | Delivered in `aa34dd8e`; the unit circle and narrow viewport are regression cases. |
| GRA-N03 | P0 | Eliminate toolbar overflow and improve responsive layout | Delivered with G2D46 and the later two-level toolbar. Commands are reachable without horizontal scrolling. |
| GRA-N04 | P0 | Compact Construction Inspector and introduce a construction tree | Delivered on desktop and mobile: source curve → saved point → dependent objects. |
| GRA-N05 | P0 | Add exact-reference numerical regression tests | Delivered for the unit circle, differential quantities, osculating circle, saved-parameter updates and construction replay. |
| GRA-N06 | P1 | Show tangent vectors, normal vectors, curvature and coordinates | **Partial.** Point coordinates, derivative, speed and curvature are in both Inspectors; tangent and normal lines are drawn. Directional vector arrows anchored at the selected/saved point remain to be built. |
| GRA-N07 | P1 | Add roots, intersections and extrema as persistent constructions | Delivered in G2D49 as bounded source-linked candidates with unavailable states after ambiguous or invalid recomputation. |
| GRA-N08 | P1 | Drag constrained points along source curves | Software delivered in `65d51c3e` on desktop and mobile. Live dependent geometry, cancel and one-step undo are tested; physical mobile drag signoff remains open. |
| GRA-N09 | P1 | Add expression-driven parameters and animation | **Partial.** G2D38 delivered sliders and deterministic animation. Parameter expressions, dependency ordering, cycles and invalidation remain open. |
| GRA-N10 | P1 | Introduce Graph → Curve / Geometry promotion | **Partial.** G2D26–29 delivered Graph → Curve and Graph → Surface. Direct Graph → Geometry document promotion needs a destination contract. |

## Next implementation: complete GRA-N06

Draw short, clearly directional tangent and normal vectors at the active saved point on desktop and mobile. Use the existing resolved derivative and normal directions; keep the full tangent/normal lines and numerical Inspector readout. Preserve equal mathematical direction under unequal screen scales, label the arrows, and hide them when the differential is unavailable or the display scale cannot represent them correctly. The unit circle at `t = 2.202629` is the exact-reference case: tangent and normal are orthogonal and the normal points toward the center. Moving the saved parameter must update arrows, curvature and osculating circle together. Include desktop interaction and mobile model checks; physical device signoff stays in the release gate.

After N06, specify N09's expression grammar, dependency graph, cycle rejection and playback semantics before implementation. N10 follows a reviewed Geometry document handoff contract. The N08 physical touch check can proceed independently when an Android device is connected.

The 32-construction cap protects current document size, evaluation work and artifact output. Raising it requires measured performance, cancellation and mobile memory evidence.
