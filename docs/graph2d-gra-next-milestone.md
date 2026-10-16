# Graphs GRA-N01–N10 implementation plan

**Updated 2026-10-16.** The [canonical Graphs roadmap](math3d-graph2d-desktop-mobile-roadmap.md) owns this sequence and the platform release gates. IDs below follow the requested N01–N10 order. Earlier consolidation notes used N03 for numerical validation and N06 for dragging; the delivered work is mapped to N05 and N08 here. The historical drag commit is `65d51c3e`.

| ID | Priority | Task | Status and evidence |
| --- | --- | --- | --- |
| GRA-N01 | P0 | Audit construction capabilities and dependencies | Delivered for the reviewed construction kinds through G2D47–49. The 32-object limit is an evaluation budget, not a permanent model limit. |
| GRA-N02 | P0 | Correct Fit selection, Fit all and aspect ratio | Delivered in `aa34dd8e`; the unit circle and narrow viewport are regression cases. |
| GRA-N03 | P0 | Eliminate toolbar overflow and improve responsive layout | Delivered with G2D46 and the later two-level toolbar. Commands are reachable without horizontal scrolling. |
| GRA-N04 | P0 | Compact Construction Inspector and introduce a construction tree | Delivered on desktop and mobile: source curve → saved point → dependent objects. |
| GRA-N05 | P0 | Add exact-reference numerical regression tests | Delivered for the unit circle, differential quantities, osculating circle, saved-parameter updates and construction replay. |
| GRA-N06 | P1 | Show tangent vectors, normal vectors, curvature and coordinates | Software delivered. Both viewers draw labelled, fixed-screen-length T/N arrows from the resolved derivative direction alongside full construction lines and Inspector values. Core unit-circle, unequal-scale and singular cases plus desktop drag/undo are checked; physical mobile visual signoff remains open. |
| GRA-N07 | P1 | Add roots, intersections and extrema as persistent constructions | Delivered in G2D49 as bounded source-linked candidates with unavailable states after ambiguous or invalid recomputation. |
| GRA-N08 | P1 | Drag constrained points along source curves | Software delivered in `65d51c3e` on desktop and mobile. Live dependent geometry, cancel and one-step undo are tested; physical mobile drag signoff remains open. |
| GRA-N09 | P1 | Add expression-driven parameters and animation | Software delivered. Derived parameters use the shared bounded expression grammar, dependency ordering and cycle rejection; slider preview, undo and deterministic animation recompute dependents. Desktop/mobile controls and numerical regression checks are in [GRA-N09](graph2d-gra-n09-expression-parameters.md). Physical mobile visual signoff remains open. |
| GRA-N10 | P1 | Introduce Graph → Curve / Geometry promotion | **Software delivered.** Graph → Curve/Surface remains available; direct Graph → Geometry creates a bounded, source-linked native Geometry snapshot on desktop and mobile. Opened desktop targets reuse the Curves or shared 3D viewers rather than the promotion preview. Geometry opens front-on to its `z=0` profile with the grids off; Fit, Grid and Front view remain available. See [GRA-N10](graph2d-gra-n10-geometry-promotion.md). Physical mobile signoff remains open. |

## GRA-N06 acceptance and next implementation

The shared vector projection uses the resolved derivative and normal directions. Arrows are normalized display cues, so their screen length does not claim derivative magnitude. The full lines and numerical Inspector readout remain. Projection accounts for unequal axis scales, labels T/N, and suppresses arrows when the differential is unavailable, the display uses log axes, or the arrow would clip at the plot edge. The unit circle at `t = 2.202629` checks tangent/normal orthogonality and inward normal direction. Saved-parameter preview updates arrows, curvature and osculating circle together. Physical device signoff stays in the release gate.

**Next:** complete the Samsung touch and visual checks for N06/N08/N09/N10 and the remaining Graphs release gates. The next feature should be chosen from the canonical roadmap after that check.

The 32-construction cap protects current document size, evaluation work and artifact output. Raising it requires measured performance, cancellation and mobile memory evidence.
