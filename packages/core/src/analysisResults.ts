import { immutableCanonicalJsonClone } from "./commands";
import {
  canonicalJsonStringify,
  type CanonicalJsonValue,
} from "./documentIdentity";
import {
  canonicalJsonByteLength,
  isScientificSourceGeneration,
  matchesScientificSourceGeneration,
  type ScientificJobResult,
  type ScientificSourceGeneration,
} from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const ANALYSIS_RESULT_SCHEMA_VERSION = 1 as const;
export const MAX_ANALYSIS_RESULT_BYTES = 64 * 1024;
export const MAX_ANALYSIS_SUMMARY_BYTES = 16 * 1024;
export const MAX_ANALYSIS_PARAMETERS_BYTES = 16 * 1024;

export const ANALYSIS_RESULT_STATUSES = [
  "exact",
  "certified",
  "numerical",
  "recognized",
  "heuristic",
  "unsupported",
  "failed",
  "cancelled",
] as const;

export type AnalysisResultStatus = (typeof ANALYSIS_RESULT_STATUSES)[number];

export const ANALYSIS_DIAGNOSTIC_SEVERITIES = ["info", "warning", "error"] as const;
export type AnalysisDiagnosticSeverity = (typeof ANALYSIS_DIAGNOSTIC_SEVERITIES)[number];

export const ANALYSIS_ARTIFACT_KINDS = [
  "sampled-grid",
  "sparse-matrix",
  "mesh",
  "binary",
  "table",
  "image",
  "other",
] as const;
export type AnalysisArtifactKind = (typeof ANALYSIS_ARTIFACT_KINDS)[number];

export type AnalysisPrecision = Readonly<{
  decimalDigits?: number;
  binaryBits?: number;
}>;

export type AnalysisTolerance = Readonly<{
  absolute?: number;
  relative?: number;
}>;

export type AnalysisNumericContext = Readonly<{
  precision?: AnalysisPrecision;
  tolerance?: AnalysisTolerance;
}>;

export type AnalysisOperationProvenance = Readonly<{
  type: string;
  algorithm: string;
  algorithmVersion: string;
  parameters: Readonly<Record<string, CanonicalJsonValue>>;
}>;

export type AnalysisEngineProvenance = Readonly<{
  name: string;
  version: string;
}>;

export type AnalysisProvenance = Readonly<{
  source: ScientificSourceGeneration;
  operation: AnalysisOperationProvenance;
  numericContext?: AnalysisNumericContext;
  engine: AnalysisEngineProvenance;
  elapsedMs: number;
}>;

export type AnalysisDiagnostic = Readonly<{
  code: string;
  severity: AnalysisDiagnosticSeverity;
  message: string;
  path?: string;
}>;

/** An opaque F06 reference. F07 owns its bytes, checksum, lifecycle, and lookup. */
export type AnalysisArtifactHandle = Readonly<{
  artifactId: string;
  kind: AnalysisArtifactKind;
  role: string;
}>;

export type AnalysisResultEnvelope = Readonly<{
  schemaVersion: typeof ANALYSIS_RESULT_SCHEMA_VERSION;
  resultId: string;
  status: AnalysisResultStatus;
  provenance: AnalysisProvenance;
  summary: Readonly<Record<string, CanonicalJsonValue>>;
  warnings: readonly string[];
  diagnostics: readonly AnalysisDiagnostic[];
  artifacts: readonly AnalysisArtifactHandle[];
}>;

export type LegacyLimitedAnalysisResult = Readonly<{
  kind: "legacy-limited";
  reason: "missing-provenance";
  displaySummary?: Readonly<Record<string, CanonicalJsonValue>>;
  warnings: readonly string[];
}>;

export type AnalysisResultRecord =
  | Readonly<{ kind: "versioned"; result: AnalysisResultEnvelope }>
  | LegacyLimitedAnalysisResult;

const RESULT_FIELDS = new Set([
  "schemaVersion", "resultId", "status", "provenance", "summary", "warnings", "diagnostics", "artifacts",
]);
const PROVENANCE_FIELDS = new Set(["source", "operation", "numericContext", "engine", "elapsedMs"]);
const OPERATION_FIELDS = new Set(["type", "algorithm", "algorithmVersion", "parameters"]);
const NUMERIC_FIELDS = new Set(["precision", "tolerance"]);
const PRECISION_FIELDS = new Set(["decimalDigits", "binaryBits"]);
const TOLERANCE_FIELDS = new Set(["absolute", "relative"]);
const ENGINE_FIELDS = new Set(["name", "version"]);
const DIAGNOSTIC_FIELDS = new Set(["code", "severity", "message", "path"]);
const ARTIFACT_FIELDS = new Set(["artifactId", "kind", "role"]);
const JOB_RESULT_FIELDS = new Set([
  "ok", "schemaVersion", "jobId", "operationType", "source", "output", "outputBytes",
]);
const NAMESPACED_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_ARRAY_LENGTH = 256;
const MAX_JSON_NODES = 2_048;
const EMBEDDED_ARTIFACT_FIELDS = new Set([
  "samples", "sampledgrid", "grid", "gridvalues", "scalarvalues", "mesh", "matrix", "data",
  "positions", "indices", "vertices", "faces",
  "rowpointers", "columnindices", "nonzerovalues", "sparsematrix", "binarypayload", "buffer", "bytes",
]);

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
  const unknown = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  if (unknown.length > 0) errors.push(`${path} contains unknown fields: ${unknown.join(", ")}.`);
};

const validateBoundedString = (
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

const validateCompactJson = (
  value: CanonicalJsonValue,
  path: string,
  errors: string[],
  depth = 0,
  counter = { nodes: 0 }
): void => {
  counter.nodes += 1;
  if (counter.nodes > MAX_JSON_NODES) {
    if (!errors.some((error) => error.includes("JSON nodes"))) {
      errors.push(`${path} exceeds ${MAX_JSON_NODES} JSON nodes; store bulk data as an artifact.`);
    }
    return;
  }
  if (depth > MAX_JSON_DEPTH) {
    errors.push(`${path} exceeds the maximum JSON depth of ${MAX_JSON_DEPTH}.`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_LENGTH) {
      errors.push(`${path} exceeds ${MAX_JSON_ARRAY_LENGTH} entries; store bulk data as an artifact.`);
      return;
    }
    value.forEach((entry, index) => validateCompactJson(entry, `${path}[${index}]`, errors, depth + 1, counter));
    return;
  }
  if (isRecord(value)) {
    for (const [field, entry] of Object.entries(value)) {
      const normalizedField = field.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (EMBEDDED_ARTIFACT_FIELDS.has(normalizedField) && entry !== null && typeof entry === "object") {
        errors.push(`${path}.${field} embeds scientific payload data; use an artifact handle.`);
        continue;
      }
      validateCompactJson(entry as CanonicalJsonValue, `${path}.${field}`, errors, depth + 1, counter);
    }
  }
};

const validatePrecision = (value: unknown, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push("result.provenance.numericContext.precision must be an object.");
    return;
  }
  validateFields(value, PRECISION_FIELDS, "result.provenance.numericContext.precision", errors);
  if (value.decimalDigits === undefined && value.binaryBits === undefined) {
    errors.push("result.provenance.numericContext.precision must declare decimalDigits or binaryBits.");
  }
  for (const field of ["decimalDigits", "binaryBits"] as const) {
    if (value[field] !== undefined && (!Number.isSafeInteger(value[field]) || (value[field] as number) <= 0)) {
      errors.push(`result.provenance.numericContext.precision.${field} must be a positive safe integer.`);
    }
  }
};

const validateTolerance = (value: unknown, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push("result.provenance.numericContext.tolerance must be an object.");
    return;
  }
  validateFields(value, TOLERANCE_FIELDS, "result.provenance.numericContext.tolerance", errors);
  if (value.absolute === undefined && value.relative === undefined) {
    errors.push("result.provenance.numericContext.tolerance must declare absolute or relative tolerance.");
  }
  for (const field of ["absolute", "relative"] as const) {
    if (value[field] !== undefined && (!Number.isFinite(value[field]) || (value[field] as number) < 0)) {
      errors.push(`result.provenance.numericContext.tolerance.${field} must be a non-negative finite number.`);
    }
  }
};

const validateProvenance = (value: unknown, status: unknown, errors: string[]): void => {
  if (!isRecord(value)) {
    errors.push("result.provenance must be an object.");
    return;
  }
  validateFields(value, PROVENANCE_FIELDS, "result.provenance", errors);
  if (!isScientificSourceGeneration(value.source)) {
    errors.push("result.provenance.source must be an exact scientific source generation.");
  }
  if (!isRecord(value.operation)) {
    errors.push("result.provenance.operation must be an object.");
  } else {
    validateFields(value.operation, OPERATION_FIELDS, "result.provenance.operation", errors);
    if (typeof value.operation.type !== "string" || !NAMESPACED_TYPE.test(value.operation.type)) {
      errors.push("result.provenance.operation.type must be a namespaced lowercase operation type.");
    }
    validateBoundedString(value.operation.algorithm, "result.provenance.operation.algorithm", errors, 160);
    validateBoundedString(value.operation.algorithmVersion, "result.provenance.operation.algorithmVersion", errors, 80);
    if (!isRecord(value.operation.parameters)) {
      errors.push("result.provenance.operation.parameters must be an object.");
    } else {
      validateCompactJson(value.operation.parameters as CanonicalJsonValue, "result.provenance.operation.parameters", errors);
      if (canonicalJsonByteLength(value.operation.parameters) > MAX_ANALYSIS_PARAMETERS_BYTES) {
        errors.push(`result.provenance.operation.parameters exceeds ${MAX_ANALYSIS_PARAMETERS_BYTES} bytes.`);
      }
    }
  }
  if (value.numericContext !== undefined) {
    if (!isRecord(value.numericContext)) {
      errors.push("result.provenance.numericContext must be an object when provided.");
    } else {
      validateFields(value.numericContext, NUMERIC_FIELDS, "result.provenance.numericContext", errors);
      if (value.numericContext.precision === undefined && value.numericContext.tolerance === undefined) {
        errors.push("result.provenance.numericContext must declare precision or tolerance.");
      }
      if (value.numericContext.precision !== undefined) validatePrecision(value.numericContext.precision, errors);
      if (value.numericContext.tolerance !== undefined) validateTolerance(value.numericContext.tolerance, errors);
    }
  } else if (status === "numerical") {
    errors.push("Numerical results must declare result.provenance.numericContext.");
  }
  if (!isRecord(value.engine)) {
    errors.push("result.provenance.engine must be an object.");
  } else {
    validateFields(value.engine, ENGINE_FIELDS, "result.provenance.engine", errors);
    validateBoundedString(value.engine.name, "result.provenance.engine.name", errors, 160);
    validateBoundedString(value.engine.version, "result.provenance.engine.version", errors, 80);
  }
  if (!Number.isFinite(value.elapsedMs) || (value.elapsedMs as number) < 0) {
    errors.push("result.provenance.elapsedMs must be a non-negative finite number.");
  }
};

const validateDiagnostics = (value: unknown, errors: string[]): void => {
  if (!Array.isArray(value)) {
    errors.push("result.diagnostics must be an array.");
    return;
  }
  if (value.length > 100) errors.push("result.diagnostics must contain at most 100 entries.");
  value.forEach((entry, index) => {
    const path = `result.diagnostics[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    validateFields(entry, DIAGNOSTIC_FIELDS, path, errors);
    validateBoundedString(entry.code, `${path}.code`, errors, 120);
    if (!(ANALYSIS_DIAGNOSTIC_SEVERITIES as readonly unknown[]).includes(entry.severity)) {
      errors.push(`${path}.severity must be one of: ${ANALYSIS_DIAGNOSTIC_SEVERITIES.join(", ")}.`);
    }
    validateBoundedString(entry.message, `${path}.message`, errors, 1_000);
    if (entry.path !== undefined) validateBoundedString(entry.path, `${path}.path`, errors, 300);
  });
};

const validateArtifacts = (value: unknown, errors: string[]): void => {
  if (!Array.isArray(value)) {
    errors.push("result.artifacts must be an array.");
    return;
  }
  if (value.length > 64) errors.push("result.artifacts must contain at most 64 handles.");
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const path = `result.artifacts[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }
    validateFields(entry, ARTIFACT_FIELDS, path, errors);
    if (typeof entry.artifactId !== "string" || !SAFE_ID.test(entry.artifactId)) {
      errors.push(`${path}.artifactId must be an ID-safe string of at most 160 characters.`);
    } else if (ids.has(entry.artifactId)) {
      errors.push(`${path}.artifactId '${entry.artifactId}' is duplicated.`);
    } else {
      ids.add(entry.artifactId);
    }
    if (!(ANALYSIS_ARTIFACT_KINDS as readonly unknown[]).includes(entry.kind)) {
      errors.push(`${path}.kind must be one of: ${ANALYSIS_ARTIFACT_KINDS.join(", ")}.`);
    }
    validateBoundedString(entry.role, `${path}.role`, errors, 120);
  });
};

export const normalizeAnalysisResultEnvelope = (
  value: unknown
): ValidationResult<AnalysisResultEnvelope> => {
  if (!isRecord(value)) return { ok: false, errors: ["Analysis result envelope must be an object."] };
  try {
    canonicalJsonStringify(value);
  } catch (error) {
    return { ok: false, errors: [`Analysis result envelope must be canonical JSON: ${String((error as Error).message ?? error)}`] };
  }

  const errors: string[] = [];
  validateFields(value, RESULT_FIELDS, "result", errors);
  if (value.schemaVersion !== ANALYSIS_RESULT_SCHEMA_VERSION) {
    errors.push(`result.schemaVersion must be ${ANALYSIS_RESULT_SCHEMA_VERSION}.`);
  }
  if (typeof value.resultId !== "string" || !SAFE_ID.test(value.resultId)) {
    errors.push("result.resultId must be an ID-safe string of at most 160 characters.");
  }
  if (!(ANALYSIS_RESULT_STATUSES as readonly unknown[]).includes(value.status)) {
    errors.push(`result.status must be one of: ${ANALYSIS_RESULT_STATUSES.join(", ")}.`);
  }
  validateProvenance(value.provenance, value.status, errors);
  if (!isRecord(value.summary)) {
    errors.push("result.summary must be an object.");
  } else {
    validateCompactJson(value.summary as CanonicalJsonValue, "result.summary", errors);
    if (canonicalJsonByteLength(value.summary) > MAX_ANALYSIS_SUMMARY_BYTES) {
      errors.push(`result.summary exceeds ${MAX_ANALYSIS_SUMMARY_BYTES} bytes.`);
    }
  }
  if (!Array.isArray(value.warnings)) {
    errors.push("result.warnings must be an array.");
  } else {
    if (value.warnings.length > 50) errors.push("result.warnings must contain at most 50 entries.");
    value.warnings.forEach((warning, index) => {
      if (typeof warning !== "string" || warning.length === 0 || warning.length > 500) {
        errors.push(`result.warnings[${index}] must be a non-empty string of at most 500 characters.`);
      }
    });
  }
  validateDiagnostics(value.diagnostics, errors);
  validateArtifacts(value.artifacts, errors);
  if (canonicalJsonByteLength(value) > MAX_ANALYSIS_RESULT_BYTES) {
    errors.push(`Analysis result envelope exceeds ${MAX_ANALYSIS_RESULT_BYTES} bytes.`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as AnalysisResultEnvelope };
};

export const createAnalysisResultEnvelope = (
  value: Omit<AnalysisResultEnvelope, "schemaVersion">
): AnalysisResultEnvelope => {
  const normalized = normalizeAnalysisResultEnvelope({
    schemaVersion: ANALYSIS_RESULT_SCHEMA_VERSION,
    ...value,
  });
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const isAnalysisResultCurrent = (
  result: AnalysisResultEnvelope,
  source: ScientificSourceGeneration
): boolean => matchesScientificSourceGeneration(result.provenance.source, source);

export type ScientificJobAnalysisPublication = Readonly<{
  resultId: string;
  status: AnalysisResultStatus;
  jobResult: ScientificJobResult;
  currentSource: ScientificSourceGeneration;
  algorithm: string;
  algorithmVersion: string;
  parameters: Readonly<Record<string, CanonicalJsonValue>>;
  numericContext?: AnalysisNumericContext;
  engine: AnalysisEngineProvenance;
  elapsedMs: number;
  summary: Readonly<Record<string, CanonicalJsonValue>>;
  warnings?: readonly string[];
  diagnostics?: readonly AnalysisDiagnostic[];
  artifacts?: readonly AnalysisArtifactHandle[];
}>;

/** Publishes explicit compact metadata only; jobResult.output is never copied implicitly. */
export const createAnalysisResultFromScientificJob = (
  value: ScientificJobAnalysisPublication
): AnalysisResultEnvelope => {
  const jobResult = value.jobResult as unknown;
  if (!isRecord(jobResult)) {
    throw new TypeError("Analysis publication requires a successful F05 scientific job result.");
  }
  const jobErrors: string[] = [];
  validateFields(jobResult, JOB_RESULT_FIELDS, "jobResult", jobErrors);
  if (jobResult.ok !== true || jobResult.schemaVersion !== 1) {
    jobErrors.push("jobResult must be a successful schema-v1 scientific job result.");
  }
  if (typeof jobResult.jobId !== "string" || !SAFE_ID.test(jobResult.jobId)) {
    jobErrors.push("jobResult.jobId must be an ID-safe string of at most 160 characters.");
  }
  if (typeof jobResult.operationType !== "string" || !NAMESPACED_TYPE.test(jobResult.operationType)) {
    jobErrors.push("jobResult.operationType must be a namespaced lowercase operation type.");
  }
  if (!isScientificSourceGeneration(jobResult.source)) {
    jobErrors.push("jobResult.source must be an exact scientific source generation.");
  }
  try {
    if (!("output" in jobResult)) throw new TypeError("output is required");
    const actualOutputBytes = canonicalJsonByteLength(jobResult.output);
    if (!Number.isSafeInteger(jobResult.outputBytes) || jobResult.outputBytes !== actualOutputBytes) {
      jobErrors.push("jobResult.outputBytes must equal the canonical UTF-8 output size.");
    }
  } catch (error) {
    jobErrors.push(`jobResult.output must be canonical JSON: ${String((error as Error).message ?? error)}.`);
  }
  if (jobErrors.length > 0) throw new TypeError(jobErrors.join(" "));
  if (!matchesScientificSourceGeneration(value.jobResult.source, value.currentSource)) {
    throw new TypeError("Scientific job result source is stale and cannot be published.");
  }
  return createAnalysisResultEnvelope({
    resultId: value.resultId,
    status: value.status,
    provenance: {
      source: value.jobResult.source,
      operation: {
        type: value.jobResult.operationType,
        algorithm: value.algorithm,
        algorithmVersion: value.algorithmVersion,
        parameters: value.parameters,
      },
      ...(value.numericContext === undefined ? {} : { numericContext: value.numericContext }),
      engine: value.engine,
      elapsedMs: value.elapsedMs,
    },
    summary: value.summary,
    warnings: value.warnings ?? [],
    diagnostics: value.diagnostics ?? [],
    artifacts: value.artifacts ?? [],
  });
};

/** Reads v1 strictly; only genuinely unversioned pre-F06 records become legacy/limited. */
export const normalizeAnalysisResultRecord = (
  value: unknown
): ValidationResult<AnalysisResultRecord> => {
  if (isRecord(value) && "schemaVersion" in value) {
    const normalized = normalizeAnalysisResultEnvelope(value);
    if (!normalized.ok) return normalized;
    return {
      ok: true,
      value: immutableCanonicalJsonClone({ kind: "versioned", result: normalized.value }) as AnalysisResultRecord,
    };
  }

  let displaySummary: Readonly<Record<string, CanonicalJsonValue>> | undefined;
  if (isRecord(value)) {
    try {
      canonicalJsonStringify(value);
      const compactErrors: string[] = [];
      validateCompactJson(value as CanonicalJsonValue, "legacy.displaySummary", compactErrors);
      if (compactErrors.length === 0 && canonicalJsonByteLength(value) <= MAX_ANALYSIS_SUMMARY_BYTES) {
        displaySummary = immutableCanonicalJsonClone(value) as Readonly<Record<string, CanonicalJsonValue>>;
      }
    } catch {
      // An unsafe legacy payload stays identifiable but is not copied into UI-sized state.
    }
  }
  return {
    ok: true,
    value: immutableCanonicalJsonClone({
      kind: "legacy-limited" as const,
      reason: "missing-provenance" as const,
      ...(displaySummary === undefined ? {} : { displaySummary }),
      warnings: ["Legacy result has no complete F06 provenance; scientific status is limited."],
    }) as LegacyLimitedAnalysisResult,
  };
};
