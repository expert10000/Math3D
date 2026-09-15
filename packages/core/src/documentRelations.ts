import { ANALYSIS_ARTIFACT_KINDS, type AnalysisArtifactKind } from "./analysisResults";
import { immutableCanonicalJsonClone } from "./commands";
import {
  canonicalJsonStringify,
  structuralHash,
  type CanonicalJsonValue,
  type StableDocumentId,
} from "./documentIdentity";
import {
  canonicalJsonByteLength,
  isScientificSourceGeneration,
  matchesScientificSourceGeneration,
  type ScientificSourceGeneration,
} from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const DOCUMENT_RELATION_SCHEMA_VERSION = 1 as const;
export const MAX_DOCUMENT_RELATION_BYTES = 32 * 1024;
export const MAX_DOCUMENT_RELATION_PARAMETERS_BYTES = 8 * 1024;
export const MAX_DOCUMENT_RELATION_SOURCES = 16;

export const DOCUMENT_RELATION_KINDS = [
  "derived-from",
  "generated-by",
  "snapshot-of",
  "analysis-of",
  "realization-of",
  "promoted-from",
] as const;

export type DocumentRelationKind = (typeof DOCUMENT_RELATION_KINDS)[number];

export const DOCUMENT_RELATION_STATUSES = [
  "current",
  "stale",
  "broken",
  "unavailable",
] as const;

export type DocumentRelationStatus = (typeof DOCUMENT_RELATION_STATUSES)[number];
export type DocumentRelationId = `math3d-relation:${string}`;
export type DocumentRelationSourceOrder = "ordered" | "unordered";

export type RelationDocumentTarget = Readonly<{
  type: "document";
  generation: ScientificSourceGeneration;
}>;

export type RelationResultTarget = Readonly<{
  type: "result";
  resultId: string;
  resultType: string;
}>;

export type RelationArtifactTarget = Readonly<{
  type: "artifact";
  artifactId: string;
  artifactKind: AnalysisArtifactKind;
  role: string;
}>;

export type DocumentRelationTarget =
  | RelationDocumentTarget
  | RelationResultTarget
  | RelationArtifactTarget;

export type DocumentRelationProducer = Readonly<{
  commandId?: string;
  jobId?: string;
  resultIds?: readonly string[];
}>;

export type DocumentRelationTool = Readonly<{
  name: string;
  version: string;
}>;

export type CreateDocumentRelationInput = Readonly<{
  kind: DocumentRelationKind;
  sources: readonly ScientificSourceGeneration[];
  sourceOrder: DocumentRelationSourceOrder;
  target: DocumentRelationTarget;
  operation: string;
  parameters: CanonicalJsonValue;
  producer?: DocumentRelationProducer;
  tool?: DocumentRelationTool;
  status?: DocumentRelationStatus;
}>;

export type DocumentRelation = Readonly<{
  schemaVersion: typeof DOCUMENT_RELATION_SCHEMA_VERSION;
  relationId: DocumentRelationId;
  kind: DocumentRelationKind;
  sources: readonly ScientificSourceGeneration[];
  sourceOrder: DocumentRelationSourceOrder;
  target: DocumentRelationTarget;
  operation: string;
  parameters: CanonicalJsonValue;
  producer?: DocumentRelationProducer;
  tool?: DocumentRelationTool;
  status: DocumentRelationStatus;
}>;

export type DocumentRelationIndex = Readonly<{
  relations: readonly DocumentRelation[];
  get: (relationId: DocumentRelationId) => DocumentRelation | null;
  fromSource: (source: ScientificSourceGeneration | StableDocumentId) => readonly DocumentRelation[];
  toTarget: (target: DocumentRelationTarget) => readonly DocumentRelation[];
  parentsOf: (target: DocumentRelationTarget) => readonly ScientificSourceGeneration[];
  childrenOf: (source: ScientificSourceGeneration | StableDocumentId) => readonly DocumentRelationTarget[];
}>;

export type DocumentRelationSourceResolver = (
  documentId: StableDocumentId
) => ScientificSourceGeneration | null;

const RELATION_ID = /^math3d-relation:[0-9a-f]{64}$/;
const OPERATION = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const SAFE_REFERENCE = /^[^\u0000-\u001f\u007f]{1,256}$/;
const RELATION_FIELDS = new Set([
  "schemaVersion",
  "relationId",
  "kind",
  "sources",
  "sourceOrder",
  "target",
  "operation",
  "parameters",
  "producer",
  "tool",
  "status",
]);
const DOCUMENT_TARGET_FIELDS = new Set(["type", "generation"]);
const RESULT_TARGET_FIELDS = new Set(["type", "resultId", "resultType"]);
const ARTIFACT_TARGET_FIELDS = new Set(["type", "artifactId", "artifactKind", "role"]);
const PRODUCER_FIELDS = new Set(["commandId", "jobId", "resultIds"]);
const TOOL_FIELDS = new Set(["name", "version"]);
const EMBEDDED_PAYLOAD_FIELDS = new Set([
  "artifactBytes",
  "artifactPayload",
  "binaryPayload",
  "sourceBytes",
  "sourcePayload",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasOnlyFields = (value: Record<string, unknown>, fields: ReadonlySet<string>): boolean =>
  Object.keys(value).every((field) => fields.has(field));

const isSafeReference = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === value && SAFE_REFERENCE.test(value);

const embeddedPayloadPath = (value: unknown, path = "relation.parameters"): string | null => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = embeddedPayloadPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [field, entry] of Object.entries(value)) {
    if (EMBEDDED_PAYLOAD_FIELDS.has(field)) return `${path}.${field}`;
    const found = embeddedPayloadPath(entry, `${path}.${field}`);
    if (found) return found;
  }
  return null;
};

const sourceKey = (source: ScientificSourceGeneration): string =>
  `${source.documentId}@${source.revision}:${source.structuralHash}:${source.generation}`;

const targetKey = (target: DocumentRelationTarget): string => canonicalJsonStringify(target);

const cloneSource = (source: ScientificSourceGeneration): ScientificSourceGeneration => Object.freeze({ ...source });

const cloneTarget = (target: DocumentRelationTarget): DocumentRelationTarget => {
  if (target.type === "document") {
    return Object.freeze({ type: "document", generation: cloneSource(target.generation) });
  }
  return Object.freeze({ ...target });
};

const normalizeProducer = (producer: DocumentRelationProducer | undefined): DocumentRelationProducer | undefined => {
  if (!producer) return undefined;
  const resultIds = producer.resultIds ? Object.freeze([...producer.resultIds].sort()) : undefined;
  return Object.freeze({
    ...(producer.commandId ? { commandId: producer.commandId } : {}),
    ...(producer.jobId ? { jobId: producer.jobId } : {}),
    ...(resultIds?.length ? { resultIds } : {}),
  });
};

const relationIdentity = (relation: Omit<DocumentRelation, "relationId" | "status">): CanonicalJsonValue => ({
  schemaVersion: relation.schemaVersion,
  kind: relation.kind,
  sources: relation.sources,
  sourceOrder: relation.sourceOrder,
  target: relation.target,
  operation: relation.operation,
  parameters: relation.parameters,
  ...(relation.producer ? { producer: relation.producer } : {}),
  ...(relation.tool ? { tool: relation.tool } : {}),
}) as CanonicalJsonValue;

const relationIdFor = (relation: Omit<DocumentRelation, "relationId" | "status">): DocumentRelationId =>
  `math3d-relation:${structuralHash(relationIdentity(relation)).slice("sha256:".length)}`;

const validateTarget = (value: unknown, errors: string[]): value is DocumentRelationTarget => {
  if (!isRecord(value)) {
    errors.push("relation.target must be an object.");
    return false;
  }
  if (value.type === "document") {
    if (!hasOnlyFields(value, DOCUMENT_TARGET_FIELDS)) errors.push("relation.target document contains unknown fields.");
    if (!isScientificSourceGeneration(value.generation)) errors.push("relation.target.generation must be exact.");
    return errors.length === 0;
  }
  if (value.type === "result") {
    if (!hasOnlyFields(value, RESULT_TARGET_FIELDS)) errors.push("relation.target result contains unknown fields.");
    if (!isSafeReference(value.resultId)) errors.push("relation.target.resultId is invalid.");
    if (!isSafeReference(value.resultType)) errors.push("relation.target.resultType is invalid.");
    return errors.length === 0;
  }
  if (value.type === "artifact") {
    if (!hasOnlyFields(value, ARTIFACT_TARGET_FIELDS)) errors.push("relation.target artifact contains unknown fields.");
    if (!isSafeReference(value.artifactId)) errors.push("relation.target.artifactId is invalid.");
    if (!(ANALYSIS_ARTIFACT_KINDS as readonly unknown[]).includes(value.artifactKind)) {
      errors.push("relation.target.artifactKind is invalid.");
    }
    if (!isSafeReference(value.role)) errors.push("relation.target.role is invalid.");
    return errors.length === 0;
  }
  errors.push("relation.target.type must be document, result, or artifact.");
  return false;
};

const validateProducer = (value: unknown, errors: string[]): value is DocumentRelationProducer => {
  if (!isRecord(value) || !hasOnlyFields(value, PRODUCER_FIELDS)) {
    errors.push("relation.producer must be a strict object.");
    return false;
  }
  if (value.commandId !== undefined && !isSafeReference(value.commandId)) errors.push("relation.producer.commandId is invalid.");
  if (value.jobId !== undefined && !isSafeReference(value.jobId)) errors.push("relation.producer.jobId is invalid.");
  if (value.resultIds !== undefined) {
    if (!Array.isArray(value.resultIds) || value.resultIds.some((id) => !isSafeReference(id))) {
      errors.push("relation.producer.resultIds must contain valid references.");
    } else if (new Set(value.resultIds).size !== value.resultIds.length) {
      errors.push("relation.producer.resultIds must not contain duplicates.");
    }
  }
  if (value.commandId === undefined && value.jobId === undefined && value.resultIds === undefined) {
    errors.push("relation.producer must contain at least one reference.");
  }
  return errors.length === 0;
};

const validateTool = (value: unknown, errors: string[]): value is DocumentRelationTool => {
  if (!isRecord(value) || !hasOnlyFields(value, TOOL_FIELDS)) {
    errors.push("relation.tool must be a strict object.");
    return false;
  }
  if (!isSafeReference(value.name)) errors.push("relation.tool.name is invalid.");
  if (!isSafeReference(value.version)) errors.push("relation.tool.version is invalid.");
  return errors.length === 0;
};

const validateRelation = (value: unknown): ValidationResult<DocumentRelation> => {
  if (!isRecord(value)) return { ok: false, errors: ["Document relation must be an object."] };
  const errors: string[] = [];
  if (!hasOnlyFields(value, RELATION_FIELDS)) errors.push("relation contains unknown fields.");
  if (value.schemaVersion !== DOCUMENT_RELATION_SCHEMA_VERSION) errors.push("relation.schemaVersion must be 1.");
  if (typeof value.relationId !== "string" || !RELATION_ID.test(value.relationId)) errors.push("relation.relationId is invalid.");
  if (!(DOCUMENT_RELATION_KINDS as readonly unknown[]).includes(value.kind)) errors.push("relation.kind is invalid.");
  if (!Array.isArray(value.sources) || value.sources.length < 1 || value.sources.length > MAX_DOCUMENT_RELATION_SOURCES) {
    errors.push(`relation.sources must contain 1-${MAX_DOCUMENT_RELATION_SOURCES} exact generations.`);
  } else {
    if (value.sources.some((source) => !isScientificSourceGeneration(source))) errors.push("relation.sources contains an invalid generation.");
    const keys = value.sources.filter(isScientificSourceGeneration).map(sourceKey);
    if (new Set(keys).size !== keys.length) errors.push("relation.sources must not contain duplicates.");
  }
  if (value.sourceOrder !== "ordered" && value.sourceOrder !== "unordered") errors.push("relation.sourceOrder is invalid.");
  validateTarget(value.target, errors);
  if (typeof value.operation !== "string" || !OPERATION.test(value.operation)) errors.push("relation.operation must be namespaced.");
  try {
    canonicalJsonStringify(value.parameters);
    if (canonicalJsonByteLength(value.parameters) > MAX_DOCUMENT_RELATION_PARAMETERS_BYTES) {
      errors.push(`relation.parameters exceeds ${MAX_DOCUMENT_RELATION_PARAMETERS_BYTES} bytes.`);
    }
    const payloadPath = embeddedPayloadPath(value.parameters);
    if (payloadPath) errors.push(`${payloadPath} must be stored as an artifact reference, not embedded in lineage.`);
  } catch (error) {
    errors.push(`relation.parameters must be canonical JSON: ${String((error as Error).message ?? error)}`);
  }
  if (value.producer !== undefined) validateProducer(value.producer, errors);
  if (value.tool !== undefined) validateTool(value.tool, errors);
  if (!(DOCUMENT_RELATION_STATUSES as readonly unknown[]).includes(value.status)) errors.push("relation.status is invalid.");
  try {
    if (canonicalJsonByteLength(value) > MAX_DOCUMENT_RELATION_BYTES) {
      errors.push(`relation exceeds ${MAX_DOCUMENT_RELATION_BYTES} bytes.`);
    }
  } catch (error) {
    errors.push(`relation must be canonical JSON: ${String((error as Error).message ?? error)}`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: value as unknown as DocumentRelation };
};

export const createDocumentRelation = (input: CreateDocumentRelationInput): DocumentRelation => {
  if (!Array.isArray(input.sources)) throw new TypeError("Document relation sources must be an array.");
  const sources = input.sources.map(cloneSource);
  if (input.sourceOrder === "unordered") sources.sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)));
  const producer = normalizeProducer(input.producer);
  const withoutIdentity: Omit<DocumentRelation, "relationId" | "status"> = {
    schemaVersion: DOCUMENT_RELATION_SCHEMA_VERSION,
    kind: input.kind,
    sources: Object.freeze(sources),
    sourceOrder: input.sourceOrder,
    target: cloneTarget(input.target),
    operation: input.operation,
    parameters: immutableCanonicalJsonClone(input.parameters) as CanonicalJsonValue,
    ...(producer ? { producer } : {}),
    ...(input.tool ? { tool: Object.freeze({ ...input.tool }) } : {}),
  };
  const relation = Object.freeze({
    ...withoutIdentity,
    relationId: relationIdFor(withoutIdentity),
    status: input.status ?? "current",
  });
  const validation = validateRelation(relation);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  if (relation.target.type === "document") {
    const target = sourceKey(relation.target.generation);
    if (relation.sources.some((source) => sourceKey(source) === target)) {
      throw new TypeError("Document relation cannot target one of its own exact source generations.");
    }
  }
  return relation;
};

export const normalizeDocumentRelation = (value: unknown): ValidationResult<DocumentRelation> => {
  const validation = validateRelation(value);
  if (!validation.ok) return validation;
  try {
    const normalized = createDocumentRelation(validation.value);
    if (normalized.relationId !== validation.value.relationId) {
      return { ok: false, errors: ["relation.relationId does not match its canonical lineage identity."] };
    }
    return { ok: true, value: normalized };
  } catch (error) {
    return { ok: false, errors: [String((error as Error).message ?? error)] };
  }
};

export const isDocumentRelation = (value: unknown): value is DocumentRelation =>
  normalizeDocumentRelation(value).ok;

export const withDocumentRelationStatus = (
  relation: DocumentRelation,
  status: DocumentRelationStatus
): DocumentRelation => createDocumentRelation({ ...relation, status });

export const evaluateDocumentRelationStatus = (
  relation: DocumentRelation,
  resolveSource: DocumentRelationSourceResolver
): DocumentRelationStatus => {
  if (relation.status !== "current") return relation.status;
  for (const source of relation.sources) {
    const current = resolveSource(source.documentId);
    if (!current) return "unavailable";
    if (!matchesScientificSourceGeneration(source, current)) return "stale";
  }
  return "current";
};

export const createCurrentDocumentRelation = (
  input: CreateDocumentRelationInput,
  resolveSource: DocumentRelationSourceResolver
): DocumentRelation => {
  const relation = createDocumentRelation({ ...input, status: "current" });
  const status = evaluateDocumentRelationStatus(relation, resolveSource);
  if (status !== "current") {
    throw new TypeError(`Current relation sources resolve as '${status}'.`);
  }
  return relation;
};

const uniqueSources = (relations: readonly DocumentRelation[]): readonly ScientificSourceGeneration[] => {
  const byKey = new Map<string, ScientificSourceGeneration>();
  for (const relation of relations) {
    for (const source of relation.sources) byKey.set(sourceKey(source), source);
  }
  return Object.freeze([...byKey.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, source]) => source));
};

const uniqueTargets = (relations: readonly DocumentRelation[]): readonly DocumentRelationTarget[] => {
  const byKey = new Map<string, DocumentRelationTarget>();
  for (const relation of relations) byKey.set(targetKey(relation.target), relation.target);
  return Object.freeze([...byKey.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, target]) => target));
};

const assertAcyclicDocumentTargets = (relations: readonly DocumentRelation[]): void => {
  const edges = new Map<string, Set<string>>();
  for (const relation of relations) {
    if (relation.target.type !== "document") continue;
    const target = sourceKey(relation.target.generation);
    for (const source of relation.sources) {
      const key = sourceKey(source);
      const targets = edges.get(key) ?? new Set<string>();
      targets.add(target);
      edges.set(key, targets);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): void => {
    if (visiting.has(node)) throw new TypeError("Document relation set introduces a document-generation cycle.");
    if (visited.has(node)) return;
    visiting.add(node);
    for (const target of edges.get(node) ?? []) visit(target);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of [...edges.keys()].sort()) visit(node);
};

export const createDocumentRelationIndex = (values: readonly DocumentRelation[]): DocumentRelationIndex => {
  const byId = new Map<DocumentRelationId, DocumentRelation>();
  for (const value of values) {
    const validation = normalizeDocumentRelation(value);
    if (!validation.ok) throw new TypeError(validation.errors.join(" "));
    if (byId.has(validation.value.relationId)) throw new TypeError(`Duplicate relation '${validation.value.relationId}'.`);
    byId.set(validation.value.relationId, validation.value);
  }
  const relations = Object.freeze([...byId.values()].sort((left, right) => left.relationId.localeCompare(right.relationId)));
  assertAcyclicDocumentTargets(relations);
  const fromSource = (source: ScientificSourceGeneration | StableDocumentId): readonly DocumentRelation[] => {
    const exact = typeof source === "string" ? null : sourceKey(source);
    const documentId = typeof source === "string" ? source : source.documentId;
    return Object.freeze(relations.filter((relation) => relation.sources.some((candidate) =>
      exact ? sourceKey(candidate) === exact : candidate.documentId === documentId
    )));
  };
  const toTarget = (target: DocumentRelationTarget): readonly DocumentRelation[] => {
    const key = targetKey(target);
    return Object.freeze(relations.filter((relation) => targetKey(relation.target) === key));
  };
  return Object.freeze({
    relations,
    get: (relationId: DocumentRelationId) => byId.get(relationId) ?? null,
    fromSource,
    toTarget,
    parentsOf: (target: DocumentRelationTarget) => uniqueSources(toTarget(target)),
    childrenOf: (source: ScientificSourceGeneration | StableDocumentId) => uniqueTargets(fromSource(source)),
  });
};
