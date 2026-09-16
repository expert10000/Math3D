import { ANALYSIS_ARTIFACT_KINDS, normalizeAnalysisResultEnvelope, type AnalysisArtifactHandle, type AnalysisResultEnvelope } from "./analysisResults";
import { canonicalJsonStringify, isDocumentIdentity, type CanonicalJsonValue, type DocumentIdentity } from "./documentIdentity";
import { createDocumentRelationIndex, normalizeDocumentRelation, type DocumentRelation } from "./documentRelations";
import { normalizeGeometryDocument, type GeometryDocument } from "./geometryDocument";
import { normalizeMeshDocument, type MeshDocument } from "./meshDocument";
import { normalizeSurfaceDocument, type SurfaceDocument } from "./surfaceDocument";
import { normalizeCurveDocument, type CurveDocument } from "./curveDocument";
import { normalizeVolumeDocument, type VolumeDocument } from "./volumeDocument";
import { normalizeTopologyDocument, type TopologyDocument } from "./topologyDocument";
import { normalizeComplexAnalysisDocument, type ComplexAnalysisDocument } from "./complexAnalysisDocument";
import { normalizeViewerCommittedSelection, viewerSourceFromDocument, type ViewerCommittedSelection } from "./viewerProvenance";
import { canonicalJsonByteLength, matchesScientificSourceGeneration, type ScientificSourceGeneration } from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const MIXED_WORKSPACE_FORMAT = "math3d.mixed-workspace" as const;
export const MIXED_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const MAX_MIXED_WORKSPACE_BYTES = 16 * 1024 * 1024;
export const MAX_MIXED_WORKSPACE_REPLAY_BYTES = 256 * 1024;
export const KERNEL_WORKSPACE_MODULES = ["geometry", "mesh", "surface", "curve", "volume", "topology", "complex"] as const;
export type KernelWorkspaceModule = typeof KERNEL_WORKSPACE_MODULES[number];
export type KernelWorkspaceDocument = GeometryDocument | MeshDocument | SurfaceDocument | CurveDocument | VolumeDocument | TopologyDocument | ComplexAnalysisDocument;
export type MixedWorkspaceReplay = Readonly<{ format: string; payload: CanonicalJsonValue }>;
export type MixedWorkspaceEntry = Readonly<{
  module: KernelWorkspaceModule;
  checkpoint: KernelWorkspaceDocument;
  expected: DocumentIdentity;
  replay: MixedWorkspaceReplay | null;
}>;
export type MixedWorkspaceArtifact = Readonly<{
  handle: AnalysisArtifactHandle;
  contentHash: string | null;
  byteLength: number | null;
}>;
export type MixedConstructionSource = Readonly<{
  kind: "scratch" | "workbook" | "scene-script";
  source: CanonicalJsonValue;
  normalizedSceneScript: CanonicalJsonValue;
}>;
export type MixedWorkspaceDocument = Readonly<{
  format: typeof MIXED_WORKSPACE_FORMAT;
  schemaVersion: typeof MIXED_WORKSPACE_SCHEMA_VERSION;
  entries: readonly MixedWorkspaceEntry[];
  activeDocumentIds: readonly string[];
  results: readonly AnalysisResultEnvelope[];
  artifacts: readonly MixedWorkspaceArtifact[];
  relations: readonly DocumentRelation[];
  committedSelection: ViewerCommittedSelection | null;
  constructions: readonly MixedConstructionSource[];
}>;
export type MixedWorkspaceReplayAdapter = (entry: MixedWorkspaceEntry) => KernelWorkspaceDocument;
export type MixedWorkspaceReplayAdapters = Partial<Record<KernelWorkspaceModule, MixedWorkspaceReplayAdapter>>;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every((key) => keys.includes(key));
const jsonClone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;
const moduleSet = new Set<string>(KERNEL_WORKSPACE_MODULES);

const normalizeModuleDocument = (module: KernelWorkspaceModule, value: unknown): ValidationResult<KernelWorkspaceDocument> => {
  switch (module) {
    case "geometry": return normalizeGeometryDocument(value);
    case "mesh": return normalizeMeshDocument(value);
    case "surface": return normalizeSurfaceDocument(value);
    case "curve": return normalizeCurveDocument(value);
    case "volume": return normalizeVolumeDocument(value);
    case "topology": return normalizeTopologyDocument(value);
    case "complex": return normalizeComplexAnalysisDocument(value);
  }
};
const entryKey = (entry: MixedWorkspaceEntry): string => `${entry.module}:${entry.expected.id}`;
const identityEquals = (left: DocumentIdentity, right: DocumentIdentity): boolean =>
  left.id === right.id && left.revision === right.revision && left.structuralHash === right.structuralHash;

export const normalizeMixedWorkspaceDocument = (value: unknown): ValidationResult<MixedWorkspaceDocument> => {
  const errors: string[] = [];
  if (!record(value) || !exact(value, ["format", "schemaVersion", "entries", "activeDocumentIds", "results", "artifacts", "relations", "committedSelection", "constructions"]) ||
      value.format !== MIXED_WORKSPACE_FORMAT || value.schemaVersion !== MIXED_WORKSPACE_SCHEMA_VERSION) return { ok: false, errors: ["Invalid mixed workspace envelope."] };
  if (!Array.isArray(value.entries) || value.entries.length > 512) errors.push("Invalid mixed workspace entries.");
  const entries: MixedWorkspaceEntry[] = [];
  for (const candidate of Array.isArray(value.entries) && value.entries.length <= 512 ? value.entries : []) {
    if (!record(candidate) || !exact(candidate, ["module", "checkpoint", "expected", "replay"]) || !moduleSet.has(String(candidate.module)) || !isDocumentIdentity(candidate.expected)) {
      errors.push("Invalid mixed workspace entry."); continue;
    }
    const module = candidate.module as KernelWorkspaceModule;
    const normalized = normalizeModuleDocument(module, candidate.checkpoint);
    if (!normalized.ok) { errors.push(...normalized.errors); continue; }
    const replay = candidate.replay;
    try {
      if (replay !== null && (!record(replay) || !exact(replay, ["format", "payload"]) || typeof replay.format !== "string" || !replay.format ||
        canonicalJsonByteLength(replay.payload) > MAX_MIXED_WORKSPACE_REPLAY_BYTES)) { errors.push("Invalid or oversized module replay log."); continue; }
    } catch { errors.push("Invalid module replay log."); continue; }
    if (normalized.value.identity.id !== candidate.expected.id || normalized.value.identity.revision > candidate.expected.revision ||
        (replay === null && !identityEquals(normalized.value.identity, candidate.expected))) { errors.push("Module checkpoint and expected identity disagree."); continue; }
    entries.push({ module, checkpoint: normalized.value, expected: candidate.expected,
      replay: replay as MixedWorkspaceReplay | null });
  }
  if (new Set(entries.map(entryKey)).size !== entries.length) errors.push("Duplicate module document entry.");
  const expectedById = new Map<string, DocumentIdentity>(entries.map((entry) => [entry.expected.id, entry.expected]));
  if (expectedById.size !== entries.length) errors.push("Document IDs must be unique across modules.");
  if (!Array.isArray(value.activeDocumentIds) || value.activeDocumentIds.some((id: unknown) => typeof id !== "string" || !expectedById.has(id)) ||
      new Set(value.activeDocumentIds).size !== value.activeDocumentIds.length) errors.push("Invalid active document references.");
  const results: AnalysisResultEnvelope[] = [];
  if (!Array.isArray(value.results) || value.results.length > 4096) errors.push("Invalid result records.");
  else for (const result of value.results) {
    const normalized = normalizeAnalysisResultEnvelope(result);
    if (!normalized.ok) errors.push(...normalized.errors);
    else { results.push(normalized.value); if (!expectedById.has(normalized.value.provenance.source.documentId)) errors.push("Result source is outside the workspace."); }
  }
  if (new Set(results.map((result) => result.resultId)).size !== results.length) errors.push("Duplicate result IDs.");
  const artifacts: MixedWorkspaceArtifact[] = [];
  if (!Array.isArray(value.artifacts) || value.artifacts.length > 8192) errors.push("Invalid artifact references.");
  else for (const artifact of value.artifacts) {
    if (!record(artifact) || !exact(artifact, ["handle", "contentHash", "byteLength"]) || !record(artifact.handle) ||
        !exact(artifact.handle, ["artifactId", "kind", "role"]) || typeof artifact.handle.artifactId !== "string" || !artifact.handle.artifactId ||
        typeof artifact.handle.role !== "string" || !artifact.handle.role || !ANALYSIS_ARTIFACT_KINDS.includes(artifact.handle.kind as never) ||
        !(artifact.contentHash === null || typeof artifact.contentHash === "string" && /^(?:sha256:[0-9a-f]{64}|fnv1a:[0-9a-f]{8})$/.test(artifact.contentHash)) ||
        !(artifact.byteLength === null || Number.isSafeInteger(artifact.byteLength) && Number(artifact.byteLength) >= 0)) errors.push("Invalid artifact reference.");
    else artifacts.push(artifact as MixedWorkspaceArtifact);
  }
  if (new Set(artifacts.map((artifact) => artifact.handle.artifactId)).size !== artifacts.length) errors.push("Duplicate artifact IDs.");
  const artifactIds = new Set(artifacts.map((artifact) => artifact.handle.artifactId));
  const artifactById = new Map(artifacts.map((artifact) => [artifact.handle.artifactId, artifact]));
  for (const result of results) for (const handle of result.artifacts) {
    if (!artifactIds.has(handle.artifactId)) errors.push(`Result ${result.resultId} references an unknown artifact.`);
    else {
      const persisted = artifactById.get(handle.artifactId)!;
      if (persisted.handle.kind !== handle.kind || persisted.handle.role !== handle.role) errors.push(`Result ${result.resultId} artifact handle disagrees with its manifest.`);
    }
  }
  const relations: DocumentRelation[] = [];
  if (!Array.isArray(value.relations) || value.relations.length > 8192) errors.push("Invalid lineage relations.");
  else for (const relation of value.relations) {
    const normalized = normalizeDocumentRelation(relation);
    if (!normalized.ok) errors.push(...normalized.errors);
    else relations.push(normalized.value);
  }
  try { createDocumentRelationIndex(relations); } catch (error) { errors.push(String((error as Error).message ?? error)); }
  const selection = value.committedSelection === null ? null : normalizeViewerCommittedSelection(value.committedSelection);
  if (value.committedSelection !== null && !selection) errors.push("Only committed selections may be saved.");
  if (selection && !expectedById.has(selection.source.documentId)) errors.push("Selection source is outside the workspace.");
  if (selection) {
    const expected = expectedById.get(selection.source.documentId);
    if (expected && !matchesScientificSourceGeneration(selection.source, viewerSourceFromDocument({ identity: expected })))
      errors.push("Committed selection belongs to a stale document generation.");
  }
  const constructions: MixedConstructionSource[] = [];
  if (!Array.isArray(value.constructions) || value.constructions.length > 256) errors.push("Invalid construction sources.");
  else for (const construction of value.constructions) {
    if (!record(construction) || !exact(construction, ["kind", "source", "normalizedSceneScript"]) ||
        !["scratch", "workbook", "scene-script"].includes(String(construction.kind))) errors.push("Invalid construction source.");
    else constructions.push(construction as MixedConstructionSource);
  }
  try { if (canonicalJsonByteLength(value) > MAX_MIXED_WORKSPACE_BYTES) errors.push("Mixed workspace exceeds the compact format limit."); }
  catch (error) { errors.push(String((error as Error).message ?? error)); }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: jsonClone({ ...value, entries, results, artifacts, relations, committedSelection: selection, constructions }) as unknown as MixedWorkspaceDocument };
};

export const createMixedWorkspaceDocument = (input: Omit<MixedWorkspaceDocument, "format" | "schemaVersion">): MixedWorkspaceDocument => {
  const normalized = normalizeMixedWorkspaceDocument({ format: MIXED_WORKSPACE_FORMAT, schemaVersion: MIXED_WORKSPACE_SCHEMA_VERSION, ...input });
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
export const serializeMixedWorkspaceDocument = (document: MixedWorkspaceDocument): string => canonicalJsonStringify(document);
export const parseMixedWorkspaceDocument = (text: string): MixedWorkspaceDocument => {
  if (new TextEncoder().encode(text).byteLength > MAX_MIXED_WORKSPACE_BYTES) throw new TypeError("Mixed workspace exceeds the compact format limit.");
  const normalized = normalizeMixedWorkspaceDocument(JSON.parse(text));
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
export const replayMixedWorkspaceDocument = (document: MixedWorkspaceDocument, adapters: MixedWorkspaceReplayAdapters = {}): ReadonlyMap<string, KernelWorkspaceDocument> => {
  const output = new Map<string, KernelWorkspaceDocument>();
  for (const entry of document.entries) {
    const restored = entry.replay ? adapters[entry.module]?.(entry) : entry.checkpoint;
    if (!restored) throw new TypeError(`No ${entry.module} replay adapter for ${entry.expected.id}.`);
    const normalized = normalizeModuleDocument(entry.module, restored);
    if (!normalized.ok || !identityEquals(restored.identity, entry.expected)) throw new TypeError(`Replay diverged for ${entry.expected.id}.`);
    output.set(entry.expected.id, normalized.value);
  }
  return output;
};
export const inspectMixedWorkspaceAvailability = (document: MixedWorkspaceDocument, artifactAvailable: (artifact: MixedWorkspaceArtifact) => boolean) => {
  const available = new Set(document.artifacts.filter(artifactAvailable).map((artifact) => artifact.handle.artifactId));
  const missingArtifactIds = document.artifacts.filter((artifact) => !available.has(artifact.handle.artifactId)).map((artifact) => artifact.handle.artifactId);
  const unavailableResultIds = document.results.filter((result) => result.artifacts.some((artifact) => !available.has(artifact.artifactId))).map((result) => result.resultId);
  const sourceById = new Map(document.entries.map((entry) => [entry.expected.id, viewerSourceFromDocument({ identity: entry.expected })]));
  const staleRelationIds = document.relations.filter((relation) => relation.sources.some((source: ScientificSourceGeneration) => {
    const current = sourceById.get(source.documentId);
    return current && !matchesScientificSourceGeneration(source, current);
  })).map((relation) => relation.relationId);
  return { missingArtifactIds, unavailableResultIds, staleRelationIds };
};
