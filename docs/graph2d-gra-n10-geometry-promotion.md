# GRA-N10 Graph to Geometry promotion

An explicit or parametric Graph object can be promoted to a native Geometry document on desktop and mobile. In Graphs, select the source object, open **Promote**, choose **Promote to Geometry** (desktop) or **geometry** (mobile), preview, then create the target.

The target is a bounded snapshot of 1,024 connected segments in the `z=0` plane. Its Geometry scene contains the segments, and the `math3d.graph2d.profile.v1` source extension records the source object ID, expressions, domain, variable values, and sampling plane. The standard `promoted-from` relation records the captured Graph generation. Profile validation rejects undefined values and suspected discontinuities before a target is created.

Editing the Graph later marks the relation stale without changing the Geometry snapshot. Regeneration replaces an unchanged target generation or forks a new target if the existing Geometry document has been edited. Desktop and mobile project refresh create new historical copies. The target can be serialized, saved with its Graph, reopened, and previewed on both platforms.

Opening a desktop Curve target uses the Curves viewer, including its Fit, grid, axes and orbit controls. Opened Surface and Geometry targets use the shared 3D viewer rather than the lightweight promotion preview. A promoted Geometry target starts facing its `z=0` profile with the reference grids hidden; Fit geometry, Grid, orbit and Front view controls remain available. The target is sampled geometry, so it does not retain a live symbolic curve inside Geometry. For a symbolic curve and differential analysis, use **Promote to Curve**. The 1,024 segment bound is intentional; larger or adaptive Geometry exports need a separate performance and fidelity design.

Verification: core and desktop build, desktop and mobile TypeScript checks, focused core/persistence/refresh tests, and the desktop promotion Electron flow. Focused Samsung preview evidence is linked below; the broader Graphs physical release gate remains open.

The opened-target viewer follow-up was verified with a fresh core build, renderer TypeScript check and the desktop Electron promotion flow covering Curve, revolution, extrusion and Geometry targets. The Geometry front-view and grid defaults were also checked in a rendered desktop capture.

The mobile action is labelled **Create target and show preview**. Mobile currently displays the saved target in its embedded, bounded wireframe preview; it does not open the desktop main Geometry viewer. The preview renders up to 768 line segments distributed across the complete 1,024-segment profile, so closed curves remain closed. A unit-circle endpoint regression and a focused [physical Samsung check](evidence/graph2d-gra-n-samsung-2026-10-18/README.md) cover that behavior. Full mobile Geometry viewing and the wider MOB-G13 release checks remain open.
