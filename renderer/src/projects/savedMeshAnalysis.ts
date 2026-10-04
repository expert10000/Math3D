import { createAnalysisResultEnvelope, createDocumentRelation, createMixedWorkspaceDocument, structuralHash, type AnalysisResultEnvelope, type CanonicalJsonValue, type MixedWorkspaceDocument } from "@math3d/core";
import type { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { computeMeshQualityReport } from "../mesh/meshQualityReport";
import { computeMeshDifferentialGeometry } from "../mesh/meshDifferentialGeometry";
import { dijkstraDistancesAndPrev, reconstructPath } from "../math/selection/geodesicGraph";

export type SavedMeshAnalysisKind = "quality" | "curvature" | "edge-path";
export const savedMeshAnalysisLabel = (kind: string) => ({ quality: "Mesh quality", curvature: "Discrete curvature", "edge-path": "Shortest edge path" })[kind] ?? kind;
const statistics = (values: ArrayLike<number>, mask: Uint8Array) => {
  let count = 0, sum = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < values.length; i++) if (mask[i] && Number.isFinite(values[i])) { count++; sum += values[i]; min = Math.min(min, values[i]); max = Math.max(max, values[i]); }
  return { count, min: count ? min : null, max: count ? max : null, avg: count ? sum / count : null };
};
/** Compact summaries are canonical project data; no transient dense artifact is required to reopen them. */
export const analyzeSavedMesh = (adapter: MeshDocumentAdapter, kind: SavedMeshAnalysisKind, endpoints?: { start: number; end: number }): AnalysisResultEnvelope => {
  const mesh = adapter.mesh(), source = adapter.sourceGeneration(), started = performance.now(), vertexCount = mesh.positions.length / 3;
  if (vertexCount > 100_000 || (mesh.indices?.length ?? 0) > 600_000) throw new TypeError("This local saved analysis supports up to 100,000 vertices and 200,000 triangles. Use Mesh Analyze for larger meshes.");
  let summary: Record<string, CanonicalJsonValue>, algorithm: string, warnings: string[];
  const parameters: Record<string, CanonicalJsonValue> = {};
  if (kind === "quality") {
    const report = computeMeshQualityReport(mesh, { maxListedDefects: 0 });
    summary = { vertexCount: report.vertexCount, faceCount: report.faceCount, metrics: report.metrics, topology: report.topology };
    algorithm = "vtk-verdict-compatible-triangle-quality";
    warnings = ["Quality metrics describe the sampled triangle mesh; surface self-intersections are not certified."];
  } else if (kind === "curvature") {
    const report = computeMeshDifferentialGeometry(mesh);
    if (!report) throw new TypeError("Curvature requires a valid triangle mesh.");
    summary = { gaussian: statistics(report.K, report.validMask), mean: statistics(report.H, report.validMask), counts: report.summary, conventions: report.conventions };
    algorithm = "angle-defect-cotan-shape-operator-v2";
    warnings = ["Discrete estimates depend on mesh sampling; boundary and invalid neighborhoods need care. These values do not certify that the analytic surface is minimal."];
  } else if (kind === "edge-path") {
    if (!endpoints || ![endpoints.start, endpoints.end].every(value => Number.isSafeInteger(value) && value >= 0 && value < vertexCount)) throw new TypeError(`Choose vertex indices between 0 and ${vertexCount - 1}.`);
    // Preserve saved vertex identities: coincident sheets must not acquire edges.
    const edges = Array.from({ length: vertexCount }, () => new Map<number, number>());
    const indices = mesh.indices ?? Uint32Array.from({ length: vertexCount }, (_, i) => i);
    for (let i = 0; i < indices.length; i += 3) for (const [a, b] of [[indices[i], indices[i + 1]], [indices[i + 1], indices[i + 2]], [indices[i + 2], indices[i]]]) {
      const length = Math.hypot(...[0, 1, 2].map(axis => mesh.positions[a * 3 + axis] - mesh.positions[b * 3 + axis]));
      edges[a].set(b, length); edges[b].set(a, length);
    }
    const adjacency = { neighbors: edges.map(edge => [...edge.keys()]), weights: edges.map(edge => [...edge.values()]) };
    const { start, end } = endpoints;
    const { dist, prev } = dijkstraDistancesAndPrev({ ...adjacency, seedIndex: start, targetIndex: end });
    const route = reconstructPath(prev, start, end);
    if (!route.length || !Number.isFinite(dist[end])) throw new TypeError("These vertices have no connected edge path.");
    const vertices = route;
    summary = { length: dist[end], vertexIndices: vertices, points: vertices.map(index => Array.from(mesh.positions.slice(index * 3, index * 3 + 3))) };
    parameters.start = endpoints.start; parameters.end = endpoints.end;
    algorithm = "edge-graph-dijkstra";
    warnings = ["Shortest path along the saved mesh edges, preserving distinct vertex identities. It is an approximation to a continuous surface geodesic."];
  } else throw new TypeError("Unsupported saved Mesh analysis.");
  return createAnalysisResultEnvelope({ resultId: `saved-mesh-analysis:${structuralHash({ source, kind, parameters }).slice(7)}`, status: kind === "quality" ? "heuristic" : "numerical",
    provenance: { source, operation: { type: `mesh.saved.${kind}`, algorithm, algorithmVersion: kind === "curvature" ? "2" : "1", parameters },
      engine: { name: "Math3D local mesh analysis", version: "1" }, ...(kind === "quality" ? {} : { numericContext: { precision: { binaryBits: 53 } } }), elapsedMs: performance.now() - started },
    summary, warnings, diagnostics: [], artifacts: [],
  });
};

export const appendSavedMeshAnalysis = (workspace: MixedWorkspaceDocument, result: AnalysisResultEnvelope): MixedWorkspaceDocument => {
  if (workspace.results.some(previous => previous.resultId === result.resultId)) return workspace;
  const relation = createDocumentRelation({ kind: "analysis-of", sources: [result.provenance.source], sourceOrder: "ordered", target: { type: "result", resultId: result.resultId, resultType: result.provenance.operation.type },
    operation: result.provenance.operation.type, parameters: result.provenance.operation.parameters });
  return createMixedWorkspaceDocument({ ...workspace, results: [...workspace.results, result], relations: [...workspace.relations, relation] });
};
