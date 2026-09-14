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

export const analyzeMeshTopologySnapshot = (input: TopologyMeshAdapterInput): TopologyAdapterAnalysisResult =>
  withAnalysis(canonicalizeMeshTopologySnapshot(createMeshTopologySnapshot(input)));

export const analyzeGeometryTopologySnapshot = (input: TopologyGeometryAdapterInput): TopologyAdapterAnalysisResult =>
  withAnalysis(canonicalizeGeometryTopologySnapshot(createGeometryTopologySnapshot(input)));
