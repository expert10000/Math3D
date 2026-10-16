# Graphs consolidation milestone GRA-N01–N06

**2026-10-16.** This milestone consolidates the existing Graphs work before adding direct manipulation. The [canonical roadmap](math3d-graph2d-desktop-mobile-roadmap.md) still owns release and device signoff.

| Slice | Deliverable | Review condition | Status |
| --- | --- | --- | --- |
| GRA-N01 | Keep saved construction intent, source references, ordered dependencies and resolution separate from Inspector layout. Treat 32 objects as the current validation/evaluation safety budget. | Existing documents round-trip unchanged; dependency and budget validation remain enforced. | Existing model retained; Inspector no longer presents `4/32` as a permanent model shape. |
| GRA-N02 | Frame selected geometry, all visible geometry, or the default view with distinct actions and equal-aspect bounds for circles. Keep toolbar commands accessible without horizontal scrolling. | Unit-circle viewport and narrow toolbar interaction checks pass. | Delivered in `aa34dd8e`. |
| GRA-N03 | Use exact curves as numerical regression cases, including the unit circle at `t = 2.202629`; retain unavailable/approximate states. | Check speed, curvature, circle center/radius, tangent-normal orthogonality and updates after moving the parameter. | Existing numerical and saved-construction regressions retained. |
| GRA-N04 | Show source curve → saved point → derived construction in desktop and mobile Inspectors. Keep candidate constructions under their source and cross-source references in the saved graph. | Multiple curves and points retain correct grouping without changing the document schema. | Implemented through a shared read-only hierarchy projection. |
| GRA-N05 | Run focused core, desktop and mobile software checks for the consolidated UI and construction path. | Build, typecheck, hierarchy regression, existing unit-circle regression and desktop interaction checks pass. | Software acceptance for this slice; physical release gates remain in the canonical roadmap. |

## GRA-N06: constrained point dragging

Dragging a saved point changes only its authored parameter. Desktop and mobile project each pointer move onto the finite portion of the source curve, clamp to its authored domain, and preview dependent tangent, normal, curvature and osculating circle through the existing construction resolver. At coincident positions on a repeated or self-intersecting curve, a small continuity preference keeps the previous parameter branch. Invalid samples are skipped. A gesture commits one undoable construction update on release; Escape, pointer cancellation, interrupted touch and app backgrounding discard the preview. The Inspector parameter field remains an accessible alternative.

Acceptance: the unit-circle projection and exact differential invariants pass focused tests; the desktop interaction test checks live dependent geometry, cancellation, unchanged source and viewport, and one-step undo. Mobile uses the same projection and preview logic with a 22-point touch target.

## Crosswalk for the proposed GRA-N01–N10 list

The proposed list uses different IDs from the shipped consolidation slices above. Keep the shipped IDs stable; use this mapping when planning the remaining work.

| Proposed item | Current coverage | Status / remaining work |
| --- | --- | --- |
| N01 Construction capability and dependency audit | GRA-N01; G2D47–49 | Delivered for the reviewed construction kinds. |
| N02 Fit selection, Fit all, aspect ratio | GRA-N02 | Delivered. |
| N03 Toolbar overflow and responsive layout | GRA-N02; G2D46 | Delivered. The shipped GRA-N03 ID belongs to numerical validation. |
| N04 Compact Inspector and construction tree | GRA-N04 | Delivered on desktop and mobile. |
| N05 Exact-reference numerical tests | GRA-N03 and GRA-N05 | Unit-circle and saved-construction regressions delivered. |
| N06 Tangent/normal vectors, curvature, coordinates | G2D53–57; GRA-N04 | Lines and numerical point readouts are delivered. Dedicated vector-arrow glyphs remain open if the proposal requires them. The shipped GRA-N06 ID belongs to dragging. |
| N07 Persistent roots, intersections, extrema | G2D49 | Delivered as bounded source-linked candidate constructions. |
| N08 Drag constrained points | GRA-N06 (`65d51c3e`) | Software implemented on desktop and mobile; physical mobile drag signoff remains open. |
| N09 Expression-driven parameters and animation | G2D38 | Sliders and deterministic animation are delivered. Parameters defined by expressions and parameter dependencies remain open. |
| N10 Graph → Curve / Geometry promotion | G2D26–29 | Graph → Curve and Graph → Surface are delivered. Direct Graph → Geometry document promotion remains open and needs a destination contract. |

The 32-construction cap protects current document size, evaluation work and artifact output. Raising it requires measured performance, cancellation and mobile memory evidence; it is not a permanent semantic limit.
