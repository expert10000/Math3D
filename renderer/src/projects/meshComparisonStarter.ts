import { createMath3DProject, createMixedWorkspaceDocument, updateMath3DProjectMetadata,
  upsertMath3DProjectNote, upsertMath3DProjectSavedMeshComparison } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh, appendSavedMeshAnalysis, type SavedMeshAnalysisKind } from "./savedMeshAnalysis";
import { subdivideWithRetainedMeshCheckpoint, transformWithRetainedMeshSnapshot } from "./retainedMeshGeneration";
import { captureProjectResources } from "./projectResources";
import { buildSavedMeshResultTrend } from "./projectSavedMeshResultTrend";
import { resolveSavedMeshTrendPoint } from "./projectSavedMeshTrendPoint";
import { createSavedMeshPinnedComparison } from "./projectSavedMeshPinnedComparison";
import { createProjectSavedMeshComparisonNote } from "./projectSavedMeshComparisonNotes";

export type MeshComparisonStarterId = "mesh-comparison-study" | "mesh-comparison-review" | "mesh-subdivision-study" |
  "mesh-curvature-study" | "mesh-trend-gap-study";

const descriptions: Record<MeshComparisonStarterId, { title: string; description: string; document: string }> = {
  "mesh-comparison-study": {
    title: "Saved Mesh Comparison Study", document: "Scaled comparison square",
    description: "Compare three retained Mesh generations and their exact saved quality results. The square is scaled twice; triangle area changes while source units remain metres.",
  },
  "mesh-comparison-review": {
    title: "Saved Mesh Comparison Review", document: "Three-generation review square",
    description: "Review three exact saved A/B pairs across one square Mesh's retained generations. Two authored Notes are attached to verified pairs; the third pair has no Note.",
  },
  "mesh-subdivision-study": {
    title: "Retained Mesh Generation Study", document: "Subdivided octahedron",
    description: "Compare the original octahedron with a retained subdivision and translated, scaled revision. Exact Mesh sidecars and quality results are saved for all three generations.",
  },
  "mesh-curvature-study": {
    title: "Saved Mesh Curvature Study", document: "Scaled triangulated sphere",
    description: "Inspect three recorded discrete-curvature results for a closed triangulated sphere at different scales. These numerical estimates belong to exact saved generations.",
  },
  "mesh-trend-gap-study": {
    title: "Mesh Trend With Missing Result", document: "Square with analysis gap",
    description: "Three Mesh generations are retained, but the middle quality analysis was never saved. The trend displays that generation as not recorded; it does not invent a value.",
  },
};

const source = (filename: string) => ({ kind: "import" as const, format: "obj" as const, filename,
  ...{ math3dCoordinateFrame: { format: "math3d.coordinate-frame/v1", frame: "local", unit: "m",
    axes: ["x", "y", "z"], handedness: "right" } } });

function sphereMesh() {
  const segments = 12, rings = 7, positions = [0, 0, 1], indices: number[] = [];
  for (let ring = 1; ring < rings; ring++) {
    const phi = Math.PI * ring / rings;
    for (let segment = 0; segment < segments; segment++) {
      const theta = 2 * Math.PI * segment / segments;
      positions.push(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
    }
  }
  const south = positions.length / 3;
  positions.push(0, 0, -1);
  for (let segment = 0; segment < segments; segment++) {
    const next = (segment + 1) % segments;
    indices.push(0, 1 + segment, 1 + next);
    for (let ring = 0; ring < rings - 2; ring++) {
      const a = 1 + ring * segments + segment, b = 1 + ring * segments + next;
      const c = a + segments, d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
    indices.push(south, 1 + (rings - 2) * segments + next, 1 + (rings - 2) * segments + segment);
  }
  return MeshDocumentAdapter.fromMesh({ label: "Triangulated sphere", source: source("built-in-triangulated-sphere.obj"),
    positions: Float32Array.from(positions), indices: Uint32Array.from(indices) });
}

function starterMesh(id: MeshComparisonStarterId) {
  if (id === "mesh-curvature-study") return sphereMesh();
  if (id === "mesh-comparison-study" || id === "mesh-comparison-review" || id === "mesh-trend-gap-study") return MeshDocumentAdapter.fromMesh({
    label: "Comparison square", source: source("built-in-comparison-square.obj"),
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
    indices: Uint32Array.from([0, 1, 2, 1, 3, 2]),
  });
  return MeshDocumentAdapter.fromMesh({
    label: "Comparison octahedron", source: source("built-in-comparison-octahedron.obj"),
    positions: Float32Array.from([1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]),
    indices: Uint32Array.from([4, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0,
      5, 1, 0, 5, 2, 1, 5, 3, 2, 5, 0, 3]),
  });
}

/** Built-in examples use the same edit, analysis, and sidecar paths as a user Project. */
export function instantiateMeshComparisonStarter(token: string, id: MeshComparisonStarterId = "mesh-comparison-study") {
  const adapter = starterMesh(id), results = [];
  const kind: SavedMeshAnalysisKind = id === "mesh-curvature-study" ? "curvature" : "quality";
  results.push(analyzeSavedMesh(adapter, kind));
  if (id === "mesh-subdivision-study") subdivideWithRetainedMeshCheckpoint(adapter);
  else transformWithRetainedMeshSnapshot(adapter, [0, 0, 0], id === "mesh-curvature-study" ? 1.3 : 1.5);
  if (id !== "mesh-trend-gap-study") results.push(analyzeSavedMesh(adapter, kind));
  transformWithRetainedMeshSnapshot(adapter, id === "mesh-subdivision-study" ? [0.75, 0, 0] : [0, 0, 0],
    id === "mesh-subdivision-study" ? 1.25 : id === "mesh-curvature-study" ? 1.3 : 1.5);
  results.push(analyzeSavedMesh(adapter, kind));

  const replay = adapter.replayBundle(), current = adapter.document();
  let workspace = createMixedWorkspaceDocument({
    entries: [{ module: "mesh", checkpoint: replay.checkpoint.document, expected: current.identity,
      replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }],
    activeDocumentIds: [current.identity.id], constructions: [], results: [], relations: [], artifacts: [], committedSelection: null,
  });
  for (const result of results) workspace = appendSavedMeshAnalysis(workspace, result);
  const recipe = descriptions[id];
  let project = createMath3DProject(workspace, { stableKey: [id, token], title: recipe.title });
  project = updateMath3DProjectMetadata(project, { ...project.metadata,
    description: recipe.description, tags: ["starter", id, "mesh", "comparison", "trend", "saved-results"],
    documents: { [current.identity.id]: { title: recipe.document } },
  });
  const resources = captureProjectResources(project, item => item.kind === "mesh-buffers" ?
    adapter.resources.bytes(item.reference as never) : null);
  if (id === "mesh-comparison-review") {
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const metric = "metrics.triangleArea.avg";
    const study = buildSavedMeshResultTrend(project, results[0]!.resultId, metric, read);
    for (const [index, aIndex, bIndex, observation] of [
      [1, 0, 1, "The first saved scaling raises the recorded mean triangle area from 0.5 to 1.125 m²."],
      [2, 1, 2, "The second saved scaling raises the recorded mean triangle area from 1.125 to 2.53125 m²."],
      [3, 0, 2, ""],
    ] as const) {
      const pair = createSavedMeshPinnedComparison(project, { study,
        a: resolveSavedMeshTrendPoint(project, study, results[aIndex]!.resultId, read),
        b: resolveSavedMeshTrendPoint(project, study, results[bIndex]!.resultId, read) }, read,
        `review-pair-${index}`, `Saved review pair ${index}`);
      project = upsertMath3DProjectSavedMeshComparison(project, pair);
      if (observation) project = upsertMath3DProjectNote(project,
        createProjectSavedMeshComparisonNote(project, pair, read, `Review observation ${index}`,
          observation, Date.now(), JSON.stringify([id, token, "observation", index])));
    }
    return { project, resources: captureProjectResources(project, read) };
  }
  return { project, resources };
}
