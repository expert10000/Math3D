import { immutableCanonicalJsonClone } from "./commands";
import {
  canonicalJsonStringify,
  isDocumentIdentity,
  isStructuralHash,
  structuralHash,
  type CanonicalJsonValue,
  type DocumentIdentity,
  type StructuralHash,
} from "./documentIdentity";
import {
  ANALYSIS_ARTIFACT_KINDS,
  type AnalysisArtifactHandle,
} from "./analysisResults";
import {
  isScientificSourceGeneration,
  type ScientificSourceGeneration,
} from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const TOPOLOGY_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const TOPOLOGY_DOCUMENT_FORMAT = "math3d.topology-document" as const;

export const TOPOLOGY_SOURCE_KINDS = [
  "fundamental-diagram",
  "cw-complex",
  "simplicial-complex",
  "mesh-snapshot",
  "geometry-snapshot",
] as const;
export type TopologyDocumentSourceKind = (typeof TOPOLOGY_SOURCE_KINDS)[number];

export type TopologyDocumentSource = Readonly<{
  sourceId: string;
  kind: TopologyDocumentSourceKind;
  model: Readonly<Record<string, CanonicalJsonValue>>;
}>;

export type TopologyCanonicalComplexReference = Readonly<{
  referenceId: string;
  source: ScientificSourceGeneration;
  state: "current" | "unavailable" | "legacy-embedded";
  canonicalHash: StructuralHash | null;
  artifact?: AnalysisArtifactHandle;
}>;

export type TopologyAnalysisResultReference = Readonly<{
  resultId: string;
  resultType: string;
  source: ScientificSourceGeneration;
  state: "available" | "unavailable" | "legacy-limited";
}>;

export type TopologyDisplayRealizationReference = Readonly<{
  realizationId: string;
  kind: "embedded" | "immersed" | "schematic";
  authority: "illustrative";
  source: ScientificSourceGeneration;
  state: "available" | "unavailable" | "legacy-embedded";
  artifact?: AnalysisArtifactHandle;
}>;

export type TopologyDocumentDiagnostic = Readonly<{
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  action: string;
}>;

export type TopologyDocumentProvenance = Readonly<{
  origin: "native" | "current-format-adapter";
  sourceFormat: string;
  sourceVersion: number;
  diagnostics: readonly TopologyDocumentDiagnostic[];
}>;

export type TopologyDocument = Readonly<{
  format: typeof TOPOLOGY_DOCUMENT_FORMAT;
  schemaVersion: typeof TOPOLOGY_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: TopologyDocumentSource;
  canonicalComplex: TopologyCanonicalComplexReference | null;
  results: readonly TopologyAnalysisResultReference[];
  displayRealizations: readonly TopologyDisplayRealizationReference[];
  provenance: TopologyDocumentProvenance;
}>;

const DOCUMENT_FIELDS = new Set([
  "format", "schemaVersion", "identity", "source", "canonicalComplex", "results", "displayRealizations", "provenance",
]);
const SOURCE_FIELDS = new Set(["sourceId", "kind", "model"]);
const CANONICAL_REFERENCE_FIELDS = new Set(["referenceId", "source", "state", "canonicalHash", "artifact"]);
const RESULT_REFERENCE_FIELDS = new Set(["resultId", "resultType", "source", "state"]);
const DISPLAY_REFERENCE_FIELDS = new Set(["realizationId", "kind", "authority", "source", "state", "artifact"]);
const ARTIFACT_FIELDS = new Set(["artifactId", "kind", "role"]);
const PROVENANCE_FIELDS = new Set(["origin", "sourceFormat", "sourceVersion", "diagnostics"]);
const DIAGNOSTIC_FIELDS = new Set(["code", "severity", "message", "action"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const NAMESPACED_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const validateFields = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[]
): void => {
  const extra = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  if (extra.length > 0) errors.push(`${path} contains unknown fields: ${extra.join(", ")}.`);
};

const validateString = (
  value: unknown,
  path: string,
  errors: string[],
  maximum = 500
): value is string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    errors.push(`${path} must be a non-empty string of at most ${maximum} characters.`);
    return false;
  }
  return true;
};

const validateId = (value: unknown, path: string, errors: string[]): value is string => {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    errors.push(`${path} must be an ID-safe string of at most 160 characters.`);
    return false;
  }
  return true;
};

const isArtifactHandle = (value: unknown): value is AnalysisArtifactHandle =>
  isRecord(value) &&
  Object.keys(value).length === ARTIFACT_FIELDS.size &&
  Object.keys(value).every((field) => ARTIFACT_FIELDS.has(field)) &&
  typeof value.artifactId === "string" &&
  SAFE_ID.test(value.artifactId) &&
  (ANALYSIS_ARTIFACT_KINDS as readonly unknown[]).includes(value.kind) &&
  typeof value.role === "string" &&
  value.role.trim().length > 0 &&
  value.role.length <= 120;

export const topologyDocumentSourceHash = (source: TopologyDocumentSource): StructuralHash =>
  structuralHash({ sourceId: source.sourceId, kind: source.kind, model: source.model });

const validateSource = (value: unknown, errors: string[]): value is TopologyDocumentSource => {
  const initialErrorCount = errors.length;
  if (!isRecord(value)) {
    errors.push("topology.source must be an object.");
    return false;
  }
  validateFields(value, SOURCE_FIELDS, "topology.source", errors);
  validateId(value.sourceId, "topology.source.sourceId", errors);
  if (!(TOPOLOGY_SOURCE_KINDS as readonly unknown[]).includes(value.kind)) {
    errors.push(`topology.source.kind must be one of: ${TOPOLOGY_SOURCE_KINDS.join(", ")}.`);
  }
  if (!isRecord(value.model)) errors.push("topology.source.model must be a canonical JSON object.");
  return errors.length === initialErrorCount;
};

const sourceGuardMatchesIdentity = (
  value: ScientificSourceGeneration,
  identity: DocumentIdentity
): boolean =>
  value.documentId === identity.id &&
  value.revision === identity.revision &&
  value.structuralHash === identity.structuralHash;

const validateReferenceSource = (
  value: unknown,
  identity: DocumentIdentity | null,
  path: string,
  errors: string[]
): value is ScientificSourceGeneration => {
  if (!isScientificSourceGeneration(value)) {
    errors.push(`${path} must be an exact scientific source generation.`);
    return false;
  }
  if (identity && !sourceGuardMatchesIdentity(value, identity)) {
    errors.push(`${path} must match the topology document identity.`);
    return false;
  }
  return true;
};

const validateCanonicalReference = (
  value: unknown,
  identity: DocumentIdentity | null,
  errors: string[]
): void => {
  if (value === null) return;
  if (!isRecord(value)) {
    errors.push("topology.canonicalComplex must be an object or null.");
    return;
  }
  validateFields(value, CANONICAL_REFERENCE_FIELDS, "topology.canonicalComplex", errors);
  validateId(value.referenceId, "topology.canonicalComplex.referenceId", errors);
  validateReferenceSource(value.source, identity, "topology.canonicalComplex.source", errors);
  if (!["current", "unavailable", "legacy-embedded"].includes(value.state as string)) {
    errors.push("topology.canonicalComplex.state is invalid.");
  }
  if (value.canonicalHash !== null && !isStructuralHash(value.canonicalHash)) {
    errors.push("topology.canonicalComplex.canonicalHash must be a SHA-256 structural hash or null.");
  }
  if (value.artifact !== undefined && !isArtifactHandle(value.artifact)) {
    errors.push("topology.canonicalComplex.artifact must be a valid artifact handle when provided.");
  }
  if (value.state === "current" && (value.artifact === undefined || !isStructuralHash(value.canonicalHash))) {
    errors.push("A current canonical complex requires an artifact handle and canonical hash.");
  }
  if (value.state === "unavailable" && value.artifact !== undefined) {
    errors.push("An unavailable canonical complex cannot claim an artifact handle.");
  }
  if (value.state === "unavailable" && value.canonicalHash !== null) {
    errors.push("An unavailable canonical complex cannot claim a canonical hash.");
  }
  if (value.state === "legacy-embedded" && (value.artifact !== undefined || !isStructuralHash(value.canonicalHash))) {
    errors.push("A legacy-embedded canonical complex requires only its verified canonical hash.");
  }
};

const validateResultReferences = (
  value: unknown,
  identity: DocumentIdentity | null,
  errors: string[]
): void => {
  if (!Array.isArray(value)) {
    errors.push("topology.results must be an array.");
    return;
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const path = `topology.results[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    validateFields(entry, RESULT_REFERENCE_FIELDS, path, errors);
    if (validateId(entry.resultId, `${path}.resultId`, errors)) {
      if (ids.has(entry.resultId)) errors.push(`${path}.resultId is duplicated.`);
      ids.add(entry.resultId);
    }
    if (typeof entry.resultType !== "string" || !NAMESPACED_TYPE.test(entry.resultType)) {
      errors.push(`${path}.resultType must be a namespaced lowercase type.`);
    }
    validateReferenceSource(entry.source, identity, `${path}.source`, errors);
    if (!["available", "unavailable", "legacy-limited"].includes(entry.state as string)) {
      errors.push(`${path}.state is invalid.`);
    }
  });
};

const validateDisplayReferences = (
  value: unknown,
  identity: DocumentIdentity | null,
  errors: string[]
): void => {
  if (!Array.isArray(value)) {
    errors.push("topology.displayRealizations must be an array.");
    return;
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const path = `topology.displayRealizations[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    validateFields(entry, DISPLAY_REFERENCE_FIELDS, path, errors);
    if (validateId(entry.realizationId, `${path}.realizationId`, errors)) {
      if (ids.has(entry.realizationId)) errors.push(`${path}.realizationId is duplicated.`);
      ids.add(entry.realizationId);
    }
    if (!["embedded", "immersed", "schematic"].includes(entry.kind as string)) {
      errors.push(`${path}.kind is invalid.`);
    }
    if (entry.authority !== "illustrative") errors.push(`${path}.authority must be illustrative.`);
    validateReferenceSource(entry.source, identity, `${path}.source`, errors);
    if (!["available", "unavailable", "legacy-embedded"].includes(entry.state as string)) {
      errors.push(`${path}.state is invalid.`);
    }
    if (entry.artifact !== undefined && !isArtifactHandle(entry.artifact)) {
      errors.push(`${path}.artifact must be a valid artifact handle when provided.`);
    }
    if (entry.state === "available" && entry.artifact === undefined) {
      errors.push(`${path} requires an artifact handle when available.`);
    }
    if (entry.state !== "available" && entry.artifact !== undefined) {
      errors.push(`${path} cannot claim an artifact handle unless available.`);
    }
  });
};

const validateProvenance = (value: unknown, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push("topology.provenance must be an object.");
    return;
  }
  validateFields(value, PROVENANCE_FIELDS, "topology.provenance", errors);
  if (!["native", "current-format-adapter"].includes(value.origin as string)) {
    errors.push("topology.provenance.origin is invalid.");
  }
  validateString(value.sourceFormat, "topology.provenance.sourceFormat", errors, 120);
  if (!Number.isSafeInteger(value.sourceVersion) || (value.sourceVersion as number) < 1) {
    errors.push("topology.provenance.sourceVersion must be a positive safe integer.");
  }
  if (!Array.isArray(value.diagnostics)) {
    errors.push("topology.provenance.diagnostics must be an array.");
    return;
  }
  if (value.diagnostics.length > 50) errors.push("topology.provenance.diagnostics must contain at most 50 entries.");
  value.diagnostics.forEach((entry, index) => {
    const path = `topology.provenance.diagnostics[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    validateFields(entry, DIAGNOSTIC_FIELDS, path, errors);
    validateString(entry.code, `${path}.code`, errors, 120);
    if (!["info", "warning", "error"].includes(entry.severity as string)) errors.push(`${path}.severity is invalid.`);
    validateString(entry.message, `${path}.message`, errors, 1_000);
    validateString(entry.action, `${path}.action`, errors, 500);
  });
};

export const normalizeTopologyDocument = (value: unknown): ValidationResult<TopologyDocument> => {
  if (!isRecord(value)) return { ok: false, errors: ["Topology document must be an object."] };
  try {
    canonicalJsonStringify(value);
  } catch (error) {
    return { ok: false, errors: [`Topology document must be canonical JSON: ${String((error as Error).message ?? error)}`] };
  }
  const errors: string[] = [];
  validateFields(value, DOCUMENT_FIELDS, "topology", errors);
  if (value.format !== TOPOLOGY_DOCUMENT_FORMAT) errors.push(`topology.format must be '${TOPOLOGY_DOCUMENT_FORMAT}'.`);
  if (value.schemaVersion !== TOPOLOGY_DOCUMENT_SCHEMA_VERSION) {
    errors.push(`topology.schemaVersion must be ${TOPOLOGY_DOCUMENT_SCHEMA_VERSION}.`);
  }
  const identity = isDocumentIdentity(value.identity) ? value.identity : null;
  if (!identity) errors.push("topology.identity must be a valid versioned document identity.");
  const sourceValid = validateSource(value.source, errors);
  if (identity && sourceValid && identity.structuralHash !== topologyDocumentSourceHash(value.source as TopologyDocumentSource)) {
    errors.push("topology.identity.structuralHash does not match the authoritative source model.");
  }
  validateCanonicalReference(value.canonicalComplex, identity, errors);
  validateResultReferences(value.results, identity, errors);
  validateDisplayReferences(value.displayRealizations, identity, errors);
  validateProvenance(value.provenance, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as TopologyDocument };
};

export const createTopologyDocument = (
  value: Omit<TopologyDocument, "format" | "schemaVersion">
): TopologyDocument => {
  const normalized = normalizeTopologyDocument({
    format: TOPOLOGY_DOCUMENT_FORMAT,
    schemaVersion: TOPOLOGY_DOCUMENT_SCHEMA_VERSION,
    ...value,
  });
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const serializeTopologyDocument = (value: TopologyDocument): string => {
  const normalized = normalizeTopologyDocument(value);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return canonicalJsonStringify(normalized.value);
};

export const deserializeTopologyDocument = (serialized: string): ValidationResult<TopologyDocument> => {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    return { ok: false, errors: [`Topology document JSON is invalid: ${String((error as Error).message ?? error)}`] };
  }
  return normalizeTopologyDocument(value);
};
