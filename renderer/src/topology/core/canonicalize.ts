import type {
  FundamentalDiagram,
  QuotientComplex,
  Realization3D,
  SubdivisionSummary,
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
  subdivision: SubdivisionSummary;
  realizations: Realization3D[];
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

const canonicalComplexFromQuotient = (
  source: FundamentalDiagram,
  input: FundamentalDiagramCanonicalizationInput
): CanonicalTopologyComplex => {
  const sourceVertexIds = new Set(source.vertices.map((cell) => cell.id));
  const sourceEdgeIds = new Set(source.edges.map((cell) => cell.id));
  const sourceFaceIds = new Set(source.faces.map((cell) => cell.id));
  const originalFaceByRefinedFace = new Map<string, string>();
  for (const [originalFaceId, refinedFaceIds] of Object.entries(input.subdivision.faceMap)) {
    refinedFaceIds.forEach((refinedFaceId) => originalFaceByRefinedFace.set(refinedFaceId, originalFaceId));
  }

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
    edges: input.quotient.edges.map((edge) => ({
      id: edge.id,
      name: edge.label || edge.id,
      endpoints: [...edge.endpointVertexIds] as [string, string],
      sourceRefs: sourceRefs(edge.sourceEdgeIds, 1, sourceEdgeIds),
    })),
    faces: input.quotient.faces.map((face) => {
      const attachment = input.quotient.attachmentMap[face.attachmentId];
      const refs: CanonicalSourceCellReference[] = [];
      for (const refinedFaceId of face.sourceFaceIds) {
        const originalFaceId = originalFaceByRefinedFace.get(refinedFaceId);
        if (originalFaceId && sourceFaceIds.has(originalFaceId)) {
          if (!refs.some((ref) => ref.stage === "source" && ref.cellId === originalFaceId)) {
            refs.push({ stage: "source", dimension: 2, cellId: originalFaceId });
          }
          if (refinedFaceId !== originalFaceId) {
            refs.push({ stage: "refinement", dimension: 2, cellId: refinedFaceId });
          }
        } else {
          refs.push(...sourceRefs([refinedFaceId], 2, sourceFaceIds));
        }
      }
      return {
        id: face.id,
        name: face.id,
        attachment: (attachment?.boundary ?? []).map((entry) => ({ ...entry })),
        boundaryWord: attachment?.boundaryWord ?? "",
        sourceRefs: refs,
      };
    }),
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
