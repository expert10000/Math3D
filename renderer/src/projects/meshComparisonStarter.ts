import { createMath3DProject, createMixedWorkspaceDocument, updateMath3DProjectMetadata } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { transformWithRetainedMeshSnapshot } from "./retainedMeshGeneration";
import { captureProjectResources } from "./projectResources";

/** A small, reproducible Project with three recorded generations and no inferred results. */
export function instantiateMeshComparisonStarter(token: string) {
  const id = "mesh-comparison-study";
  const adapter = MeshDocumentAdapter.fromMesh({
    label: "Comparison square",
    source: { kind: "import", format: "obj", filename: "comparison-square.obj",
      ...{ math3dCoordinateFrame: { format: "math3d.coordinate-frame/v1", frame: "local", unit: "m",
        axes: ["x", "y", "z"], handedness: "right" } } },
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
    indices: Uint32Array.from([0, 1, 2, 1, 3, 2]),
  });
  const first = analyzeSavedMesh(adapter, "quality");
  transformWithRetainedMeshSnapshot(adapter, [0, 0, 0], 1.5);
  const second = analyzeSavedMesh(adapter, "quality");
  transformWithRetainedMeshSnapshot(adapter, [0, 0, 0], 1.5);
  const third = analyzeSavedMesh(adapter, "quality");
  const replay = adapter.replayBundle(), current = adapter.document();
  let workspace = createMixedWorkspaceDocument({
    entries: [{ module: "mesh", checkpoint: replay.checkpoint.document, expected: current.identity,
      replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }],
    activeDocumentIds: [current.identity.id], constructions: [], results: [], relations: [], artifacts: [], committedSelection: null,
  });
  for (const result of [first, second, third]) workspace = appendSavedMeshAnalysis(workspace, result);
  let project = createMath3DProject(workspace, { stableKey: [id, token], title: "Saved Mesh Comparison Study" });
  project = updateMath3DProjectMetadata(project, { ...project.metadata,
    description: "Compare three retained Mesh generations and their exact saved quality results. The square is scaled twice; triangle area changes while source units remain metres.",
    tags: ["starter", id, "mesh", "comparison", "trend", "saved-results"],
    documents: { [current.identity.id]: { title: "Scaled comparison square" } },
  });
  const resources = captureProjectResources(project, item => item.kind === "mesh-buffers" ?
    adapter.resources.bytes(item.reference as never) : null);
  return { project, resources };
}
