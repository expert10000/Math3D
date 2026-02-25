Architecture Sketch

Add a new semantic layer: Geometry Viewer that builds constructions and emits render primitives.
Reuse SurfaceViewer (mesh mode) as the renderer by supplying surfaceMeshOverride plus overlay lines/points.
New Modules (suggested paths)

types.ts
Point3, Segment3, Line3, Plane, Triangle, Polygon, Polyhedron
construct.ts
Plane through 3 points
Angle bisector in plane (for ∠BAD, ∠BCD, ∠BSD)
Triangle incenter + incircle
Line–line intersection (coplanar)
Line–plane intersection
analysis.ts
Coplanarity test for 4 points (volume/determinant)
Best‑fit plane + residuals
Constraint evaluation with tolerance (status + residual)
render.ts
Convert primitives to SurfaceMeshData, OverlayPolylineGroup, OverlayPointSet
Mesh output for triangles/quads + line overlays + labels
New UI Components

GeometryViewer.tsx
Wrap SurfaceViewer and pass:
surfaceMeshOverride from GeometryScene (triangles/quads)
overlayPolylineGroups for edges, bisectors, incircles
overlayPointSets for labeled points
StereometryAnalyzerPanel.tsx
UI flow for pyramid ABCDS + apex S
Auto‑build constructions, show residuals and constraint badges
Plane‑through‑incenters check: show plane equation + distance of 4th
App Wiring

App.tsx
Add a new top‑level Mode: "geometry"
Add state for GeometryScene + selected template
Render GeometryViewer in main viewport, StereometryAnalyzerPanel in side panel
Keep Mesh Viewer as backend; Geometry Viewer feeds it
Algorithms (high‑level choices)

Plane through 3 points: n = (B−A)×(C−A), d = −n·A
Angle bisector in plane: take unit directions of the rays, sum and normalize; construct bisector line in the same plane
Coplanarity: tetra volume |(B−A)·((C−A)×(D−A))| vs tolerance
Best‑fit plane: centroid + covariance; smallest eigenvector gives normal
Line‑line intersection: project to plane basis (2D) and solve
Line‑plane: t = (n·(P0−L0)) / (n·Ldir)
PR‑Sized Roadmap

PR A — Geometry primitives + overlays
Types + render conversion utilities
GeometryViewer stub that renders points/segments/triangles on top of mesh
PR B — Constructions + constraints
Plane/line/angle/incenter/intersections
Constraint engine + badges (green/red with tolerance)
PR C — Stereometry Analyzer
Pyramid template (A,B,C,D,S)
Auto‑build bisectors + incenters + plane check
UI panel + residuals + overlay highlights