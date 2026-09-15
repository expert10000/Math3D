import {
  createAnalysisResultFromScientificJob,
  type AnalysisArtifactHandle,
  type AnalysisResultEnvelope,
} from "./analysisResults";
import {
  normalizeExactSparseBoundaryMatrixArtifact,
  type ExactSparseBoundaryMatrixArtifact,
  type ExactSparseIntegerEntry,
} from "./canonicalFinite2DBoundaryMatrices";
import { immutableCanonicalJsonClone } from "./commands";
import { isStructuralHash, type StructuralHash } from "./documentIdentity";
import {
  createScientificJobRequest,
  matchesScientificSourceGeneration,
  type ScientificJobLimits,
  type ScientificJobRequest,
  type ScientificJobResult,
  type ScientificSourceGeneration,
} from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const TOPOLOGY_INTEGER_HOMOLOGY_OPERATION = "topology.integer-homology" as const;
export const SAGE_INTEGER_HOMOLOGY_PAYLOAD_FORMAT = "math3d.topology-integer-homology-input" as const;
export const SAGE_INTEGER_HOMOLOGY_OUTPUT_FORMAT = "math3d.topology-integer-homology-result" as const;
export const SAGE_INTEGER_HOMOLOGY_SCHEMA_VERSION = 1 as const;
export const SAGE_INTEGER_HOMOLOGY_ALGORITHM_VERSION = "sage-chain-complex-snf@1" as const;

export type SageIntegerHomologySparseMatrix = Readonly<{
  rows: number;
  columns: number;
  entries: readonly ExactSparseIntegerEntry[];
}>;

export type SageIntegerHomologyPayload = Readonly<{
  format: typeof SAGE_INTEGER_HOMOLOGY_PAYLOAD_FORMAT;
  schemaVersion: typeof SAGE_INTEGER_HOMOLOGY_SCHEMA_VERSION;
  canonicalHash: StructuralHash;
  matrixArtifactId: string;
  chainDimensions: readonly [number, number, number];
  boundary1: SageIntegerHomologySparseMatrix;
  boundary2: SageIntegerHomologySparseMatrix;
}>;

export type SageIntegerHomologyGroup = Readonly<{
  degree: 0 | 1 | 2;
  freeRank: number;
  torsionCoefficients: readonly string[];
  notation: string;
}>;

export type SageIntegerHomologyOutput = Readonly<{
  format: typeof SAGE_INTEGER_HOMOLOGY_OUTPUT_FORMAT;
  schemaVersion: typeof SAGE_INTEGER_HOMOLOGY_SCHEMA_VERSION;
  coefficientRing: "Z";
  canonicalHash: StructuralHash;
  matrixArtifactId: string;
  chainDimensions: readonly [number, number, number];
  groups: readonly [SageIntegerHomologyGroup, SageIntegerHomologyGroup, SageIntegerHomologyGroup];
  smithNormalForms: Readonly<{
    boundary1Diagonal: readonly string[];
    boundary2Diagonal: readonly string[];
  }>;
  engine: Readonly<{ name: "SageMath"; version: string }>;
  algorithm: "sage-chain-complex-smith-normal-form";
  elapsedMs: number;
  diagnostics: readonly Readonly<{ code: string; message: string }>[];
}>;

const PAYLOAD_FIELDS = new Set([
  "format", "schemaVersion", "canonicalHash", "matrixArtifactId", "chainDimensions", "boundary1", "boundary2",
]);
const MATRIX_FIELDS = new Set(["rows", "columns", "entries"]);
const ENTRY_FIELDS = new Set(["row", "column", "value"]);
const OUTPUT_FIELDS = new Set([
  "format", "schemaVersion", "coefficientRing", "canonicalHash", "matrixArtifactId", "chainDimensions",
  "groups", "smithNormalForms", "engine", "algorithm", "elapsedMs", "diagnostics",
]);
const GROUP_FIELDS = new Set(["degree", "freeRank", "torsionCoefficients", "notation"]);
const SMITH_FIELDS = new Set(["boundary1Diagonal", "boundary2Diagonal"]);
const ENGINE_FIELDS = new Set(["name", "version"]);
const DIAGNOSTIC_FIELDS = new Set(["code", "message"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const DECIMAL_INTEGER = /^-?(?:0|[1-9][0-9]*)$/;
const POSITIVE_DECIMAL_INTEGER = /^[1-9][0-9]*$/;
const SAFE_CODE = /^[a-z0-9][a-z0-9./-]{0,119}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const unknownFields = (value: Record<string, unknown>, allowed: ReadonlySet<string>): string[] =>
  Object.keys(value).filter((field) => !allowed.has(field)).sort();

const exactFields = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[]
): void => {
  const unknown = unknownFields(value, allowed);
  if (unknown.length > 0) errors.push(`${path} contains unknown fields: ${unknown.join(", ")}.`);
  const missing = [...allowed].filter((field) => !(field in value));
  if (missing.length > 0) errors.push(`${path} is missing fields: ${missing.join(", ")}.`);
};

const safeCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

const validateDimensions = (value: unknown, path: string, errors: string[]): value is readonly [number, number, number] => {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(safeCount)) {
    errors.push(`${path} must contain exactly three non-negative safe integers.`);
    return false;
  }
  return true;
};

const validateMatrix = (
  value: unknown,
  path: string,
  expectedRows: number | undefined,
  expectedColumns: number | undefined,
  errors: string[]
): value is SageIntegerHomologySparseMatrix => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  exactFields(value, MATRIX_FIELDS, path, errors);
  if (!safeCount(value.rows)) errors.push(`${path}.rows must be a non-negative safe integer.`);
  if (!safeCount(value.columns)) errors.push(`${path}.columns must be a non-negative safe integer.`);
  if (expectedRows !== undefined && value.rows !== expectedRows) errors.push(`${path}.rows does not match chainDimensions.`);
  if (expectedColumns !== undefined && value.columns !== expectedColumns) errors.push(`${path}.columns does not match chainDimensions.`);
  if (!Array.isArray(value.entries)) {
    errors.push(`${path}.entries must be an array.`);
    return false;
  }
  let previous: readonly [number, number] | null = null;
  const seen = new Set<string>();
  value.entries.forEach((entry, index) => {
    const entryPath = `${path}.entries[${index}]`;
    if (!isRecord(entry)) {
      errors.push(`${entryPath} must be an object.`);
      return;
    }
    exactFields(entry, ENTRY_FIELDS, entryPath, errors);
    if (!safeCount(entry.row) || (safeCount(value.rows) && entry.row >= value.rows)) errors.push(`${entryPath}.row is out of range.`);
    if (!safeCount(entry.column) || (safeCount(value.columns) && entry.column >= value.columns)) errors.push(`${entryPath}.column is out of range.`);
    if (typeof entry.value !== "string" || !DECIMAL_INTEGER.test(entry.value) || entry.value === "0" || entry.value === "-0") {
      errors.push(`${entryPath}.value must be a non-zero canonical decimal integer string.`);
    }
    const key = `${entry.row}:${entry.column}`;
    if (seen.has(key)) errors.push(`${entryPath} duplicates a sparse coordinate.`);
    if (
      previous && safeCount(entry.row) && safeCount(entry.column) &&
      (entry.row < previous[0] || (entry.row === previous[0] && entry.column <= previous[1]))
    ) errors.push(`${path}.entries must be strictly row-major ordered.`);
    seen.add(key);
    if (safeCount(entry.row) && safeCount(entry.column)) previous = [entry.row, entry.column];
  });
  return true;
};

export const normalizeSageIntegerHomologyPayload = (
  value: unknown
): ValidationResult<SageIntegerHomologyPayload> => {
  if (!isRecord(value)) return { ok: false, errors: ["Integer homology payload must be an object."] };
  const errors: string[] = [];
  exactFields(value, PAYLOAD_FIELDS, "payload", errors);
  if (value.format !== SAGE_INTEGER_HOMOLOGY_PAYLOAD_FORMAT) errors.push(`payload.format must be '${SAGE_INTEGER_HOMOLOGY_PAYLOAD_FORMAT}'.`);
  if (value.schemaVersion !== SAGE_INTEGER_HOMOLOGY_SCHEMA_VERSION) errors.push(`payload.schemaVersion must be ${SAGE_INTEGER_HOMOLOGY_SCHEMA_VERSION}.`);
  if (!isStructuralHash(value.canonicalHash)) errors.push("payload.canonicalHash is invalid.");
  if (typeof value.matrixArtifactId !== "string" || !SAFE_ID.test(value.matrixArtifactId)) errors.push("payload.matrixArtifactId is invalid.");
  const dimensionsValid = validateDimensions(value.chainDimensions, "payload.chainDimensions", errors);
  const dimensions = dimensionsValid
    ? value.chainDimensions as unknown as readonly [number, number, number]
    : undefined;
  validateMatrix(value.boundary1, "payload.boundary1", dimensions?.[0], dimensions?.[1], errors);
  validateMatrix(value.boundary2, "payload.boundary2", dimensions?.[1], dimensions?.[2], errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as SageIntegerHomologyPayload };
};

const compactMatrix = (matrix: ExactSparseBoundaryMatrixArtifact["boundary1"]): SageIntegerHomologySparseMatrix => ({
  rows: matrix.rows,
  columns: matrix.columns,
  entries: matrix.entries.map(({ row, column, value }) => ({ row, column, value })),
});

const validateBoundaryHandle = (handle: AnalysisArtifactHandle): void => {
  if (handle.kind !== "sparse-matrix" || handle.role !== "topology.cellular-boundary-d1-d2") {
    throw new TypeError("Integer homology requires the T06 cellular-boundary sparse-matrix artifact handle.");
  }
};

export const createSageIntegerHomologyPayload = (args: {
  boundaryMatrices: ExactSparseBoundaryMatrixArtifact;
  boundaryMatrixHandle: AnalysisArtifactHandle;
  currentSource: ScientificSourceGeneration;
}): SageIntegerHomologyPayload => {
  validateBoundaryHandle(args.boundaryMatrixHandle);
  const normalized = normalizeExactSparseBoundaryMatrixArtifact(args.boundaryMatrices);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const artifact = normalized.value;
  if (!matchesScientificSourceGeneration(artifact.source, args.currentSource)) {
    throw new TypeError("The boundary matrix artifact is stale for the current topology source.");
  }
  const payload = {
    format: SAGE_INTEGER_HOMOLOGY_PAYLOAD_FORMAT,
    schemaVersion: SAGE_INTEGER_HOMOLOGY_SCHEMA_VERSION,
    canonicalHash: artifact.canonicalHash,
    matrixArtifactId: args.boundaryMatrixHandle.artifactId,
    chainDimensions: [artifact.boundary1.rows, artifact.boundary1.columns, artifact.boundary2.columns],
    boundary1: compactMatrix(artifact.boundary1),
    boundary2: compactMatrix(artifact.boundary2),
  };
  const result = normalizeSageIntegerHomologyPayload(payload);
  if (!result.ok) throw new TypeError(result.errors.join(" "));
  return result.value;
};

export const createSageIntegerHomologyJobRequest = (args: {
  jobId: string;
  source: ScientificSourceGeneration;
  payload: SageIntegerHomologyPayload;
  limits: ScientificJobLimits;
}): ScientificJobRequest => createScientificJobRequest({
  jobId: args.jobId,
  source: args.source,
  operation: { type: TOPOLOGY_INTEGER_HOMOLOGY_OPERATION, payload: args.payload },
  limits: args.limits,
});

const validateDecimalList = (value: unknown, path: string, errors: string[], allowZero: boolean): void => {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || !(allowZero ? DECIMAL_INTEGER : POSITIVE_DECIMAL_INTEGER).test(entry)) {
      errors.push(`${path}[${index}] must be a canonical decimal integer string.`);
    }
  });
};

export const normalizeSageIntegerHomologyOutput = (
  value: unknown
): ValidationResult<SageIntegerHomologyOutput> => {
  if (!isRecord(value)) return { ok: false, errors: ["Integer homology output must be an object."] };
  const errors: string[] = [];
  exactFields(value, OUTPUT_FIELDS, "output", errors);
  if (value.format !== SAGE_INTEGER_HOMOLOGY_OUTPUT_FORMAT) errors.push(`output.format must be '${SAGE_INTEGER_HOMOLOGY_OUTPUT_FORMAT}'.`);
  if (value.schemaVersion !== SAGE_INTEGER_HOMOLOGY_SCHEMA_VERSION) errors.push(`output.schemaVersion must be ${SAGE_INTEGER_HOMOLOGY_SCHEMA_VERSION}.`);
  if (value.coefficientRing !== "Z") errors.push("output.coefficientRing must be 'Z'.");
  if (!isStructuralHash(value.canonicalHash)) errors.push("output.canonicalHash is invalid.");
  if (typeof value.matrixArtifactId !== "string" || !SAFE_ID.test(value.matrixArtifactId)) errors.push("output.matrixArtifactId is invalid.");
  validateDimensions(value.chainDimensions, "output.chainDimensions", errors);
  if (!Array.isArray(value.groups) || value.groups.length !== 3) {
    errors.push("output.groups must contain H0, H1, and H2 exactly once.");
  } else {
    value.groups.forEach((group, index) => {
      const path = `output.groups[${index}]`;
      if (!isRecord(group)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      exactFields(group, GROUP_FIELDS, path, errors);
      if (group.degree !== index) errors.push(`${path}.degree must be ${index}.`);
      if (!safeCount(group.freeRank)) errors.push(`${path}.freeRank must be a non-negative safe integer.`);
      validateDecimalList(group.torsionCoefficients, `${path}.torsionCoefficients`, errors, false);
      if (
        Array.isArray(group.torsionCoefficients) &&
        group.torsionCoefficients.some((item) =>
          typeof item === "string" && POSITIVE_DECIMAL_INTEGER.test(item) && BigInt(item) < 2n
        )
      ) {
        errors.push(`${path}.torsionCoefficients must contain invariant factors at least 2.`);
      }
      if (typeof group.notation !== "string" || group.notation.length === 0 || group.notation.length > 240) errors.push(`${path}.notation is invalid.`);
    });
  }
  if (!isRecord(value.smithNormalForms)) {
    errors.push("output.smithNormalForms must be an object.");
  } else {
    exactFields(value.smithNormalForms, SMITH_FIELDS, "output.smithNormalForms", errors);
    validateDecimalList(value.smithNormalForms.boundary1Diagonal, "output.smithNormalForms.boundary1Diagonal", errors, false);
    validateDecimalList(value.smithNormalForms.boundary2Diagonal, "output.smithNormalForms.boundary2Diagonal", errors, false);
  }
  if (!isRecord(value.engine)) {
    errors.push("output.engine must be an object.");
  } else {
    exactFields(value.engine, ENGINE_FIELDS, "output.engine", errors);
    if (value.engine.name !== "SageMath") errors.push("output.engine.name must be 'SageMath'.");
    if (typeof value.engine.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/.test(value.engine.version)) errors.push("output.engine.version is invalid.");
  }
  if (value.algorithm !== "sage-chain-complex-smith-normal-form") errors.push("output.algorithm is invalid.");
  if (typeof value.elapsedMs !== "number" || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0) errors.push("output.elapsedMs must be non-negative and finite.");
  if (!Array.isArray(value.diagnostics) || value.diagnostics.length > 50) {
    errors.push("output.diagnostics must be an array of at most 50 entries.");
  } else {
    value.diagnostics.forEach((entry, index) => {
      const path = `output.diagnostics[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${path} must be an object.`);
        return;
      }
      exactFields(entry, DIAGNOSTIC_FIELDS, path, errors);
      if (typeof entry.code !== "string" || !SAFE_CODE.test(entry.code)) errors.push(`${path}.code is invalid.`);
      if (typeof entry.message !== "string" || entry.message.length === 0 || entry.message.length > 500) errors.push(`${path}.message is invalid.`);
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as SageIntegerHomologyOutput };
};

export const publishSageIntegerHomologyResult = (args: {
  jobResult: ScientificJobResult;
  currentSource: ScientificSourceGeneration;
  expectedPayload: SageIntegerHomologyPayload;
  boundaryMatrixHandle: AnalysisArtifactHandle;
}): AnalysisResultEnvelope => {
  validateBoundaryHandle(args.boundaryMatrixHandle);
  if (args.jobResult.operationType !== TOPOLOGY_INTEGER_HOMOLOGY_OPERATION) {
    throw new TypeError("Scientific result is not a Topology integer-homology job.");
  }
  const normalized = normalizeSageIntegerHomologyOutput(args.jobResult.output);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  const output = normalized.value;
  if (output.canonicalHash !== args.expectedPayload.canonicalHash || output.matrixArtifactId !== args.expectedPayload.matrixArtifactId) {
    throw new TypeError("Sage output does not identify the requested canonical matrix artifact.");
  }
  if (output.chainDimensions.some((value, index) => value !== args.expectedPayload.chainDimensions[index])) {
    throw new TypeError("Sage output chain dimensions do not match the requested canonical complex.");
  }
  return createAnalysisResultFromScientificJob({
    resultId: `${args.currentSource.documentId}/result/homology-z/g${args.currentSource.generation}`,
    status: "exact",
    jobResult: args.jobResult,
    currentSource: args.currentSource,
    algorithm: "SageMath ChainComplex integer homology via Smith normal form",
    algorithmVersion: SAGE_INTEGER_HOMOLOGY_ALGORITHM_VERSION,
    parameters: {
      coefficientRing: "Z",
      canonicalHash: output.canonicalHash,
      matrixArtifactId: output.matrixArtifactId,
    },
    engine: output.engine,
    elapsedMs: output.elapsedMs,
    summary: {
      coefficientRing: output.coefficientRing,
      chainDimensions: [...output.chainDimensions],
      groups: output.groups.map((group) => ({
        degree: group.degree,
        freeRank: group.freeRank,
        torsionCoefficients: [...group.torsionCoefficients],
        notation: group.notation,
      })),
      smithNormalForms: output.smithNormalForms,
      canonicalHash: output.canonicalHash,
    },
    diagnostics: output.diagnostics.map((entry) => ({ ...entry, severity: "info" as const })),
    artifacts: [args.boundaryMatrixHandle],
  });
};
