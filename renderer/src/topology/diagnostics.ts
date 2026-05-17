import type { QuotientComplex } from "./types";

export type NonManifoldEdgeDiagnostic = {
  edgeId: string;
  sourceEdgeIds: string[];
  incidentFaces: string[];
  incidentCount: number;
};

export type VertexStarDisconnectionDiagnostic = {
  vertexId: string;
  incidentEdgeCount: number;
  components: number;
  edgeIds: string[];
};

export type InvalidBoundaryCycleDiagnostic = {
  faceId: string;
  reason: string;
  edgeIds: string[];
};

export const computeNonManifoldEdgeDiagnostics = (quotient: QuotientComplex): NonManifoldEdgeDiagnostic[] =>
  (quotient.edges ?? [])
    .map((edge) => {
      const incidentFaces = quotient.incidences.edgeToFaces?.[edge.id] ?? [];
      return {
        edgeId: edge.id,
        sourceEdgeIds: edge.sourceEdgeIds ?? [],
        incidentFaces,
        incidentCount: incidentFaces.length,
      };
    })
    .filter((entry) => entry.incidentCount > 2)
    .sort((a, b) => b.incidentCount - a.incidentCount || a.edgeId.localeCompare(b.edgeId));

export const computeVertexStarDisconnectionDiagnostics = (
  quotient: QuotientComplex
): VertexStarDisconnectionDiagnostic[] => {
  const edges = quotient.edges ?? [];
  const faces = quotient.cellBoundaries ?? [];
  const vertexToEdges = quotient.incidences.vertexToEdges ?? {};
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const result: VertexStarDisconnectionDiagnostic[] = [];

  for (const [vertexId, rawIncidentEdges] of Object.entries(vertexToEdges)) {
    const incidentEdges = (rawIncidentEdges ?? []).filter((edgeId) => edgeById.has(edgeId));
    if (incidentEdges.length < 2) continue;
    const incidentSet = new Set(incidentEdges);
    const adjacency: Record<string, Set<string>> = {};
    incidentEdges.forEach((edgeId) => {
      adjacency[edgeId] = new Set<string>();
    });

    for (const face of faces) {
      const faceEdges = (face.edgeWalk ?? [])
        .map((entry) => entry.edgeId)
        .filter((edgeId) => incidentSet.has(edgeId));
      if (faceEdges.length < 2) continue;
      const uniqueFaceEdges = Array.from(new Set(faceEdges));
      for (let i = 0; i < uniqueFaceEdges.length; i += 1) {
        for (let j = i + 1; j < uniqueFaceEdges.length; j += 1) {
          adjacency[uniqueFaceEdges[i]]?.add(uniqueFaceEdges[j]);
          adjacency[uniqueFaceEdges[j]]?.add(uniqueFaceEdges[i]);
        }
      }
    }

    let components = 0;
    const visited = new Set<string>();
    for (const edgeId of incidentEdges) {
      if (visited.has(edgeId)) continue;
      components += 1;
      const stack = [edgeId];
      visited.add(edgeId);
      while (stack.length) {
        const current = stack.pop();
        if (!current) continue;
        for (const next of adjacency[current] ?? []) {
          if (visited.has(next)) continue;
          visited.add(next);
          stack.push(next);
        }
      }
    }

    if (components > 1) {
      result.push({
        vertexId,
        incidentEdgeCount: incidentEdges.length,
        components,
        edgeIds: incidentEdges.slice().sort((a, b) => a.localeCompare(b)),
      });
    }
  }

  return result.sort((a, b) => b.components - a.components || b.incidentEdgeCount - a.incidentEdgeCount);
};

export const computeInvalidBoundaryCycleDiagnostics = (quotient: QuotientComplex): InvalidBoundaryCycleDiagnostic[] => {
  const edgeById = new Map((quotient.edges ?? []).map((edge) => [edge.id, edge]));
  const faceById = new Map((quotient.faces ?? []).map((face) => [face.id, face]));
  const result: InvalidBoundaryCycleDiagnostic[] = [];

  for (const boundary of quotient.cellBoundaries ?? []) {
    const faceId = boundary.faceId;
    const edgeIds = (boundary.edgeWalk ?? []).map((entry) => entry.edgeId);
    if (edgeIds.length < 3) {
      result.push({ faceId, reason: "boundary has fewer than 3 edges", edgeIds });
      continue;
    }
    const missingEdge = edgeIds.find((edgeId) => !edgeById.has(edgeId));
    if (missingEdge) {
      result.push({ faceId, reason: `missing quotient edge '${missingEdge}'`, edgeIds });
      continue;
    }
    let contiguous = true;
    for (let i = 0; i < edgeIds.length; i += 1) {
      const current = edgeById.get(edgeIds[i]);
      const next = edgeById.get(edgeIds[(i + 1) % edgeIds.length]);
      if (!current || !next) {
        contiguous = false;
        break;
      }
      const currentVerts = new Set(current.endpointVertexIds);
      const sharesVertex = next.endpointVertexIds.some((vertexId) => currentVerts.has(vertexId));
      if (!sharesVertex) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) {
      result.push({ faceId, reason: "non-contiguous edge chain in quotient boundary", edgeIds });
      continue;
    }
    if (!faceById.has(faceId)) {
      result.push({ faceId, reason: "missing quotient face for boundary record", edgeIds });
    }
  }

  return result.sort((a, b) => a.faceId.localeCompare(b.faceId));
};
