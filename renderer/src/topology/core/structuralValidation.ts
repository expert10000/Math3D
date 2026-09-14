import {
  type CanonicalSourceCellReference,
  type CanonicalTopologyComplex,
  type TopologyDiagnostic,
  type TopologyObject,
  type TopologyResult,
} from "./contracts";
import { createTopologyResult } from "./provenance";

export const TOPOLOGY_STRUCTURAL_VALIDATION_VERSION = "canonical-2-complex-validation@1" as const;

export type TopologyEdgeLinkSummary = {
  edgeId: string;
  attachmentOccurrences: number;
  kind: "isolated" | "boundary-candidate" | "interior-candidate" | "unsupported";
};

export type TopologyVertexLinkSummary = {
  vertexId: string;
  incidentEdgeEnds: number;
  faceCorners: number;
  components: number;
  maximumDegree: number;
  unsupportedIncidentEdges: string[];
  supportedForSurfaceEligibility: boolean;
};

export type TopologyStructuralValidationReport = {
  model: "canonical finite 2-complex";
  structurallyValid: boolean;
  canComputeCellularAlgebra: boolean;
  surfaceEligibilityCandidate: boolean;
  cellCounts: { vertices: number; edges: number; faces: number };
  expectedBoundaryOperatorDimensions: {
    boundary1: [number, number];
    boundary2: [number, number];
  };
  connectedComponents: number;
  boundaryCandidateEdgeIds: string[];
  unsupportedEdgeLinkIds: string[];
  unsupportedVertexLinkIds: string[];
  edgeLinks: TopologyEdgeLinkSummary[];
  vertexLinks: TopologyVertexLinkSummary[];
};

type CellDimension = 0 | 1 | 2;

const diagnostic = (
  code: string,
  severity: TopologyDiagnostic["severity"],
  message: string,
  cellRef?: { dimension: CellDimension; cellId: string }
): TopologyDiagnostic => ({ code, severity, message, ...(cellRef ? { cellRef } : {}) });

const duplicateIds = (ids: string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates].sort((left, right) => left.localeCompare(right));
};

const sameSet = (left: string[], right: string[]): boolean => {
  const a = [...new Set(left)].sort((x, y) => x.localeCompare(y));
  const b = [...new Set(right)].sort((x, y) => x.localeCompare(y));
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const sourceCellIds = (object: TopologyObject): Record<CellDimension, Set<string>> => {
  const source = object.source;
  if (source.kind === "fundamental-diagram") {
    return {
      0: new Set(source.value.vertices.map((cell) => cell.id)),
      1: new Set(source.value.edges.map((cell) => cell.id)),
      2: new Set(source.value.faces.map((cell) => cell.id)),
    };
  }
  if (source.kind === "cw-complex") {
    return {
      0: new Set(source.value.vertices.map((cell) => cell.id)),
      1: new Set(source.value.edges.map((cell) => cell.id)),
      2: new Set(source.value.faces.map((cell) => cell.id)),
    };
  }
  if (source.kind === "simplicial-complex") {
    return {
      0: new Set(source.value.vertexIds),
      1: new Set(source.value.edges.map((cell) => cell.id)),
      2: new Set(source.value.triangles.map((cell) => cell.id)),
    };
  }
  return {
    0: new Set(source.value.vertexIds),
    1: new Set(source.value.edges.map((cell) => cell.id)),
    2: new Set(source.value.faces.map((cell) => cell.id)),
  };
};

const validateSourceRefs = (
  refs: CanonicalSourceCellReference[],
  dimension: CellDimension,
  canonicalCellId: string,
  knownSourceIds: Record<CellDimension, Set<string>>,
  diagnostics: TopologyDiagnostic[]
): void => {
  if (refs.length === 0) {
    diagnostics.push(
      diagnostic(
        "source-map/missing",
        "error",
        `Canonical ${dimension}-cell '${canonicalCellId}' has no source or refinement reference.`,
        { dimension, cellId: canonicalCellId }
      )
    );
    return;
  }
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.stage}:${ref.dimension}:${ref.cellId}`;
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic(
          "source-map/duplicate-reference",
          "warning",
          `Canonical ${dimension}-cell '${canonicalCellId}' repeats source reference '${key}'.`,
          { dimension, cellId: canonicalCellId }
        )
      );
    }
    seen.add(key);
    if (ref.dimension !== dimension) {
      diagnostics.push(
        diagnostic(
          "source-map/dimension-mismatch",
          "error",
          `Canonical ${dimension}-cell '${canonicalCellId}' maps to a ${ref.dimension}-cell reference.`,
          { dimension, cellId: canonicalCellId }
        )
      );
    }
    if (!ref.cellId.trim()) {
      diagnostics.push(
        diagnostic("source-map/empty-id", "error", `Canonical cell '${canonicalCellId}' has an empty source reference.`, {
          dimension,
          cellId: canonicalCellId,
        })
      );
    } else if (ref.stage === "source" && !knownSourceIds[dimension].has(ref.cellId)) {
      diagnostics.push(
        diagnostic(
          "source-map/dangling-reference",
          "error",
          `Canonical ${dimension}-cell '${canonicalCellId}' maps to missing source cell '${ref.cellId}'.`,
          { dimension, cellId: canonicalCellId }
        )
      );
    }
  }
};

const connectedComponentCount = (complex: CanonicalTopologyComplex): number => {
  if (complex.vertices.length === 0) return 0;
  const adjacency = new Map(complex.vertices.map((vertex) => [vertex.id, new Set<string>()]));
  complex.edges.forEach((edge) => {
    adjacency.get(edge.endpoints[0])?.add(edge.endpoints[1]);
    adjacency.get(edge.endpoints[1])?.add(edge.endpoints[0]);
  });
  const visited = new Set<string>();
  let count = 0;
  for (const vertex of complex.vertices) {
    if (visited.has(vertex.id)) continue;
    count += 1;
    const stack = [vertex.id];
    visited.add(vertex.id);
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      adjacency.get(current)?.forEach((next) => {
        if (visited.has(next)) return;
        visited.add(next);
        stack.push(next);
      });
    }
  }
  return count;
};

export const validateCanonicalTopologyObject = (
  object: TopologyObject
): TopologyResult<TopologyStructuralValidationReport> => {
  const complex = object.canonical;
  const diagnostics: TopologyDiagnostic[] = [];
  const cells = [complex.vertices, complex.edges, complex.faces] as const;
  const dimensions = [0, 1, 2] as const;
  const knownSourceIds = sourceCellIds(object);

  dimensions.forEach((dimension, index) => {
    const dimensionCells = cells[index];
    duplicateIds(dimensionCells.map((cell) => cell.id)).forEach((cellId) =>
      diagnostics.push(
        diagnostic("cells/duplicate-id", "error", `Duplicate canonical ${dimension}-cell ID '${cellId}'.`, {
          dimension,
          cellId,
        })
      )
    );
    dimensionCells.forEach((cell) => {
      if (!cell.id.trim()) {
        diagnostics.push(diagnostic("cells/empty-id", "error", `Canonical ${dimension}-cell ID must not be empty.`));
      }
      validateSourceRefs(cell.sourceRefs, dimension, cell.id, knownSourceIds, diagnostics);
    });
  });

  const vertexIds = new Set(complex.vertices.map((vertex) => vertex.id));
  const edgeIds = new Set(complex.edges.map((edge) => edge.id));
  const faceIds = new Set(complex.faces.map((face) => face.id));
  const expectedVertexToEdges: Record<string, string[]> = Object.fromEntries(
    complex.vertices.map((vertex) => [vertex.id, [] as string[]])
  );
  const expectedEdgeToFaces: Record<string, string[]> = Object.fromEntries(
    complex.edges.map((edge) => [edge.id, [] as string[]])
  );
  const edgeOccurrenceCounts: Record<string, number> = Object.fromEntries(complex.edges.map((edge) => [edge.id, 0]));

  complex.edges.forEach((edge) => {
    edge.endpoints.forEach((vertexId) => {
      if (!vertexIds.has(vertexId)) {
        diagnostics.push(
          diagnostic(
            "edge/dangling-endpoint",
            "error",
            `Edge '${edge.id}' references missing endpoint vertex '${vertexId}'.`,
            { dimension: 1, cellId: edge.id }
          )
        );
      } else if (!expectedVertexToEdges[vertexId].includes(edge.id)) {
        expectedVertexToEdges[vertexId].push(edge.id);
      }
    });
  });

  complex.faces.forEach((face) => {
    if (face.attachment.length === 0) {
      diagnostics.push(
        diagnostic("attachment/empty", "error", `Face '${face.id}' has an empty attachment walk.`, {
          dimension: 2,
          cellId: face.id,
        })
      );
      return;
    }
    const orientedEndpoints: Array<[string, string] | null> = [];
    face.attachment.forEach((occurrence) => {
      if (occurrence.direction !== 1 && occurrence.direction !== -1) {
        diagnostics.push(
          diagnostic(
            "attachment/invalid-orientation",
            "error",
            `Face '${face.id}' uses invalid orientation on edge '${occurrence.edgeId}'.`,
            { dimension: 2, cellId: face.id }
          )
        );
      }
      const edge = complex.edges.find((candidate) => candidate.id === occurrence.edgeId);
      if (!edge) {
        diagnostics.push(
          diagnostic(
            "attachment/dangling-edge",
            "error",
            `Face '${face.id}' references missing edge '${occurrence.edgeId}'.`,
            { dimension: 2, cellId: face.id }
          )
        );
        orientedEndpoints.push(null);
        return;
      }
      edgeOccurrenceCounts[edge.id] += 1;
      if (!expectedEdgeToFaces[edge.id].includes(face.id)) expectedEdgeToFaces[edge.id].push(face.id);
      orientedEndpoints.push(
        occurrence.direction === 1 ? [...edge.endpoints] : [edge.endpoints[1], edge.endpoints[0]]
      );
    });
    for (let index = 0; index < orientedEndpoints.length; index += 1) {
      const current = orientedEndpoints[index];
      const next = orientedEndpoints[(index + 1) % orientedEndpoints.length];
      if (current && next && current[1] !== next[0]) {
        diagnostics.push(
          diagnostic(
            "attachment/non-contiguous",
            "error",
            `Face '${face.id}' attachment is not contiguous between occurrences ${index + 1} and ${(index + 1) % orientedEndpoints.length + 1}.`,
            { dimension: 2, cellId: face.id }
          )
        );
        break;
      }
    }
  });

  for (const vertex of complex.vertices) {
    const stored = complex.incidences.vertexToEdges[vertex.id] ?? [];
    const expected = expectedVertexToEdges[vertex.id] ?? [];
    if (!sameSet(stored, expected)) {
      diagnostics.push(
        diagnostic(
          "incidence/vertex-edge-mismatch",
          "error",
          `Stored incidence for vertex '${vertex.id}' does not match canonical edge endpoints.`,
          { dimension: 0, cellId: vertex.id }
        )
      );
    }
  }
  Object.keys(complex.incidences.vertexToEdges)
    .filter((vertexId) => !vertexIds.has(vertexId))
    .forEach((vertexId) =>
      diagnostics.push(
        diagnostic("incidence/dangling-vertex", "error", `Incidence table contains missing vertex '${vertexId}'.`, {
          dimension: 0,
          cellId: vertexId,
        })
      )
    );
  for (const edge of complex.edges) {
    const stored = complex.incidences.edgeToFaces[edge.id] ?? [];
    const expected = expectedEdgeToFaces[edge.id] ?? [];
    if (!sameSet(stored, expected)) {
      diagnostics.push(
        diagnostic(
          "incidence/edge-face-mismatch",
          "error",
          `Stored incidence for edge '${edge.id}' does not match canonical face attachments.`,
          { dimension: 1, cellId: edge.id }
        )
      );
    }
  }
  Object.entries(complex.incidences.edgeToFaces).forEach(([edgeId, attachedFaceIds]) => {
    if (!edgeIds.has(edgeId)) {
      diagnostics.push(
        diagnostic("incidence/dangling-edge", "error", `Incidence table contains missing edge '${edgeId}'.`, {
          dimension: 1,
          cellId: edgeId,
        })
      );
    }
    attachedFaceIds.forEach((faceId) => {
      if (!faceIds.has(faceId)) {
        diagnostics.push(
          diagnostic("incidence/dangling-face", "error", `Incidence table references missing face '${faceId}'.`, {
            dimension: 2,
            cellId: faceId,
          })
        );
      }
    });
  });

  const edgeLinks: TopologyEdgeLinkSummary[] = complex.edges.map((edge) => {
    const attachmentOccurrences = edgeOccurrenceCounts[edge.id] ?? 0;
    const kind =
      attachmentOccurrences === 0
        ? "isolated"
        : attachmentOccurrences === 1
          ? "boundary-candidate"
          : attachmentOccurrences === 2
            ? "interior-candidate"
            : "unsupported";
    if (kind === "unsupported") {
      diagnostics.push(
        diagnostic(
          "link/unsupported-edge",
          "warning",
          `Edge '${edge.id}' has ${attachmentOccurrences} attachment occurrences; its link is outside the supported surface model.`,
          { dimension: 1, cellId: edge.id }
        )
      );
    }
    return { edgeId: edge.id, attachmentOccurrences, kind };
  });
  const unsupportedEdgeLinkIds = edgeLinks
    .filter((entry) => entry.kind === "unsupported" || entry.kind === "isolated")
    .map((entry) => entry.edgeId);
  edgeLinks
    .filter((entry) => entry.kind === "isolated")
    .forEach((entry) =>
      diagnostics.push(
        diagnostic(
          "link/isolated-edge",
          "warning",
          `Edge '${entry.edgeId}' has no 2-cell attachment occurrence and is outside the supported surface model.`,
          { dimension: 1, cellId: entry.edgeId }
        )
      )
    );
  const edgeById = new Map(complex.edges.map((edge) => [edge.id, edge]));
  const linkNodesByVertex = new Map<string, string[]>();
  const linkAdjacency = new Map<string, Set<string>>();
  complex.vertices.forEach((vertex) => linkNodesByVertex.set(vertex.id, []));
  complex.edges.forEach((edge) => {
    edge.endpoints.forEach((vertexId, endpointIndex) => {
      if (!vertexIds.has(vertexId)) return;
      const nodeId = `${edge.id}:${endpointIndex}`;
      linkNodesByVertex.get(vertexId)?.push(nodeId);
      linkAdjacency.set(nodeId, new Set());
    });
  });
  const faceCornerCountByVertex = new Map(complex.vertices.map((vertex) => [vertex.id, 0]));
  complex.faces.forEach((face) => {
    const oriented = face.attachment.map((occurrence) => {
      const edge = edgeById.get(occurrence.edgeId);
      if (!edge) return null;
      const startIndex = occurrence.direction === 1 ? 0 : 1;
      const endIndex = occurrence.direction === 1 ? 1 : 0;
      return {
        startVertex: edge.endpoints[startIndex],
        endVertex: edge.endpoints[endIndex],
        startNode: `${edge.id}:${startIndex}`,
        endNode: `${edge.id}:${endIndex}`,
      };
    });
    for (let index = 0; index < oriented.length; index += 1) {
      const current = oriented[index];
      const next = oriented[(index + 1) % oriented.length];
      if (!current || !next || current.endVertex !== next.startVertex) continue;
      linkAdjacency.get(current.endNode)?.add(next.startNode);
      linkAdjacency.get(next.startNode)?.add(current.endNode);
      faceCornerCountByVertex.set(
        current.endVertex,
        (faceCornerCountByVertex.get(current.endVertex) ?? 0) + 1
      );
    }
  });
  const vertexLinks: TopologyVertexLinkSummary[] = complex.vertices.map((vertex) => {
    const incidentEdges = expectedVertexToEdges[vertex.id] ?? [];
    const nodes = linkNodesByVertex.get(vertex.id) ?? [];
    const visited = new Set<string>();
    let components = 0;
    nodes.forEach((nodeId) => {
      if (visited.has(nodeId)) return;
      components += 1;
      const stack = [nodeId];
      visited.add(nodeId);
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
        linkAdjacency.get(current)?.forEach((next) => {
          if (visited.has(next)) return;
          visited.add(next);
          stack.push(next);
        });
      }
    });
    const maximumDegree = nodes.reduce(
      (maximum, nodeId) => Math.max(maximum, linkAdjacency.get(nodeId)?.size ?? 0),
      0
    );
    const unsupportedIncidentEdges = incidentEdges.filter((edgeId) => unsupportedEdgeLinkIds.includes(edgeId));
    const supportedForSurfaceEligibility =
      unsupportedIncidentEdges.length === 0 &&
      (nodes.length === 0 || components === 1) &&
      maximumDegree <= 2;
    return {
      vertexId: vertex.id,
      incidentEdgeEnds: nodes.length,
      faceCorners: faceCornerCountByVertex.get(vertex.id) ?? 0,
      components,
      maximumDegree,
      unsupportedIncidentEdges,
      supportedForSurfaceEligibility,
    };
  });
  const unsupportedVertexLinkIds = vertexLinks
    .filter((entry) => !entry.supportedForSurfaceEligibility)
    .map((entry) => entry.vertexId);
  unsupportedVertexLinkIds.forEach((vertexId) =>
    diagnostics.push(
      diagnostic(
        "link/unsupported-vertex",
        "warning",
        `Vertex '${vertexId}' has a disconnected, branched, or unsupported incident link; full surface eligibility must be withheld.`,
        { dimension: 0, cellId: vertexId }
      )
    )
  );

  const errorCount = diagnostics.filter((entry) => entry.severity === "error").length;
  const boundaryCandidateEdgeIds = edgeLinks
    .filter((entry) => entry.kind === "boundary-candidate")
    .map((entry) => entry.edgeId);
  const connectedComponents = connectedComponentCount(complex);
  const report: TopologyStructuralValidationReport = {
    model: "canonical finite 2-complex",
    structurallyValid: errorCount === 0,
    canComputeCellularAlgebra: errorCount === 0,
    surfaceEligibilityCandidate:
      errorCount === 0 &&
      complex.vertices.length > 0 &&
      complex.faces.length > 0 &&
      connectedComponents === 1 &&
      unsupportedEdgeLinkIds.length === 0 &&
      unsupportedVertexLinkIds.length === 0,
    cellCounts: {
      vertices: complex.vertices.length,
      edges: complex.edges.length,
      faces: complex.faces.length,
    },
    expectedBoundaryOperatorDimensions: {
      boundary1: [complex.vertices.length, complex.edges.length],
      boundary2: [complex.edges.length, complex.faces.length],
    },
    connectedComponents,
    boundaryCandidateEdgeIds,
    unsupportedEdgeLinkIds,
    unsupportedVertexLinkIds,
    edgeLinks,
    vertexLinks,
  };

  return createTopologyResult({
    status: errorCount === 0 ? "certified-within-model" : "failed",
    value: report,
    method: "finite canonical 2-complex structural validation",
    assumptions: [
      "finite dimensions 0 through 2",
      "ordered edge endpoints define positive orientation",
      "face attachments are finite oriented edge words",
      "surface-link warnings do not invalidate general CW algebra",
    ],
    sourceRevision: object.provenance.source.revision,
    algorithmVersion: TOPOLOGY_STRUCTURAL_VALIDATION_VERSION,
    diagnostics,
  });
};
