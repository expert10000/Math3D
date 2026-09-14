import type {
  FundamentalDiagram,
  QuotientComplex,
  Realization3D,
} from "../types";
import {
  TOPOLOGY_CANONICAL_SCHEMA_VERSION,
  TOPOLOGY_CANONICALIZER_VERSION,
  type CanonicalSourceCellReference,
  type CanonicalTopologyComplex,
  type TopologyObject,
  type TopologySource,
} from "./contracts";
import { hashTopologyValue } from "./provenance";

type FundamentalDiagramCanonicalizationInput = {
  quotient: QuotientComplex;
  realizations: Realization3D[];
  edgeClassBySource: Record<string, string>;
};
const cloneFundamentalDiagramSource = (diagram: FundamentalDiagram): FundamentalDiagram => ({
  ...diagram,
  vertices: diagram.vertices.map((vertex) => ({ ...vertex })),
  edges: diagram.edges.map((edge) => ({ ...edge })),
  faces: diagram.faces.map((face) => ({
    ...face,
    boundary: face.boundary.map((entry) => ({ ...entry })),
  })),
  edgeOrientations: { ...diagram.edgeOrientations },
  edgeLabels: { ...diagram.edgeLabels },
  edgePairings: Object.fromEntries(
    Object.entries(diagram.edgePairings).map(([edgeId, peers]) => [edgeId, [...peers]])
  ),
  vertexLabels: { ...diagram.vertexLabels },
  faceBoundaryWords: { ...diagram.faceBoundaryWords },
  metadata: diagram.metadata
    ? {
        ...diagram.metadata,
        annotations: diagram.metadata.annotations ? [...diagram.metadata.annotations] : undefined,
        styling: diagram.metadata.styling ? { ...diagram.metadata.styling } : undefined,
      }
    : undefined,
});

const sourceRefs = (
  ids: string[],
  dimension: 0 | 1 | 2,
  sourceIds: Set<string>
): CanonicalSourceCellReference[] =>
  ids.map((cellId) => ({
    stage: sourceIds.has(cellId) ? "source" : "refinement",
    dimension,
    cellId,
  }));

const boundaryWordSigns = (word: string): Array<1 | -1> =>
  word
    .replaceAll(",", " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => (/⁻¹$|\^\s*-\s*1$|\{\s*-\s*1\s*\}$/i.test(token) ? -1 : 1));

const canonicalComplexFromQuotient = (
  source: FundamentalDiagram,
  input: FundamentalDiagramCanonicalizationInput
): CanonicalTopologyComplex => {
  const sourceVertexIds = new Set(source.vertices.map((cell) => cell.id));
  const sourceEdgeIds = new Set(source.edges.map((cell) => cell.id));
  const quotientEdgeById = new Map(input.quotient.edges.map((edge) => [edge.id, edge]));
  const canonicalEdges = input.quotient.edges
    .filter((edge) => edge.sourceEdgeIds.some((sourceEdgeId) => sourceEdgeIds.has(sourceEdgeId)))
    .map((edge) => {
      const authoredSourceEdgeIds = edge.sourceEdgeIds.filter((sourceEdgeId) => sourceEdgeIds.has(sourceEdgeId));
      const representativeId = authoredSourceEdgeIds[0];
      const representativeOrientation = representativeId ? source.edgeOrientations[representativeId] ?? 1 : 1;
      const endpoints =
        representativeOrientation === 1
          ? ([...edge.endpointVertexIds] as [string, string])
          : ([edge.endpointVertexIds[1], edge.endpointVertexIds[0]] as [string, string]);
      return {
        id: edge.id,
        name: edge.label || edge.id,
        endpoints,
        sourceRefs: sourceRefs(authoredSourceEdgeIds, 1, sourceEdgeIds),
      };
    });
  const canonicalEdgeIds = new Set(canonicalEdges.map((edge) => edge.id));
  const canonicalFaces = source.faces.map((face, faceIndex) => {
    const word = source.faceBoundaryWords[face.id]?.trim() ?? "";
    const signs = boundaryWordSigns(word);
    const useWordSigns = signs.length === face.boundary.length;
    const attachment = face.boundary.map((occurrence, occurrenceIndex) => {
      const edgeId = input.edgeClassBySource[occurrence.edgeId] ?? occurrence.edgeId;
      const fallbackSign =
        occurrence.direction * (source.edgeOrientations[occurrence.edgeId] ?? 1) < 0 ? -1 : 1;
      return {
        edgeId,
        direction: (useWordSigns ? signs[occurrenceIndex] : fallbackSign) as 1 | -1,
      };
    });
    return {
      id: `qF${faceIndex}`,
      name: face.id,
      attachment,
      boundaryWord:
        word ||
        attachment.map((entry) => `${quotientEdgeById.get(entry.edgeId)?.label || entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`).join(" "),
      sourceRefs: [{ stage: "source" as const, dimension: 2 as const, cellId: face.id }],
    };
  });
  const vertexToEdges: Record<string, string[]> = Object.fromEntries(
    input.quotient.vertices.map((vertex) => [vertex.id, [] as string[]])
  );
  canonicalEdges.forEach((edge) => {
    edge.endpoints.forEach((vertexId) => {
      if (vertexToEdges[vertexId] && !vertexToEdges[vertexId].includes(edge.id)) {
        vertexToEdges[vertexId].push(edge.id);
      }
    });
  });
  const edgeToFaces: Record<string, string[]> = Object.fromEntries(
    canonicalEdges.map((edge) => [edge.id, [] as string[]])
  );
  canonicalFaces.forEach((face) =>
    face.attachment.forEach((occurrence) => {
      if (
        canonicalEdgeIds.has(occurrence.edgeId) &&
        edgeToFaces[occurrence.edgeId] &&
        !edgeToFaces[occurrence.edgeId].includes(face.id)
      ) {
        edgeToFaces[occurrence.edgeId].push(face.id);
      }
    })
  );

  return {
    schemaVersion: TOPOLOGY_CANONICAL_SCHEMA_VERSION,
    dimension: 2,
    id: input.quotient.id,
    name: input.quotient.name,
    vertices: input.quotient.vertices.map((vertex) => ({
      id: vertex.id,
      name: vertex.label || vertex.id,
      sourceRefs: sourceRefs(vertex.sourceVertexIds, 0, sourceVertexIds),
    })),
    edges: canonicalEdges,
    faces: canonicalFaces,
    incidences: {
      vertexToEdges,
      edgeToFaces,
    },
  };
};

export const createTopologyObjectFromFundamentalDiagram = (
  diagram: FundamentalDiagram,
  input: FundamentalDiagramCanonicalizationInput
): TopologyObject => {
  const sourceDiagram = cloneFundamentalDiagramSource(diagram);
  const source: TopologySource = { kind: "fundamental-diagram", value: sourceDiagram };
  const sourceHash = hashTopologyValue(source);
  const canonical = canonicalComplexFromQuotient(sourceDiagram, input);
  const canonicalHash = hashTopologyValue(canonical);

  return {
    id: diagram.id,
    name: diagram.name,
    source,
    canonical,
    provenance: {
      source: {
        kind: source.kind,
        revision: sourceHash,
        hash: sourceHash,
      },
      canonicalization: {
        method: "fundamental-diagram quotient canonicalization",
        algorithmVersion: TOPOLOGY_CANONICALIZER_VERSION,
        revision: `${TOPOLOGY_CANONICAL_SCHEMA_VERSION}:${canonicalHash}`,
        hash: canonicalHash,
      },
    },
    realizations: input.realizations.map((realization) => ({ ...realization })),
  };
};
