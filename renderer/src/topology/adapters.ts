import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import {
  analyzeCanonicalTopologyObject,
  canonicalizeGeometryTopologySnapshot,
  canonicalizeMeshTopologySnapshot,
  type CanonicalTopologyAnalysis,
  type GeometryTopologySnapshot,
  type MeshTopologySnapshot,
  type SnapshotCanonicalizationResult,
} from "./core";

export type TopologyMeshAdapterInput = {
  mesh: SurfaceMeshData;
  sourceObjectId: string;
  sourceObjectRevision: string;
};

export type TopologyGeometryAdapterInput = TopologyMeshAdapterInput & {
  conversionMethod: string;
  fidelity: "exact-incidence" | "tessellated-approximation";
  correspondence: "complete" | "partial" | "none";
  unresolvedTrims?: boolean;
};

export type TopologyAdapterAnalysisResult = SnapshotCanonicalizationResult & {
  analysis?: CanonicalTopologyAnalysis;
};

export const TOPOLOGY_ADAPTER_EXACT_LIMITS = { vertices: 256, edges: 1_000, faces: 512 } as const;

const overExactBudget = (snapshot: Pick<MeshTopologySnapshot, "vertexIds" | "edges" | "faces">): boolean =>
  snapshot.vertexIds.length > TOPOLOGY_ADAPTER_EXACT_LIMITS.vertices ||
  snapshot.edges.length > TOPOLOGY_ADAPTER_EXACT_LIMITS.edges ||
  snapshot.faces.length > TOPOLOGY_ADAPTER_EXACT_LIMITS.faces;

const budgetResult = (
  counts: { vertices: number; edges: number; faces: number },
  method: string,
  fidelity: "exact-incidence" | "tessellated-approximation",
  correspondence: "complete" | "partial" | "none"
): TopologyAdapterAnalysisResult => ({
  status: "unsupported",
  method,
  fidelity,
  correspondence,
  readOnly: true,
  diagnostics: [{
    code: "adapter/exact-analysis-budget",
    severity: "warning",
    message: `Snapshot V=${counts.vertices}, E=${counts.edges}, F=${counts.faces} exceeds the interactive exact-analysis limit V≤${TOPOLOGY_ADAPTER_EXACT_LIMITS.vertices}, E≤${TOPOLOGY_ADAPTER_EXACT_LIMITS.edges}, F≤${TOPOLOGY_ADAPTER_EXACT_LIMITS.faces}. Use a coarser explicit snapshot; the source was not changed.`,
  }],
});

const indexedSnapshotCells = (mesh: SurfaceMeshData) => {
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const vertexIds = Array.from({ length: vertexCount }, (_, index) => `v${index}`);
  if (!mesh.indices || mesh.indices.length % 3 !== 0) {
    return { vertexIds, edges: [], faces: [], indexing: "incomplete" as const };
  }
  const edgeByPair = new Map<string, { id: string; vertices: [string, string] }>();
  const faces: MeshTopologySnapshot["faces"] = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const indices = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]];
    const ids = indices.map((index) => vertexIds[index] ?? `missing:${index}`);
    faces.push({ id: `f${offset / 3}`, vertexIds: ids });
    for (let side = 0; side < 3; side += 1) {
      const a = indices[side];
      const b = indices[(side + 1) % 3];
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      if (!edgeByPair.has(key)) edgeByPair.set(key, { id: `e${lo}:${hi}`, vertices: [`v${lo}`, `v${hi}`] });
    }
  }
  return { vertexIds, edges: [...edgeByPair.values()].sort((a, b) => a.id.localeCompare(b.id)), faces, indexing: "complete" as const };
};

export const createMeshTopologySnapshot = (input: TopologyMeshAdapterInput): MeshTopologySnapshot => ({
  id: `mesh-topology:${input.sourceObjectId}`,
  name: `${input.mesh.label} topology snapshot`,
  sourceObjectId: input.sourceObjectId,
  sourceObjectRevision: input.sourceObjectRevision,
  ...indexedSnapshotCells(input.mesh),
  orientation: "source-winding",
});

export const createGeometryTopologySnapshot = (input: TopologyGeometryAdapterInput): GeometryTopologySnapshot => ({
  id: `geometry-topology:${input.sourceObjectId}`,
  name: `${input.mesh.label} Geometry topology snapshot`,
  sourceObjectId: input.sourceObjectId,
  sourceObjectRevision: input.sourceObjectRevision,
  representation: "surface-tessellation",
  ...indexedSnapshotCells(input.mesh),
  orientation: "source-winding",
  conversion: {
    method: input.conversionMethod,
    fidelity: input.fidelity,
    correspondence: input.correspondence,
    unresolvedTrims: input.unresolvedTrims,
  },
});

const withAnalysis = (result: SnapshotCanonicalizationResult): TopologyAdapterAnalysisResult =>
  result.status === "accepted"
    ? { ...result, analysis: analyzeCanonicalTopologyObject(result.topologyObject) }
    : result;

export const analyzeMeshTopologySnapshot = (input: TopologyMeshAdapterInput): TopologyAdapterAnalysisResult => {
  const preflight = {
    vertices: Math.floor(input.mesh.positions.length / 3),
    edges: Math.floor((input.mesh.indices?.length ?? 0)),
    faces: Math.floor((input.mesh.indices?.length ?? 0) / 3),
  };
  if (preflight.vertices > TOPOLOGY_ADAPTER_EXACT_LIMITS.vertices || preflight.faces > TOPOLOGY_ADAPTER_EXACT_LIMITS.faces) {
    return budgetResult(preflight, "Mesh indexed triangle snapshot", "exact-incidence", "complete");
  }
  const snapshot = createMeshTopologySnapshot(input);
  if (overExactBudget(snapshot)) return budgetResult({ vertices: snapshot.vertexIds.length, edges: snapshot.edges.length, faces: snapshot.faces.length }, "Mesh indexed triangle snapshot", "exact-incidence", "complete");
  return withAnalysis(canonicalizeMeshTopologySnapshot(snapshot));
};

export const analyzeGeometryTopologySnapshot = (input: TopologyGeometryAdapterInput): TopologyAdapterAnalysisResult => {
  const preflight = {
    vertices: Math.floor(input.mesh.positions.length / 3),
    edges: Math.floor((input.mesh.indices?.length ?? 0)),
    faces: Math.floor((input.mesh.indices?.length ?? 0) / 3),
  };
  if (preflight.vertices > TOPOLOGY_ADAPTER_EXACT_LIMITS.vertices || preflight.faces > TOPOLOGY_ADAPTER_EXACT_LIMITS.faces) {
    return budgetResult(preflight, input.conversionMethod, input.fidelity, input.correspondence);
  }
  const snapshot = createGeometryTopologySnapshot(input);
  if (overExactBudget(snapshot)) return budgetResult({ vertices: snapshot.vertexIds.length, edges: snapshot.edges.length, faces: snapshot.faces.length }, input.conversionMethod, input.fidelity, input.correspondence);
  return withAnalysis(canonicalizeGeometryTopologySnapshot(snapshot));
};
