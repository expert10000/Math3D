import {
  FINITE_2D_CANONICALIZER_VERSION,
  createCanonicalFinite2DResult,
  normalizeTopologyDocument,
  type CanonicalFinite2DOutcome,
  type CanonicalFinite2DSourceReference,
  type ScientificSourceGeneration,
  type TopologyDocument,
} from "@math3d/core";
import { createTopologyObjectFromFundamentalDiagram } from "./core";
import { deriveFundamentalDiagramQuotient } from "./quotientBuilder";
import type { FundamentalDiagram } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isFundamentalDiagram = (value: unknown): value is FundamentalDiagram =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  Array.isArray(value.vertices) &&
  Array.isArray(value.edges) &&
  Array.isArray(value.faces) &&
  isRecord(value.edgeOrientations) &&
  isRecord(value.edgeLabels) &&
  isRecord(value.edgePairings) &&
  isRecord(value.vertexLabels) &&
  isRecord(value.faceBoundaryWords);

const sourceGenerationFor = (document: TopologyDocument, generation: number): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation,
});

const sourceRef = (
  sourceId: string,
  stage: "source" | "refinement",
  dimension: 0 | 1 | 2,
  cellId: string,
  occurrence?: number
): CanonicalFinite2DSourceReference => ({
  sourceId,
  stage,
  dimension,
  cellId,
  ...(occurrence === undefined ? {} : { occurrence }),
});

/**
 * Compatibility canonicalizer for the released editable diagram model.
 * It consumes only source/quotient data and never builds or reads an R3 realization.
 */
export const canonicalizeFundamentalDiagramTopologyDocument = (
  value: TopologyDocument,
  generation = 1
): CanonicalFinite2DOutcome => {
  const normalized = normalizeTopologyDocument(value);
  if (!normalized.ok) {
    return {
      status: "invalid-source",
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: normalized.errors.map((message) => ({ code: "canonicalization/invalid-document", message })),
    };
  }
  const document = normalized.value;
  const fallbackGeneration = Number.isSafeInteger(generation) && generation > 0 ? generation : 1;
  const source = sourceGenerationFor(document, fallbackGeneration);
  if (!Number.isSafeInteger(generation) || generation < 1) {
    return {
      status: "invalid-source",
      source,
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: [{ code: "canonicalization/invalid-generation", message: "Generation must be a positive safe integer." }],
    };
  }
  if (document.source.kind !== "fundamental-diagram") {
    return {
      status: "unsupported",
      source,
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: [{
        code: "canonicalization/unsupported-source-kind",
        message: `Expected a fundamental-diagram source, received '${document.source.kind}'.`,
      }],
    };
  }
  if (!isFundamentalDiagram(document.source.model)) {
    return {
      status: "invalid-source",
      source,
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: [{
        code: "canonicalization/invalid-fundamental-diagram",
        message: "The authoritative source does not satisfy the released fundamental-diagram contract.",
      }],
    };
  }

  try {
    const diagram = document.source.model;
    const quotient = deriveFundamentalDiagramQuotient(diagram);
    const legacyCanonical = createTopologyObjectFromFundamentalDiagram(diagram, {
      quotient: quotient.quotient,
      realizations: [],
      edgeClassBySource: quotient.edgeClassBySource,
    }).canonical;
    const sourceId = document.source.sourceId;
    const sourceFaceById = new Map(diagram.faces.map((face) => [face.id, face]));
    const legacyEdgeById = new Map(legacyCanonical.edges.map((edge) => [edge.id, edge]));

    return createCanonicalFinite2DResult({
      document,
      generation,
      method: "fundamental diagram quotient adapter",
      name: legacyCanonical.name,
      vertices: legacyCanonical.vertices.map((vertex) => ({
        id: vertex.id,
        name: vertex.name,
        sourceRefs: vertex.sourceRefs.map((reference) =>
          sourceRef(sourceId, reference.stage, 0, reference.cellId)
        ),
      })),
      edges: legacyCanonical.edges.map((edge) => ({
        id: edge.id,
        name: edge.name,
        endpoints: edge.endpoints,
        sourceRefs: edge.sourceRefs.map((reference) =>
          sourceRef(sourceId, reference.stage, 1, reference.cellId)
        ),
      })),
      faces: legacyCanonical.faces.map((face) => {
        const sourceFaceId = face.sourceRefs.find((reference) =>
          reference.stage === "source" && reference.dimension === 2
        )?.cellId;
        const sourceFace = sourceFaceId ? sourceFaceById.get(sourceFaceId) : undefined;
        return {
          id: face.id,
          name: face.name,
          sourceRefs: face.sourceRefs.map((reference) =>
            sourceRef(sourceId, reference.stage, 2, reference.cellId)
          ),
          attachment: face.attachment.map((token, occurrence) => {
            const diagramToken = sourceFace?.boundary[occurrence];
            const fallback = legacyEdgeById.get(token.edgeId)?.sourceRefs[0];
            const cellId = diagramToken?.edgeId ?? fallback?.cellId;
            if (!cellId) {
              throw new TypeError(`Canonical attachment '${face.id}[${occurrence}]' has no source edge mapping.`);
            }
            return {
              edgeId: token.edgeId,
              direction: token.direction,
              sourceRef: sourceRef(sourceId, diagramToken ? "source" : fallback?.stage ?? "refinement", 1, cellId, occurrence),
            };
          }),
        };
      }),
    });
  } catch (error) {
    return {
      status: "invalid-source",
      source,
      algorithmVersion: FINITE_2D_CANONICALIZER_VERSION,
      diagnostics: [{
        code: "canonicalization/fundamental-diagram-failed",
        message: error instanceof Error ? error.message : "Fundamental-diagram canonicalization failed.",
      }],
    };
  }
};
