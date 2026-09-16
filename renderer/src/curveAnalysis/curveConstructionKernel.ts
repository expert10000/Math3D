import {
  canonicalJsonStringify, createDocumentRelation, createSurfaceDocument,
  normalizeCurveDocument, normalizeDocumentRelation, normalizeSurfaceDocument, structuralHash,
  type CanonicalJsonValue, type CurveDocument, type DocumentRelation,
  type ScientificSourceGeneration, type SurfaceDocument,
} from "@math3d/core";
import type { CanonicalCurveExchange, CurveToSurfaceRequest, SurfaceConstructionKind } from "./curveInteroperability";
import { createCurveToSurfaceRequest } from "./curveInteroperability";
import { curveDocumentFromLegacyDefinition } from "./curveDocumentAdapter";

export type CurveConstructionRecord = Readonly<{
  version: 1;
  operationId: string;
  request: CurveToSurfaceRequest;
  sourceGenerations: readonly ScientificSourceGeneration[];
  sourceDocuments: readonly CurveDocument[];
  correspondence: readonly Readonly<{ kind: "exact-parameter" | "surface-chart" | "sample-index" | "unavailable"; sourceEntityIds: readonly string[]; sequentialSamples: boolean; explanation: string }> [];
  target: SurfaceDocument;
  relation: DocumentRelation;
  promoted: boolean;
}>;

const sourceGeneration = (document: CurveDocument): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation: document.identity.revision,
});

/** A construction is a replayable specification; rendering/evaluation remains a derived resource. */
export const createCurveConstructionRecord = (
  kind: SurfaceConstructionKind,
  exchanges: readonly CanonicalCurveExchange[],
  parameters: Record<string, CanonicalJsonValue> = {},
): CurveConstructionRecord => {
  const request = createCurveToSurfaceRequest(kind, exchanges, parameters);
  const sourceDocuments = exchanges.map((entry) => curveDocumentFromLegacyDefinition(entry.definition));
  const sourceGenerations = sourceDocuments.map(sourceGeneration);
  if (new Set(sourceGenerations.map((source) => source.documentId)).size !== sourceGenerations.length) throw new TypeError("Curve construction sources must be distinct documents.");
  const correspondence = exchanges.map((entry) => ({
    kind: entry.correspondence.kind,
    sourceEntityIds: [...entry.correspondence.sourceEntityIds],
    sequentialSamples: !!entry.correspondence.sampleIndices && Array.from(entry.correspondence.sampleIndices).every((index, position) => index === position),
    explanation: entry.correspondence.explanation,
  }));
  const operationId = `curve-construction:${structuralHash({ kind, sourceGenerations, parameters }).slice(7, 47)}`;
  const target = createSurfaceDocument({
    stableKey: { operationId },
    source: {
      representation: "constructed",
      domain: { kind: "curve-construction", u: [0, 1], v: [0, 1] },
      units: { length: exchanges[0].definition.units.position },
      orientation: { convention: "source-order" },
      definition: { familyId: kind, sourceIds: sourceGenerations.map((source) => source.documentId) },
      parameters: { ...parameters, sourceGenerations: sourceGenerations as unknown as CanonicalJsonValue },
      branchPolicy: null,
    },
    metadata: { title: `${kind} from ${exchanges.map((entry) => entry.definition.identity.label).join(" + ")}` },
  });
  const relation = createDocumentRelation({
    kind: "generated-by", sources: sourceGenerations, sourceOrder: "ordered",
    target: { type: "document", generation: {
      documentId: target.identity.id, revision: target.identity.revision,
      structuralHash: target.identity.structuralHash, generation: target.identity.revision,
    } },
    operation: `curve.construct.${kind}`,
    parameters: { ...parameters, requestId: request.requestId, exchangeIds: request.inputs.map((input) => input.exchangeId) },
    producer: { commandId: operationId },
    tool: { name: "Math3D Curve construction", version: "1" },
  });
  return { version: 1, operationId, request, sourceGenerations, sourceDocuments, correspondence, target, relation, promoted: false };
};

export const locateCurveConstructionSource = (record: CurveConstructionRecord, inputIndex: number, normalizedParameter: number) => {
  const source = record.sourceDocuments[inputIndex];
  const correspondence = record.correspondence[inputIndex];
  if (!source || !correspondence || !Number.isFinite(normalizedParameter)) throw new TypeError("Invalid Curve construction location.");
  const u = Math.min(1, Math.max(0, normalizedParameter));
  const domain = source.source.domain;
  const sampleCount = source.source.definition.points?.length ?? source.source.definition.pointCount ?? 0;
  return {
    source: record.sourceGenerations[inputIndex],
    state: correspondence.kind === "exact-parameter" ? "mapped" as const : correspondence.sequentialSamples && sampleCount > 0 ? "mapped" as const : "partial" as const,
    sourceEntityId: correspondence.sourceEntityIds[0] ?? null,
    sourceParameter: correspondence.kind === "exact-parameter" ? domain.min + u * (domain.max - domain.min) : null,
    sampleIndex: correspondence.sequentialSamples && sampleCount > 0 ? Math.round(u * (sampleCount - 1)) : null,
    explanation: correspondence.explanation,
  };
};

/** Promotion freezes the target specification; later source edits cannot mutate it. */
export const promoteCurveConstruction = (record: CurveConstructionRecord): CurveConstructionRecord =>
  ({ ...record, promoted: true });

export const serializeCurveConstruction = (record: CurveConstructionRecord): string => canonicalJsonStringify(record);
export const parseCurveConstruction = (serialized: string): CurveConstructionRecord => {
  const value = JSON.parse(serialized) as CurveConstructionRecord;
  if (value?.version !== 1 || !value.operationId || !Array.isArray(value.sourceDocuments) ||
      !Array.isArray(value.sourceGenerations) || value.sourceDocuments.length !== value.sourceGenerations.length ||
      !value.request || !Array.isArray(value.request.inputs) || value.request.inputs.length !== value.sourceDocuments.length ||
      !Array.isArray(value.correspondence) || value.correspondence.length !== value.sourceDocuments.length ||
      typeof value.promoted !== "boolean") throw new TypeError("Invalid Curve construction record.");
  if (value.sourceDocuments.some((document) => !normalizeCurveDocument(document).ok)) throw new TypeError("Invalid Curve construction source document.");
  if (value.correspondence.some((entry) => !entry || !["exact-parameter", "surface-chart", "sample-index", "unavailable"].includes(entry.kind) ||
      !Array.isArray(entry.sourceEntityIds) || entry.sourceEntityIds.some((id: unknown) => typeof id !== "string") ||
      typeof entry.sequentialSamples !== "boolean" || typeof entry.explanation !== "string")) throw new TypeError("Invalid Curve construction correspondence.");
  const target = normalizeSurfaceDocument(value.target);
  const relation = normalizeDocumentRelation(value.relation);
  if (!target.ok || !relation.ok) throw new TypeError("Invalid Curve construction target or lineage.");
  const sources = value.sourceDocuments.map(sourceGeneration);
  if (canonicalJsonStringify(sources) !== canonicalJsonStringify(value.sourceGenerations) ||
      canonicalJsonStringify(sources) !== canonicalJsonStringify(relation.value.sources) ||
      relation.value.target.type !== "document" || relation.value.target.generation.documentId !== target.value.identity.id ||
      relation.value.target.generation.structuralHash !== target.value.identity.structuralHash ||
      relation.value.operation !== `curve.construct.${value.request.kind}` ||
      value.request.inputs.some((input, index) => input.curveId !== value.sourceDocuments[index].metadata.legacyCurveId) ||
      relation.value.producer?.commandId !== value.operationId) throw new TypeError("Curve construction provenance does not match its documents.");
  return value;
};
