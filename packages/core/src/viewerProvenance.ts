import { normalizeAnalysisResultEnvelope, type AnalysisResultEnvelope, type AnalysisResultStatus } from "./analysisResults";
import { canonicalJsonStringify, type DocumentIdentity } from "./documentIdentity";
import {
  createDocumentRelationIndex, evaluateDocumentRelationStatus, normalizeDocumentRelation,
  type DocumentRelation, type DocumentRelationIndex, type DocumentRelationSourceResolver,
  type DocumentRelationStatus, type DocumentRelationTarget,
} from "./documentRelations";
import { isScientificSourceGeneration, matchesScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";

export type ViewerProvenanceStatus = "current" | "stale" | "snapshot" | "unavailable" | "broken";
export type ViewerCommittedSelection = Readonly<{
  state: "committed";
  source: ScientificSourceGeneration;
  entityIds: readonly string[];
}>;
export type ViewerArtifactAvailability = Readonly<{ artifactId: string; available: boolean }>;
export type ViewerProvenanceEvidence = Readonly<{
  source: ScientificSourceGeneration;
  status: ViewerProvenanceStatus;
  lineageStatus: DocumentRelationStatus | null;
  authority: AnalysisResultStatus | null;
  operation: string | null;
  method: string | null;
  engine: string | null;
  precision: number | null;
  absoluteTolerance: number | null;
  relationIds: readonly string[];
  artifacts: readonly ViewerArtifactAvailability[];
  selectedEntityIds: readonly string[];
}>;

export const viewerSourceFromDocument = (document: { identity: DocumentIdentity }): ScientificSourceGeneration => ({
  documentId: document.identity.id,
  revision: document.identity.revision,
  structuralHash: document.identity.structuralHash,
  generation: document.identity.revision,
});

/** Hover and preview inputs are deliberately not representable as committed state. */
export const normalizeViewerCommittedSelection = (value: unknown): ViewerCommittedSelection | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.state !== "committed" || !isScientificSourceGeneration(candidate.source) ||
      !Array.isArray(candidate.entityIds) || candidate.entityIds.some((id) => typeof id !== "string" || !id || id.length > 256) ||
      new Set(candidate.entityIds).size !== candidate.entityIds.length ||
      Object.keys(candidate).some((key) => !["state", "source", "entityIds"].includes(key))) return null;
  return { state: "committed", source: { ...candidate.source }, entityIds: [...candidate.entityIds] as string[] };
};

export const createViewerProvenanceEvidence = (input: {
  source: ScientificSourceGeneration;
  current: ScientificSourceGeneration | null;
  resolveSource?: DocumentRelationSourceResolver;
  relations?: readonly DocumentRelation[];
  result?: AnalysisResultEnvelope | null;
  artifactAvailable?: (artifactId: string) => boolean;
  selection?: ViewerCommittedSelection | null;
  snapshot?: boolean;
}): ViewerProvenanceEvidence => {
  if (!isScientificSourceGeneration(input.source)) throw new TypeError("Invalid viewer source generation.");
  const relations = (input.relations ?? []).map((relation) => {
    const normalized = normalizeDocumentRelation(relation);
    if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
    return normalized.value;
  });
  const result = input.result == null ? null : normalizeAnalysisResultEnvelope(input.result);
  if (result && !result.ok) throw new TypeError(result.errors.join(" "));
  const sourceStatus: DocumentRelationStatus = !input.current ? "unavailable" :
    matchesScientificSourceGeneration(input.source, input.current) ? "current" : "stale";
  const resultSourceStatus: DocumentRelationStatus = result?.ok ? !input.current ? "unavailable" :
    matchesScientificSourceGeneration(result.value.provenance.source, input.current) ? "current" : "stale" : "current";
  const relationStatuses = relations.map((relation) => evaluateDocumentRelationStatus(relation,
    input.resolveSource ?? ((id) => id === input.source.documentId ? input.current : null)));
  const lineageStatus: DocumentRelationStatus | null = relationStatuses.includes("broken") ? "broken" :
    relationStatuses.includes("stale") ? "stale" : relationStatuses.includes("unavailable") ? "unavailable" :
      relations.length ? "current" : null;
  const artifacts = result?.ok ? result.value.artifacts.map((artifact) => ({
    artifactId: artifact.artifactId, available: input.artifactAvailable?.(artifact.artifactId) ?? false,
  })) : [];
  const status: ViewerProvenanceStatus = input.snapshot ? "snapshot" :
    lineageStatus === "broken" ? "broken" : sourceStatus === "stale" || resultSourceStatus === "stale" || lineageStatus === "stale" ? "stale" :
      sourceStatus === "unavailable" || resultSourceStatus === "unavailable" || lineageStatus === "unavailable" || artifacts.some((artifact) => !artifact.available) ? "unavailable" : "current";
  const provenance = result?.ok ? result.value.provenance : null;
  const selection = normalizeViewerCommittedSelection(input.selection);
  return {
    source: { ...input.source }, status, lineageStatus,
    authority: result?.ok ? result.value.status : null,
    operation: provenance?.operation.type ?? relations[0]?.operation ?? null,
    method: provenance?.operation.algorithm ?? null,
    engine: provenance ? `${provenance.engine.name} ${provenance.engine.version}` : relations[0]?.tool ? `${relations[0].tool.name} ${relations[0].tool.version}` : null,
    precision: provenance?.numericContext?.precision?.decimalDigits ?? null,
    absoluteTolerance: provenance?.numericContext?.tolerance?.absolute ?? null,
    relationIds: relations.map((relation) => relation.relationId), artifacts,
    selectedEntityIds: selection && matchesScientificSourceGeneration(selection.source, input.source) ? selection.entityIds : [],
  };
};

export type ViewerLineageStep = Readonly<{ relationId: string; operation: string; status: DocumentRelationStatus; source: ScientificSourceGeneration }>;
export type ViewerLineagePath = Readonly<{ target: DocumentRelationTarget; steps: readonly ViewerLineageStep[]; root: ScientificSourceGeneration | null }>;

/** Pure reverse traversal: target → relation/operation → exact source generation. */
export const traceViewerLineage = (
  index: DocumentRelationIndex,
  target: DocumentRelationTarget,
  resolveSource: DocumentRelationSourceResolver,
  maxDepth = 32,
): readonly ViewerLineagePath[] => {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 128) throw new RangeError("Invalid lineage depth.");
  const paths: ViewerLineagePath[] = [];
  const visit = (current: DocumentRelationTarget, steps: readonly ViewerLineageStep[], visited: ReadonlySet<string>): void => {
    const incoming = index.toTarget(current);
    if (!incoming.length || steps.length >= maxDepth) {
      paths.push({ target, steps, root: steps.at(-1)?.source ?? null });
      return;
    }
    for (const relation of incoming) for (const source of relation.sources) {
      const key = `${relation.relationId}:${source.documentId}:${source.revision}`;
      if (visited.has(key)) continue;
      const next = [...steps, { relationId: relation.relationId, operation: relation.operation,
        status: evaluateDocumentRelationStatus(relation, resolveSource), source }];
      visit({ type: "document", generation: source }, next, new Set([...visited, key]));
    }
  };
  visit(target, [], new Set());
  return paths;
};

export const viewerLineageIndex = (relations: readonly DocumentRelation[]): DocumentRelationIndex =>
  createDocumentRelationIndex(relations);

export const viewerTargetKey = (target: DocumentRelationTarget): string => canonicalJsonStringify(target);
