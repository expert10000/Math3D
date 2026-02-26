# Geometry Viewer Roadmap

## Architecture Sketch
- Add a new semantic layer: Geometry Viewer builds constructions and emits render primitives.
- Reuse SurfaceViewer (mesh mode) as the renderer via `surfaceMeshOverride` + overlay lines/points.

## New Modules
- `renderer/src/geometry/types.ts`
Point3, Segment3, Line3, Plane, Triangle, Polygon, Polyhedron.

- `renderer/src/geometry/construct.ts`
Plane through 3 points, angle bisector in plane (∠BAD, ∠BCD, ∠BSD), triangle incenter + incircle, line–line intersection (coplanar), line–plane intersection.

- `renderer/src/geometry/analysis.ts`
Coplanarity test for 4 points, best‑fit plane + residuals, constraint evaluation with tolerance (status + residual).

- `renderer/src/geometry/render.ts`
Convert primitives to `SurfaceMeshData`, `OverlayPolylineGroup`, `OverlayPointSet`. Mesh output for triangles/quads + line overlays + labels.

## New UI Components
- `renderer/src/components/GeometryViewer.tsx`
Wraps SurfaceViewer and passes `surfaceMeshOverride` (triangles/quads), `overlayPolylineGroups` (edges/bisectors/incircles), `overlayPointSets` (labels).

- `renderer/src/components/StereometryAnalyzerPanel.tsx`
UI flow for pyramid ABCDS + apex S. Auto‑build constructions, show residuals and constraint badges. Plane‑through‑incenters check with plane equation + distance of 4th.

## App Wiring
- `renderer/src/App.tsx`
Add a top‑level Mode `geometry`. Add state for GeometryScene + selected template. Render GeometryViewer in main viewport, StereometryAnalyzerPanel in side panel. Keep Mesh Viewer as backend.

## Algorithms (High‑Level Choices)
- Plane through 3 points: `n = (B−A)×(C−A)`, `d = −n·A`.
- Angle bisector in plane: unit directions of rays, sum and normalize; construct bisector line in the same plane.
- Coplanarity: tetra volume `|(B−A)·((C−A)×(D−A))|` vs tolerance.
- Best‑fit plane: centroid + covariance; smallest eigenvector gives normal.
- Line–line intersection: project to plane basis (2D) and solve.
- Line–plane: `t = (n·(P0−L0)) / (n·Ldir)`.

## PR‑Sized Roadmap
1. PR A — Geometry primitives + overlays
Types + render conversion utilities. GeometryViewer stub renders points/segments/triangles on top of mesh.

2. PR B — Constructions + constraints
Plane/line/angle/incenter/intersections. Constraint engine + badges (green/red with tolerance).

3. PR C — Stereometry Analyzer
Pyramid template (A,B,C,D,S). Auto‑build bisectors + incenters + plane check. UI panel + residuals + overlay highlights.
