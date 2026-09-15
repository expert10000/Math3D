import {
  createDocumentRelation,
  createStableDocumentId,
  structuralHash,
  type DocumentRelation,
  type ScientificSourceGeneration,
} from "@math3d/core";
import {
  analyzeCanonicalTopologyObject,
  canonicalizeMeshTopologySnapshot,
  hashTopologyValue,
  type CanonicalSourceCellReference,
  type MeshTopologySnapshot,
} from "./core";
import {
  TOPOLOGY_ADAPTER_EXACT_LIMITS,
  createMeshTopologySnapshot,
  type TopologyAdapterAnalysisResult,
  type TopologyMeshAdapterInput,
} from "./adapters";

export const TOPOLOGY_MESH_HANDOFF_SCHEMA_VERSION = 1 as const;

export type TopologyMeshElementKind = "vertex" | "edge" | "triangle";

export type TopologyMeshLocateReference = Readonly<{
  sourceMeshId: string;
  sourceMeshRevision: string;
  dimension: 0 | 1 | 2;
  kind: TopologyMeshElementKind;
  snapshotCellId: string;
  sourceElementId: string;
  qualifiedId: string;
  sourceIndex: number | null;
  sourceVertexIndices: readonly number[];
}>;

export type TopologyMeshSnapshotHandoff = Readonly<{
  schemaVersion: typeof TOPOLOGY_MESH_HANDOFF_SCHEMA_VERSION;
  handoffId: string;
  capturedAt: number;
  source: Readonly<{
    meshId: string;
    meshRevision: string;
    meshLabel: string;
  }>;
  snapshot: MeshTopologySnapshot;
  snapshotHash: string;
  locateBack: Readonly<{
    vertices: Readonly<Record<string, TopologyMeshLocateReference>>;
    edges: Readonly<Record<string, TopologyMeshLocateReference>>;
    triangles: Readonly<Record<string, TopologyMeshLocateReference>>;
  }>;
}>;

export type TopologyMeshHandoffFreshness = Readonly<{
  state: "current" | "stale" | "source-unavailable";
  resultState: "current" | "stale";
  reason: string;
}>;

const relationRevision = (revision: string): number => {
  const match = /(\d+)$/.exec(revision.trim());
  if (!match) return 1;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
};

export const adaptTopologyMeshSnapshotHandoffRelation = (
  handoff: TopologyMeshSnapshotHandoff
): DocumentRelation => {
  const revision = relationRevision(handoff.source.meshRevision);
  const source: ScientificSourceGeneration = {
    documentId: createStableDocumentId("mesh", handoff.source.meshId),
    revision,
    structuralHash: structuralHash(handoff.snapshot),
    generation: revision,
  };
  return createDocumentRelation({
    kind: "snapshot-of",
    sources: [source],
    sourceOrder: "unordered",
    target: {
      type: "artifact",
      artifactId: handoff.handoffId,
      artifactKind: "table",
      role: "topology/mesh-snapshot",
    },
    operation: "topology.mesh-snapshot",
    parameters: {
      sourceMeshId: handoff.source.meshId,
      sourceMeshRevision: handoff.source.meshRevision,
      snapshotHash: handoff.snapshotHash,
    },
    tool: { name: "Math3D Mesh-to-Topology adapter", version: "1" },
  });
};

const parseIndexedId = (id: string, prefix: "v" | "f"): number | null => {
  const match = new RegExp(`^${prefix}(\\d+)$`).exec(id);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
};

const parseVertexId = (id: string): number | null => parseIndexedId(id, "v");

const makeReference = (
  source: TopologyMeshSnapshotHandoff["source"],
  dimension: 0 | 1 | 2,
  kind: TopologyMeshElementKind,
  snapshotCellId: string,
  sourceIndex: number | null,
  sourceVertexIndices: readonly number[]
): TopologyMeshLocateReference => ({
  sourceMeshId: source.meshId,
  sourceMeshRevision: source.meshRevision,
  dimension,
  kind,
  snapshotCellId,
  sourceElementId: snapshotCellId,
  qualifiedId: `${source.meshId}@${source.meshRevision}/${snapshotCellId}`,
  sourceIndex,
  sourceVertexIndices: [...sourceVertexIndices],
});

const buildLocateBack = (
  source: TopologyMeshSnapshotHandoff["source"],
  snapshot: MeshTopologySnapshot
): TopologyMeshSnapshotHandoff["locateBack"] => ({
  vertices: Object.fromEntries(snapshot.vertexIds.map((id) => [
    id,
    makeReference(source, 0, "vertex", id, parseIndexedId(id, "v"), [parseVertexId(id)].filter((value): value is number => value !== null)),
  ])),
  edges: Object.fromEntries(snapshot.edges.map((edge) => [
    edge.id,
    makeReference(
      source,
      1,
      "edge",
      edge.id,
      null,
      edge.vertices.map(parseVertexId).filter((value): value is number => value !== null)
    ),
  ])),
  triangles: Object.fromEntries(snapshot.faces.map((face) => [
    face.id,
    makeReference(
      source,
      2,
      "triangle",
      face.id,
      parseIndexedId(face.id, "f"),
      face.vertexIds.map(parseVertexId).filter((value): value is number => value !== null)
    ),
  ])),
});

export const createRevisionedMeshTopologyHandoff = (
  input: TopologyMeshAdapterInput,
  options: { capturedAt?: number } = {}
): TopologyMeshSnapshotHandoff => {
  const source = {
    meshId: input.sourceObjectId,
    meshRevision: input.sourceObjectRevision,
    meshLabel: input.mesh.label,
  } as const;
  const snapshot = createMeshTopologySnapshot(input);
  const snapshotHash = hashTopologyValue(snapshot);
  return {
    schemaVersion: TOPOLOGY_MESH_HANDOFF_SCHEMA_VERSION,
    handoffId: `mesh-handoff:${snapshotHash}`,
    capturedAt: options.capturedAt ?? Date.now(),
    source,
    snapshot,
    snapshotHash,
    locateBack: buildLocateBack(source, snapshot),
  };
};

const overExactBudget = (snapshot: MeshTopologySnapshot): boolean =>
  snapshot.vertexIds.length > TOPOLOGY_ADAPTER_EXACT_LIMITS.vertices ||
  snapshot.edges.length > TOPOLOGY_ADAPTER_EXACT_LIMITS.edges ||
  snapshot.faces.length > TOPOLOGY_ADAPTER_EXACT_LIMITS.faces;

export const analyzeRevisionedMeshTopologyHandoff = (
  handoff: TopologyMeshSnapshotHandoff
): TopologyAdapterAnalysisResult => {
  if (overExactBudget(handoff.snapshot)) {
    return {
      status: "unsupported",
      method: "Mesh indexed triangle snapshot",
      fidelity: "exact-incidence",
      correspondence: "complete",
      readOnly: true,
      diagnostics: [{
        code: "adapter/exact-analysis-budget",
        severity: "warning",
        message: `Snapshot V=${handoff.snapshot.vertexIds.length}, E=${handoff.snapshot.edges.length}, F=${handoff.snapshot.faces.length} exceeds the interactive exact-analysis limit V≤${TOPOLOGY_ADAPTER_EXACT_LIMITS.vertices}, E≤${TOPOLOGY_ADAPTER_EXACT_LIMITS.edges}, F≤${TOPOLOGY_ADAPTER_EXACT_LIMITS.faces}. Use a coarser explicit snapshot; the source was not changed.`,
      }],
    };
  }
  const canonical = canonicalizeMeshTopologySnapshot(handoff.snapshot);
  return canonical.status === "accepted"
    ? { ...canonical, analysis: analyzeCanonicalTopologyObject(canonical.topologyObject) }
    : canonical;
};

export const evaluateMeshTopologyHandoffFreshness = (
  handoff: TopologyMeshSnapshotHandoff,
  current: Pick<TopologyMeshAdapterInput, "sourceObjectId" | "sourceObjectRevision"> | null | undefined
): TopologyMeshHandoffFreshness => {
  if (!current) {
    return {
      state: "source-unavailable",
      resultState: "stale",
      reason: `Source Mesh '${handoff.source.meshId}' revision '${handoff.source.meshRevision}' is not currently available. The captured snapshot remains unchanged.`,
    };
  }
  if (current.sourceObjectId !== handoff.source.meshId) {
    return {
      state: "source-unavailable",
      resultState: "stale",
      reason: `Current Mesh '${current.sourceObjectId}' is not the captured source '${handoff.source.meshId}'. The topology result still refers to the captured snapshot.`,
    };
  }
  if (current.sourceObjectRevision !== handoff.source.meshRevision) {
    return {
      state: "stale",
      resultState: "stale",
      reason: `Source Mesh advanced from revision '${handoff.source.meshRevision}' to '${current.sourceObjectRevision}'. Re-analyze to create a new snapshot; the old result was not mutated.`,
    };
  }
  return {
    state: "current",
    resultState: "current",
    reason: `Source Mesh ID and revision match the captured snapshot '${handoff.handoffId}'.`,
  };
};

export const locateMeshSnapshotCell = (
  handoff: TopologyMeshSnapshotHandoff,
  dimension: 0 | 1 | 2,
  sourceCellId: string
): TopologyMeshLocateReference | null => {
  if (dimension === 0) return handoff.locateBack.vertices[sourceCellId] ?? null;
  if (dimension === 1) return handoff.locateBack.edges[sourceCellId] ?? null;
  return handoff.locateBack.triangles[sourceCellId] ?? null;
};

export const locateCanonicalMeshSnapshotCell = (
  handoff: TopologyMeshSnapshotHandoff,
  result: TopologyAdapterAnalysisResult,
  dimension: 0 | 1 | 2,
  canonicalCellId: string
): TopologyMeshLocateReference | null => {
  if (result.status !== "accepted") return null;
  const cells = dimension === 0
    ? result.topologyObject.canonical.vertices
    : dimension === 1
      ? result.topologyObject.canonical.edges
      : result.topologyObject.canonical.faces;
  const cell = cells.find((entry) => entry.id === canonicalCellId);
  const source = cell?.sourceRefs.find((entry: CanonicalSourceCellReference) => entry.stage === "source" && entry.dimension === dimension);
  return source ? locateMeshSnapshotCell(handoff, dimension, source.cellId) : null;
};
