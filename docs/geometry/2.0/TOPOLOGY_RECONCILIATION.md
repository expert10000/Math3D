# Geometry 2.0 topology: meanings, evidence, and first implementation slice

Date: 2026-11-14. The two neighboring documents are proposals supplied for review: [Geometry review and release roadmap](MATH3D_GEOMETRY_2_0_REVIEW_AND_RELEASE_ROADMAP.md) and [Geometry–Mesh unification plan](Math3D_Geometry_Mesh_Unification_Plan.md). Their proposed acceptance criteria are not evidence that Math3D already passes them, and they do not automatically amend the [2.0 release roadmap](../../releases/2.0.0/ROADMAP.md).

## What “topology” means here

| Term in UI or plan | Input and claim | Owner |
| --- | --- | --- |
| **Raw indexed display-mesh topology** | Vertices are buffer indices; edges are pairs of indices. Render seams remain separate. Its Euler characteristic describes that indexed triangle complex, even if the viewport looks closed. | Geometry view of its generated display mesh; Mesh analysis can inspect the same representation. |
| **Exact-position interpretation** | A user-requested, read-only candidate that identifies exactly equal coordinates *within one selected mesh* (tolerance 0 scene units). It can reveal a connected box boundary, but coincident independent sheets may be joined. It is not a semantic reconstruction or edit. | Geometry analysis, with method and source revision shown. |
| **Semantic Geometry topology** | Bodies, curves, surfaces, construction dependencies, and mathematical definitions. A polygon gluing diagram has its own quotient-complex invariants, independent of the selected box. | Geometry and the Topology module. |
| **Editable Mesh topology** | Component incidence, boundary/manifold diagnostics, remeshing, repair and topology-changing operations on a particular mesh revision. | Mesh workbench. |
| **Solid validity** | Requires a suitable closed, manifold, consistently oriented boundary and a stated measurement method. “Valid triangles” alone does not establish it. | Measurement/validation result, not the Euler count alone. |

The word **connected** must name its evidence. The screenshot's box is made with `THREE.BoxGeometry`, which keeps face-specific render vertices. Raw index counts are `V=24, E=30, F=12, χ=6`, six patches with boundary edges. Identifying exact coincident positions in that *one mesh*, when explicitly requested, gives `V=8, E=18, F=12, χ=2`, one boundary-free candidate. This does **not** prove that arbitrary coincident sheets form one surface. The source geometry is never welded by the interpretation.

## Verified source facts

- [`computeTriangleMeshCellCounts`](../../../renderer/src/App.tsx) counts index vertices and unique index-edge pairs; the Euler panel previously gave no representation qualifier.
- [`BoxGeometry`](../../../renderer/src/geometry/proceduralObjects.ts) supplies the procedural box display mesh with face-specific vertices.
- [`computeGeometryAnalysisTopologySummary`](../../../renderer/src/geometry/analysisBridge.ts) also computes index-based incidence; its result is now labeled raw indexed in the visible quick-analysis card and table.
- [`computeMeshTopologyInspector`](../../../renderer/src/mesh/topologyInspector.ts) already exposes indexed components, boundary edges, non-manifold edges, and Euler characteristic. The new candidate interpretation reuses that inspector after explicit exact-coordinate reindexing.
- The polygon-identification demonstration computes a *different* quotient complex. Its sphere/torus/Klein/Möbius comparisons are mathematical examples, not validations of the selected object's render mesh.

## Work started in this branch

1. Rename the selected/scene Euler block to **Raw indexed display-mesh topology** and display source, revision, component, boundary and non-manifold context. The scene total remains a per-mesh sum; no cross-object identification is performed.
2. Add **Interpret coincident vertices** for a selected mesh. It produces a separate read-only candidate with method, tolerance, source revision, counts, and an explicit warning about coincident independent sheets.
3. Label quick topology results and the polyhedron demonstration as raw-index based, and clarify that triangle validity is not solid validity.
4. Unit tests cover the 24-index box and coincident disconnected triangles. The raw input remains unchanged after interpretation.

## Remaining acceptance work

- Decide whether a semantic primitive-boundary report can be derived from each supported Geometry definition without guessing from display positions. Its revision and method must be explicit. The current exact-position candidate is **not** that report.
- Add a desktop acceptance case for the visible raw/candidate distinction, source change invalidation, scene total, and disconnected patches.
- Qualify volume and solid measurements independently from this topology view. A mesh with boundary or inconsistent orientation must not be presented as a reliable closed-solid volume.
- Run the continuous Geometry→Mesh journey proposed in the review document and record each step's actual pass/fail status. Do not mark the new journey GA-complete from isolated topology tests.
- Reconcile any newly required release claims with the existing 2.0 acceptance matrix and supported project format before calling them blockers.
