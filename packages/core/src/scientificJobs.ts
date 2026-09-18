import {
  canonicalJsonStringify,
  isStableDocumentId,
  isStructuralHash,
  type CanonicalJsonValue,
  type StableDocumentId,
  type StructuralHash,
} from "./documentIdentity";
import { isM3DResourceReference, type M3DResourceReference } from "./m3dBinaryResources";
import { immutableCanonicalJsonClone } from "./commands";
import type { ValidationResult } from "./validation";

export const SCIENTIFIC_JOB_SCHEMA_VERSION = 1 as const;

export type ScientificSourceGeneration = Readonly<{
  documentId: StableDocumentId;
  revision: number;
  structuralHash: StructuralHash;
  generation: number;
}>;

export type ScientificJobLimits = Readonly<{
  deadlineAt: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxMemoryBytes: number;
  maxWorkUnits: number;
}>;

export type ScientificJobOperation = Readonly<{
  type: string;
  payload: CanonicalJsonValue;
}>;

export type ScientificJobRequest = Readonly<{
  schemaVersion: typeof SCIENTIFIC_JOB_SCHEMA_VERSION;
  jobId: string;
  source: ScientificSourceGeneration;
  operation: ScientificJobOperation;
  resources?: readonly M3DResourceReference[];
  limits: ScientificJobLimits;
}>;

export type ScientificJobProgress = Readonly<{
  completed: number;
  total?: number;
  message?: string;
}>;

export const SCIENTIFIC_JOB_FAILURE_CODES = [
  "invalid-request",
  "unsupported-operation",
  "source-unavailable",
  "stale-source",
  "cancelled",
  "deadline-exceeded",
  "input-limit-exceeded",
  "output-limit-exceeded",
  "memory-limit-exceeded",
  "work-limit-exceeded",
  "adapter-failed",
] as const;

export type ScientificJobFailureCode = (typeof SCIENTIFIC_JOB_FAILURE_CODES)[number];

export type ScientificJobResult = Readonly<{
  ok: true;
  schemaVersion: typeof SCIENTIFIC_JOB_SCHEMA_VERSION;
  jobId: string;
  operationType: string;
  source: ScientificSourceGeneration;
  output: CanonicalJsonValue;
  outputBytes: number;
}>;

export type ScientificJobFailure = Readonly<{
  ok: false;
  schemaVersion: typeof SCIENTIFIC_JOB_SCHEMA_VERSION;
  jobId: string;
  operationType?: string;
  source?: ScientificSourceGeneration;
  code: ScientificJobFailureCode;
  message: string;
}>;

export type ScientificJobOutcome = ScientificJobResult | ScientificJobFailure;

export type ScientificJobEventType =
  | "scientific-job.submitted"
  | "scientific-job.progressed"
  | "scientific-job.completed"
  | "scientific-job.failed"
  | "scientific-job.cancelled"
  | "scientific-job.timed-out"
  | "scientific-job.stale-rejected";

export type ScientificJobEvent = Readonly<{
  schemaVersion: typeof SCIENTIFIC_JOB_SCHEMA_VERSION;
  sequence: number;
  type: ScientificJobEventType;
  jobId: string;
  operationType: string;
  source: ScientificSourceGeneration;
  progressSequence?: number;
  progress?: ScientificJobProgress;
  failureCode?: ScientificJobFailureCode;
}>;

const REQUEST_FIELDS = new Set(["schemaVersion", "jobId", "source", "operation", "resources", "limits"]);
const SOURCE_FIELDS = new Set(["documentId", "revision", "structuralHash", "generation"]);
const OPERATION_FIELDS = new Set(["type", "payload"]);
const LIMIT_FIELDS = new Set([
  "deadlineAt",
  "maxInputBytes",
  "maxOutputBytes",
  "maxMemoryBytes",
  "maxWorkUnits",
]);
const PROGRESS_FIELDS = new Set(["completed", "total", "message"]);
const OPERATION_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const validateFields = (
  value: Record<string, unknown>,
  fields: ReadonlySet<string>,
  path: string,
  errors: string[]
): void => {
  const unknown = Object.keys(value).filter((field) => !fields.has(field)).sort();
  if (unknown.length > 0) errors.push(`${path} contains unknown fields: ${unknown.join(", ")}.`);
};

const isPositiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

export const isScientificSourceGeneration = (value: unknown): value is ScientificSourceGeneration =>
  isRecord(value) &&
  Object.keys(value).every((field) => SOURCE_FIELDS.has(field)) &&
  Object.keys(value).length === SOURCE_FIELDS.size &&
  isStableDocumentId(value.documentId) &&
  isPositiveSafeInteger(value.revision) &&
  isStructuralHash(value.structuralHash) &&
  isPositiveSafeInteger(value.generation);

export const matchesScientificSourceGeneration = (
  left: ScientificSourceGeneration,
  right: ScientificSourceGeneration
): boolean =>
  left.documentId === right.documentId &&
  left.revision === right.revision &&
  left.structuralHash === right.structuralHash &&
  left.generation === right.generation;

export const canonicalJsonByteLength = (value: unknown): number =>
  new TextEncoder().encode(canonicalJsonStringify(value)).byteLength;

export const normalizeScientificJobRequest = (
  value: unknown
): ValidationResult<ScientificJobRequest> => {
  if (!isRecord(value)) return { ok: false, errors: ["Scientific job request must be an object."] };
  try {
    canonicalJsonStringify(value);
  } catch (error) {
    return {
      ok: false,
      errors: [`Scientific job request must be canonical JSON: ${String((error as Error).message ?? error)}`],
    };
  }

  const errors: string[] = [];
  validateFields(value, REQUEST_FIELDS, "job", errors);
  if (value.schemaVersion !== SCIENTIFIC_JOB_SCHEMA_VERSION) {
    errors.push(`job.schemaVersion must be ${SCIENTIFIC_JOB_SCHEMA_VERSION}.`);
  }
  if (
    typeof value.jobId !== "string" ||
    value.jobId.trim() !== value.jobId ||
    value.jobId.length === 0 ||
    value.jobId.length > 160
  ) {
    errors.push("job.jobId must be a trimmed non-empty string of at most 160 characters.");
  }

  if (!isRecord(value.source)) {
    errors.push("job.source must be an object.");
  } else {
    validateFields(value.source, SOURCE_FIELDS, "job.source", errors);
    if (!isStableDocumentId(value.source.documentId)) errors.push("job.source.documentId is invalid.");
    if (!isPositiveSafeInteger(value.source.revision)) errors.push("job.source.revision must be a positive safe integer.");
    if (!isStructuralHash(value.source.structuralHash)) errors.push("job.source.structuralHash is invalid.");
    if (!isPositiveSafeInteger(value.source.generation)) errors.push("job.source.generation must be a positive safe integer.");
  }

  if (!isRecord(value.operation)) {
    errors.push("job.operation must be an object.");
  } else {
    validateFields(value.operation, OPERATION_FIELDS, "job.operation", errors);
    if (typeof value.operation.type !== "string" || !OPERATION_TYPE.test(value.operation.type)) {
      errors.push("job.operation.type must be a namespaced lowercase operation type.");
    }
    if (!("payload" in value.operation)) errors.push("job.operation.payload is required.");
  }

  if (!isRecord(value.limits)) {
    errors.push("job.limits must be an object.");
  } else {
    validateFields(value.limits, LIMIT_FIELDS, "job.limits", errors);
    if (!Number.isFinite(value.limits.deadlineAt) || (value.limits.deadlineAt as number) < 0) {
      errors.push("job.limits.deadlineAt must be a non-negative finite number.");
    }
    for (const field of ["maxInputBytes", "maxOutputBytes", "maxMemoryBytes", "maxWorkUnits"] as const) {
      if (!isPositiveSafeInteger(value.limits[field])) {
        errors.push(`job.limits.${field} must be a positive safe integer.`);
      }
    }
  }

  if (value.resources !== undefined) {
    if (!Array.isArray(value.resources) || value.resources.some((resource) => !isM3DResourceReference(resource))) {
      errors.push("job.resources must contain valid M3D resource references.");
    } else {
      const resourceIds = new Set<string>();
      let resourceBytes = 0;
      for (const resource of value.resources) {
        if (resourceIds.has(resource.resourceId)) errors.push(`job.resources contains duplicate resource '${resource.resourceId}'.`);
        resourceIds.add(resource.resourceId);
        resourceBytes += resource.descriptor.byteLength;
      }
      if (!Number.isSafeInteger(resourceBytes)) errors.push("job.resources byte length is too large.");
      else if (isRecord(value.limits) && typeof value.limits.maxInputBytes === "number" && Number.isSafeInteger(value.limits.maxInputBytes) && resourceBytes > value.limits.maxInputBytes) {
        errors.push("job.resources exceed job.limits.maxInputBytes.");
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: immutableCanonicalJsonClone(value) as ScientificJobRequest,
  };
};

export const normalizeScientificJobProgress = (
  value: unknown
): ValidationResult<ScientificJobProgress> => {
  if (!isRecord(value)) return { ok: false, errors: ["Job progress must be an object."] };
  try {
    canonicalJsonStringify(value);
  } catch (error) {
    return {
      ok: false,
      errors: [`Job progress must be canonical JSON: ${String((error as Error).message ?? error)}`],
    };
  }
  const errors: string[] = [];
  validateFields(value, PROGRESS_FIELDS, "progress", errors);
  if (!Number.isFinite(value.completed) || (value.completed as number) < 0) {
    errors.push("progress.completed must be a non-negative finite number.");
  }
  if (value.total !== undefined) {
    if (!Number.isFinite(value.total) || (value.total as number) <= 0) {
      errors.push("progress.total must be a positive finite number when provided.");
    } else if (Number.isFinite(value.completed) && (value.completed as number) > (value.total as number)) {
      errors.push("progress.completed must not exceed progress.total.");
    }
  }
  if (
    value.message !== undefined &&
    (typeof value.message !== "string" || value.message.length > 500)
  ) {
    errors.push("progress.message must contain at most 500 characters when provided.");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as ScientificJobProgress };
};

export const createScientificJobRequest = (
  value: Omit<ScientificJobRequest, "schemaVersion">
): ScientificJobRequest => {
  const result = normalizeScientificJobRequest({
    schemaVersion: SCIENTIFIC_JOB_SCHEMA_VERSION,
    ...value,
  });
  if (!result.ok) throw new TypeError(result.errors.join(" "));
  return result.value;
};
