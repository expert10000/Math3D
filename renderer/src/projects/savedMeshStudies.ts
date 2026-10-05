import type { SavedMeshAnalysisKind } from "./savedMeshAnalysis";

export const SAVED_MESH_STUDIES: readonly { id: SavedMeshAnalysisKind; label: string; purpose: string; qualification: string }[] = [
  { id: "curvature", label: "Curvature study", purpose: "Save Gaussian K and mean H statistics, valid-vertex counts and neighborhood warnings.", qualification: "Discrete sampled Mesh estimates; this does not prove analytic minimality." },
  { id: "quality", label: "Mesh quality study", purpose: "Save triangle quality, boundary edges and degenerate-face diagnostics.", qualification: "Quality describes this triangle mesh; self-intersections are not certified." },
  { id: "edge-path", label: "Edge-path study", purpose: "Save the shortest connected path between the start and end vertex indices below.", qualification: "The path follows saved Mesh edges; it is not a certified continuous geodesic." },
];

export const studyEndpoints = (start: string, end: string, vertexCount: number) => {
  const result = { start: Number(start), end: Number(end || vertexCount - 1) };
  if (!start.trim() || ![result.start, result.end].every(value => Number.isSafeInteger(value) && value >= 0)) throw new TypeError("Enter nonnegative whole start and end vertex indices.");
  return result;
};
