import { createAnalysisResultFromScientificJob, type AnalysisResultEnvelope } from "./analysisResults";
import { immutableCanonicalJsonClone } from "./commands";
import type { CanonicalJsonValue } from "./documentIdentity";
import { validateComplexExpressionAst } from "./complexExpressionAst";
import type { ComplexAnalysisDocument, ComplexExpressionAst, ComplexPoint } from "./complexAnalysisDocument";
import {
  createScientificJobRequest,
  matchesScientificSourceGeneration,
  type ScientificJobLimits,
  type ScientificJobRequest,
  type ScientificJobResult,
  type ScientificSourceGeneration,
} from "./scientificJobs";
import type { ValidationResult } from "./validation";

export const COMPLEX_SAGE_ANALYSIS_OPERATION = "complex.sage-analysis" as const;
export const SAGE_COMPLEX_ANALYSIS_OPERATION = "sage.complex.analyze" as const;
export const COMPLEX_SAGE_PAYLOAD_FORMAT = "math3d.complex-sage-analysis-input" as const;
export const COMPLEX_SAGE_OUTPUT_FORMAT = "math3d.complex-sage-analysis-result" as const;
export const COMPLEX_SAGE_SCHEMA_VERSION = 1 as const;
export const COMPLEX_SAGE_ALGORITHM_VERSION = "sage-structured-complex-analysis@1" as const;

export const COMPLEX_SAGE_OPERATIONS = ["derivative", "limit", "poles", "residue", "series"] as const;
export type ComplexSageOperation = (typeof COMPLEX_SAGE_OPERATIONS)[number];

export type ComplexSagePayload = Readonly<{
  format: typeof COMPLEX_SAGE_PAYLOAD_FORMAT;
  schemaVersion: typeof COMPLEX_SAGE_SCHEMA_VERSION;
  operation: ComplexSageOperation;
  ast: ComplexExpressionAst;
  variable: "z";
  point: ComplexPoint | null;
  order: number | null;
  assumptions: readonly Readonly<{ target: string; predicate: string }>[];
}>;

export type ComplexSageOutput = Readonly<{
  format: typeof COMPLEX_SAGE_OUTPUT_FORMAT;
  schemaVersion: typeof COMPLEX_SAGE_SCHEMA_VERSION;
  operation: ComplexSageOperation;
  exact: true;
  value: string;
  latex: string;
  points: readonly Readonly<{ value: string; order: number; classification: "pole" | "removable" | "unknown" }>[];
  series: readonly Readonly<{ power: number; coefficient: string }>[];
  engine: Readonly<{ name: "SageMath"; version: string }>;
  algorithm: "sage-structured-complex-analysis";
  elapsedMs: number;
  diagnostics: readonly Readonly<{ code: string; message: string }>[];
}>;

const PAYLOAD_FIELDS = new Set(["format", "schemaVersion", "operation", "ast", "variable", "point", "order", "assumptions"]);
const OUTPUT_FIELDS = new Set(["format", "schemaVersion", "operation", "exact", "value", "latex", "points", "series", "engine", "algorithm", "elapsedMs", "diagnostics"]);
const POINT_FIELDS = new Set(["re", "im"]);
const OUTPUT_POINT_FIELDS = new Set(["value", "order", "classification"]);
const SERIES_FIELDS = new Set(["power", "coefficient"]);
const ENGINE_FIELDS = new Set(["name", "version"]);
const DIAGNOSTIC_FIELDS = new Set(["code", "message"]);
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactFields = (value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, errors: string[]) => {
  const unknown = Object.keys(value).filter((field) => !allowed.has(field)).sort();
  if (unknown.length) errors.push(`${path} contains unknown fields: ${unknown.join(", ")}.`);
  const missing = [...allowed].filter((field) => !(field in value));
  if (missing.length) errors.push(`${path} is missing fields: ${missing.join(", ")}.`);
};
const safeString = (value: unknown, maximum = 10_000): value is string => typeof value === "string" && value.length <= maximum;
const safeInteger = (value: unknown, minimum = 0, maximum = 64): value is number => Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;

export const normalizeComplexSagePayload = (value: unknown): ValidationResult<ComplexSagePayload> => {
  if (!isRecord(value)) return { ok: false, errors: ["Complex Sage payload must be an object."] };
  const errors: string[] = [];
  exactFields(value, PAYLOAD_FIELDS, "payload", errors);
  if (value.format !== COMPLEX_SAGE_PAYLOAD_FORMAT) errors.push(`payload.format must be '${COMPLEX_SAGE_PAYLOAD_FORMAT}'.`);
  if (value.schemaVersion !== COMPLEX_SAGE_SCHEMA_VERSION) errors.push(`payload.schemaVersion must be ${COMPLEX_SAGE_SCHEMA_VERSION}.`);
  if (!(COMPLEX_SAGE_OPERATIONS as readonly unknown[]).includes(value.operation)) errors.push("payload.operation is unsupported.");
  if (value.variable !== "z") errors.push("payload.variable must be 'z'.");
  const ast = validateComplexExpressionAst(value.ast, ["z"]);
  if (!ast.ok) errors.push(...ast.errors.map((error) => `payload.ast: ${error}`));
  if (value.point !== null) {
    if (!isRecord(value.point)) errors.push("payload.point must be a complex point or null.");
    else {
      exactFields(value.point, POINT_FIELDS, "payload.point", errors);
      if (!Number.isFinite(value.point.re) || !Number.isFinite(value.point.im)) errors.push("payload.point re/im must be finite.");
    }
  }
  if (value.order !== null && !safeInteger(value.order, 1, 32)) errors.push("payload.order must be null or an integer from 1 to 32.");
  if (["limit", "residue", "series"].includes(String(value.operation)) && value.point === null) errors.push(`payload.point is required for ${value.operation}.`);
  if (value.operation === "series" && value.order === null) errors.push("payload.order is required for series.");
  if (!Array.isArray(value.assumptions) || value.assumptions.length > 64) errors.push("payload.assumptions must be an array of at most 64 entries.");
  else value.assumptions.forEach((entry, index) => {
    if (!isRecord(entry) || Object.keys(entry).some((field) => !["target", "predicate"].includes(field)) || !safeString(entry.target, 80) || !safeString(entry.predicate, 80)) errors.push(`payload.assumptions[${index}] is invalid.`);
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as ComplexSagePayload };
};

const validateArrayRecords = (value: unknown, allowed: ReadonlySet<string>, path: string, errors: string[], check: (entry: Record<string, unknown>, itemPath: string) => void) => {
  if (!Array.isArray(value) || value.length > 256) { errors.push(`${path} must be an array of at most 256 entries.`); return; }
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(entry)) { errors.push(`${itemPath} must be an object.`); return; }
    exactFields(entry, allowed, itemPath, errors);
    check(entry, itemPath);
  });
};

export const normalizeComplexSageOutput = (value: unknown): ValidationResult<ComplexSageOutput> => {
  if (!isRecord(value)) return { ok: false, errors: ["Complex Sage output must be an object."] };
  const errors: string[] = [];
  exactFields(value, OUTPUT_FIELDS, "output", errors);
  if (value.format !== COMPLEX_SAGE_OUTPUT_FORMAT) errors.push(`output.format must be '${COMPLEX_SAGE_OUTPUT_FORMAT}'.`);
  if (value.schemaVersion !== COMPLEX_SAGE_SCHEMA_VERSION) errors.push(`output.schemaVersion must be ${COMPLEX_SAGE_SCHEMA_VERSION}.`);
  if (!(COMPLEX_SAGE_OPERATIONS as readonly unknown[]).includes(value.operation)) errors.push("output.operation is unsupported.");
  if (value.exact !== true) errors.push("output.exact must be true.");
  if (!safeString(value.value) || !safeString(value.latex)) errors.push("output.value and output.latex must be bounded strings.");
  validateArrayRecords(value.points, OUTPUT_POINT_FIELDS, "output.points", errors, (entry, path) => {
    if (!safeString(entry.value, 500) || !safeInteger(entry.order, 1, 64) || !["pole", "removable", "unknown"].includes(String(entry.classification))) errors.push(`${path} is invalid.`);
  });
  validateArrayRecords(value.series, SERIES_FIELDS, "output.series", errors, (entry, path) => {
    if (!safeInteger(entry.power, -32, 32) || !safeString(entry.coefficient, 500)) errors.push(`${path} is invalid.`);
  });
  if (!isRecord(value.engine)) errors.push("output.engine must be an object.");
  else {
    exactFields(value.engine, ENGINE_FIELDS, "output.engine", errors);
    if (value.engine.name !== "SageMath" || typeof value.engine.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/.test(value.engine.version)) errors.push("output.engine is invalid.");
  }
  if (value.algorithm !== "sage-structured-complex-analysis") errors.push("output.algorithm is invalid.");
  if (!Number.isFinite(value.elapsedMs) || (value.elapsedMs as number) < 0) errors.push("output.elapsedMs must be non-negative and finite.");
  validateArrayRecords(value.diagnostics, DIAGNOSTIC_FIELDS, "output.diagnostics", errors, (entry, path) => {
    if (!safeString(entry.code, 120) || !safeString(entry.message, 1000)) errors.push(`${path} is invalid.`);
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as ComplexSageOutput };
};

export const createComplexSagePayload = (args: { document: ComplexAnalysisDocument; operation: ComplexSageOperation; point?: ComplexPoint; order?: number }): ComplexSagePayload => {
  const candidate = {
    format: COMPLEX_SAGE_PAYLOAD_FORMAT,
    schemaVersion: COMPLEX_SAGE_SCHEMA_VERSION,
    operation: args.operation,
    ast: args.document.function.normalizedAst,
    variable: "z",
    point: args.point ?? null,
    order: args.order ?? null,
    assumptions: args.document.assumptions.map(({ target, predicate }) => ({ target, predicate })),
  };
  const normalized = normalizeComplexSagePayload(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const createComplexSageJobRequest = (args: { jobId: string; source: ScientificSourceGeneration; payload: ComplexSagePayload; limits: ScientificJobLimits }): ScientificJobRequest => createScientificJobRequest({
  jobId: args.jobId,
  source: args.source,
  operation: { type: COMPLEX_SAGE_ANALYSIS_OPERATION, payload: args.payload as unknown as CanonicalJsonValue },
  limits: args.limits,
});

export const publishComplexSageResult = (args: { jobResult: ScientificJobResult; currentSource: ScientificSourceGeneration; expectedPayload: ComplexSagePayload }): AnalysisResultEnvelope => {
  if (!matchesScientificSourceGeneration(args.jobResult.source, args.currentSource)) throw new TypeError("Complex Sage result is stale.");
  const output = normalizeComplexSageOutput(args.jobResult.output);
  if (!output.ok) throw new TypeError(output.errors.join(" "));
  if (output.value.operation !== args.expectedPayload.operation) throw new TypeError("Complex Sage output operation does not match the request.");
  return createAnalysisResultFromScientificJob({
    resultId: `complex-sage:${args.jobResult.jobId}`,
    status: "exact",
    jobResult: args.jobResult,
    currentSource: args.currentSource,
    algorithm: output.value.algorithm,
    algorithmVersion: COMPLEX_SAGE_ALGORITHM_VERSION,
    parameters: { operation: args.expectedPayload.operation, point: args.expectedPayload.point, order: args.expectedPayload.order },
    engine: output.value.engine,
    elapsedMs: output.value.elapsedMs,
    summary: { operation: output.value.operation, value: output.value.value, latex: output.value.latex, points: output.value.points, series: output.value.series },
    diagnostics: output.value.diagnostics.map((entry) => ({ code: entry.code, severity: "info", message: entry.message })),
  });
};
