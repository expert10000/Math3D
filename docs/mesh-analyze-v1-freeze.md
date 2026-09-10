# Mesh Analyze v1 workflow freeze

Freeze date: 2026-09-10

Mesh Analyze v1 keeps one shared document scene and one scientific workflow:

| Region | v1 responsibility |
| --- | --- |
| Left | Choose the target, analysis family, parameters, and selection scope. |
| Center | Display the mesh, scalar/vector layers, diagnostics, and independent probe. |
| Right | Interpret the active scientific result, selection, diagnostics, and computation history. |

VTK and CGAL remain implementation backends behind the shared workflow. They do not receive separate primary panels. VTK supplies independent curvature and triangle-quality references plus supported mesh operations. CGAL supplies authoritative integrity operations and triangulated-surface shortest paths. The renderer owns interactive scalar/vector analysis and presents backend provenance in the shared Inspector.

The frozen v1 acceptance scenarios are:

1. **Clean sphere:** zero boundary and coincident defects, an explicit approximate self-intersection warning, finite curvature, and the left/center/right workflow.
2. **Fandisk:** real-mesh curvature and reusable surface-feature classification.
3. **Stanford Bunny:** worker-backed curvature and feature publication with computation history.
4. **Problem mesh:** canonical invalid state and actionable boundary diagnostics.
5. **Graph versus surface:** distinct approximate edge-graph and CGAL triangle-interior paths, with the surface path shorter on the reference open cube.

After preparing the CGAL worker with `npm run setup:cgal-worker`, run the complete acceptance gate from the repository root:

```powershell
npm run test:mesh-analyze:v1:acceptance
```

That command runs the focused numerical/unit contract, the existing scientific UI suite, the five v1 scenarios, independent VTK references, CGAL geodesic and boolean verification, and current-build Bunny/Armadillo/Dragon worker profiling.

Changes after this freeze must preserve result semantics, layout responsibilities, backend provenance, revision-safe publication, and the five acceptance scenarios. New analysis families belong in the shared taxonomy and Inspector rather than engine-specific primary workflows.
