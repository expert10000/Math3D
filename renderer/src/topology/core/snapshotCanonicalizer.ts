import {
  TOPOLOGY_CANONICAL_SCHEMA_VERSION,
  TOPOLOGY_SNAPSHOT_CANONICALIZER_VERSION,
  type CanonicalTopologyComplex,
  type GeometryTopologySnapshot,
  type MeshTopologySnapshot,
  type TopologyDiagnostic,
  type TopologyObject,
  type TopologySource,
} from "./contracts";
import { hashTopologyValue } from "./provenance";

export type SnapshotAdapterFidelity = "exact-incidence" | "tessellated-approximation";
export type SnapshotSourceMapping = {
  vertices: Record<string, string>;
  edges: Record<string, string>;
  faces: Record<string, string>;
};
export type SnapshotCanonicalizationResult =
  | {
      status: "accepted";
      topologyObject: TopologyObject;
      diagnostics: TopologyDiagnostic[];
      mapping: SnapshotSourceMapping;
      method: string;
      fidelity: SnapshotAdapterFidelity;
      correspondence: "complete" | "partial";
      readOnly: true;
    }
  | {
      status: "unsupported" | "failed";
      diagnostics: TopologyDiagnostic[];
      method: string;
      fidelity: SnapshotAdapterFidelity;
      correspondence: "complete" | "partial" | "none";
      readOnly: true;
    };

const issue = (code: string, message: string, cellRef?: TopologyDiagnostic["cellRef"]): TopologyDiagnostic => ({
  code,
  severity: "error",
  message,
  ...(cellRef ? { cellRef } : {}),
});

const canonicalizeTriangles = (
  source: TopologySource,
  snapshot: MeshTopologySnapshot | GeometryTopologySnapshot,
  method: string,
  fidelity: SnapshotAdapterFidelity,
  correspondence: "complete" | "partial"
): SnapshotCanonicalizationResult => {
  const diagnostics: TopologyDiagnostic[] = [];
  if (snapshot.indexing !== "complete") {
    diagnostics.push(issue("adapter/incomplete-indices", "A complete indexed triangle snapshot is required; no indices were inferred."));
  }
  if (snapshot.orientation !== "source-winding") {
    diagnostics.push(issue("adapter/missing-orientation", "Face winding must be explicitly declared as the source orientation."));
  }
  const duplicateVertexIds = snapshot.vertexIds.filter((id, index) => snapshot.vertexIds.indexOf(id) !== index);
  if (duplicateVertexIds.length) diagnostics.push(issue("adapter/duplicate-vertex-id", `Duplicate vertex IDs: ${[...new Set(duplicateVertexIds)].join(", ")}.`));
  const vertexIds = new Set(snapshot.vertexIds);
  const edgeIds = new Set<string>();
  const edgeByPair = new Map<string, { id: string; vertices: [string, string] }>();
  for (const edge of snapshot.edges) {
    if (edgeIds.has(edge.id)) diagnostics.push(issue("adapter/duplicate-edge-id", `Duplicate edge ID '${edge.id}'.`, { dimension: 1, cellId: edge.id }));
    edgeIds.add(edge.id);
    const [a, b] = edge.vertices;
    if (!vertexIds.has(a) || !vertexIds.has(b)) diagnostics.push(issue("adapter/edge-index-out-of-range", `Edge '${edge.id}' references a missing vertex.`, { dimension: 1, cellId: edge.id }));
    const pair = [a, b].sort().join("\u0000");
    if (edgeByPair.has(pair)) diagnostics.push(issue("adapter/duplicate-geometric-edge", `More than one edge represents vertex pair '${a}', '${b}'.`, { dimension: 1, cellId: edge.id }));
    edgeByPair.set(pair, edge);
  }
  const faceIds = new Set<string>();
  const edgeUse = new Map<string, number>();
  const faceAttachments = new Map<string, Array<{ edgeId: string; direction: 1 | -1 }>>();
  for (const face of snapshot.faces) {
    if (faceIds.has(face.id)) diagnostics.push(issue("adapter/duplicate-face-id", `Duplicate face ID '${face.id}'.`, { dimension: 2, cellId: face.id }));
    faceIds.add(face.id);
    if (face.vertexIds.length !== 3) {
      diagnostics.push(issue("adapter/non-triangle-face", `Face '${face.id}' has ${face.vertexIds.length} vertices; only oriented triangles are accepted.`, { dimension: 2, cellId: face.id }));
      continue;
    }
    if (face.vertexIds.some((id) => !vertexIds.has(id))) {
      diagnostics.push(issue("adapter/face-index-out-of-range", `Face '${face.id}' references a missing vertex.`, { dimension: 2, cellId: face.id }));
      continue;
    }
    const attachment: Array<{ edgeId: string; direction: 1 | -1 }> = [];
    for (let side = 0; side < 3; side += 1) {
      const from = face.vertexIds[side];
      const to = face.vertexIds[(side + 1) % 3];
      const edge = edgeByPair.get([from, to].sort().join("\u0000"));
      if (!edge) {
        diagnostics.push(issue("adapter/incomplete-edge-index", `Face '${face.id}' side '${from}' → '${to}' has no source edge.`, { dimension: 2, cellId: face.id }));
        continue;
      }
      attachment.push({ edgeId: edge.id, direction: edge.vertices[0] === from && edge.vertices[1] === to ? 1 : -1 });
      edgeUse.set(edge.id, (edgeUse.get(edge.id) ?? 0) + 1);
    }
    faceAttachments.set(face.id, attachment);
  }
  for (const [edgeId, count] of edgeUse) {
    if (count > 2) diagnostics.push(issue("adapter/non-surface-dimensional", `Edge '${edgeId}' has ${count} incident triangles; this is not a surface-dimensional neighborhood.`, { dimension: 1, cellId: edgeId }));
  }
  if (diagnostics.some((entry) => entry.severity === "error")) {
    return { status: "failed", diagnostics, method, fidelity, correspondence, readOnly: true };
  }

  const mapping: SnapshotSourceMapping = { vertices: {}, edges: {}, faces: {} };
  const vertexToEdges: Record<string, string[]> = Object.fromEntries(snapshot.vertexIds.map((id) => [id, []]));
  const edgeToFaces: Record<string, string[]> = Object.fromEntries(snapshot.edges.map((edge) => [edge.id, []]));
  snapshot.edges.forEach((edge) => {
    mapping.edges[edge.id] = edge.id;
    edge.vertices.forEach((vertexId) => vertexToEdges[vertexId]?.push(edge.id));
  });
  snapshot.vertexIds.forEach((id) => { mapping.vertices[id] = id; });
  snapshot.faces.forEach((face) => {
    mapping.faces[face.id] = face.id;
    faceAttachments.get(face.id)?.forEach(({ edgeId }) => edgeToFaces[edgeId]?.push(face.id));
  });
  const canonical: CanonicalTopologyComplex = {
    schemaVersion: TOPOLOGY_CANONICAL_SCHEMA_VERSION,
    dimension: 2,
    id: `${snapshot.id}/canonical`,
    name: `${snapshot.name} incidence complex`,
    vertices: snapshot.vertexIds.map((id) => ({ id, name: id, sourceRefs: [{ stage: "source", dimension: 0, cellId: id }] })),
    edges: snapshot.edges.map((edge) => ({ id: edge.id, name: edge.id, endpoints: [...edge.vertices], sourceRefs: [{ stage: "source", dimension: 1, cellId: edge.id }] })),
    faces: snapshot.faces.map((face) => ({
      id: face.id,
      name: face.id,
      attachment: faceAttachments.get(face.id) ?? [],
      boundaryWord: (faceAttachments.get(face.id) ?? []).map((entry) => `${entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`).join(" "),
      sourceRefs: [{ stage: "source", dimension: 2, cellId: face.id }],
    })),
    incidences: { vertexToEdges, edgeToFaces },
  };
  const sourceHash = hashTopologyValue(source);
  const canonicalHash = hashTopologyValue(canonical);
  const topologyObject: TopologyObject = {
    id: snapshot.id,
    name: snapshot.name,
    source,
    canonical,
    provenance: {
      source: { kind: source.kind, revision: snapshot.sourceObjectRevision, hash: sourceHash },
      canonicalization: {
        method: "read-only oriented triangle incidence canonicalization",
        algorithmVersion: TOPOLOGY_SNAPSHOT_CANONICALIZER_VERSION,
        revision: `${TOPOLOGY_CANONICAL_SCHEMA_VERSION}:${canonicalHash}`,
        hash: canonicalHash,
      },
    },
    realizations: [],
  };
  return { status: "accepted", topologyObject, diagnostics, mapping, method, fidelity, correspondence, readOnly: true };
};

export const canonicalizeMeshTopologySnapshot = (snapshot: MeshTopologySnapshot): SnapshotCanonicalizationResult =>
  canonicalizeTriangles({ kind: "mesh-snapshot", value: snapshot }, snapshot, "Mesh indexed triangle snapshot", "exact-incidence", "complete");

export const canonicalizeGeometryTopologySnapshot = (snapshot: GeometryTopologySnapshot): SnapshotCanonicalizationResult => {
  const method = snapshot.conversion?.method ?? "undeclared Geometry conversion";
  const fidelity = snapshot.conversion?.fidelity ?? "tessellated-approximation";
  const correspondence = snapshot.conversion?.correspondence ?? "none";
  const diagnostics: TopologyDiagnostic[] = [];
  if (snapshot.representation !== "surface-tessellation") diagnostics.push(issue("adapter/unsupported-geometry-representation", `Geometry representation '${snapshot.representation}' is outside the scoped surface-tessellation adapter.`));
  if (!snapshot.conversion) diagnostics.push(issue("adapter/missing-conversion-contract", "Geometry must declare conversion method, fidelity, and correspondence."));
  if (snapshot.conversion?.unresolvedTrims) diagnostics.push(issue("adapter/unresolved-trims", "Geometry has unresolved trims; no finite incidence complex was inferred."));
  if (correspondence === "none") diagnostics.push(issue("adapter/missing-correspondence", "Geometry supplied no source correspondence for topology results."));
  if (diagnostics.length) return { status: "unsupported", diagnostics, method, fidelity, correspondence, readOnly: true };
  return canonicalizeTriangles(
    { kind: "geometry-snapshot", value: snapshot },
    snapshot,
    method,
    fidelity,
    correspondence === "complete" ? "complete" : "partial"
  );
};
