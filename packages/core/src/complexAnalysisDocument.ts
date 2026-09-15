import { immutableCanonicalJsonClone } from "./commands";
import {
  canonicalJsonStringify,
  createDocumentIdentity,
  createStableDocumentId,
  isDocumentIdentity,
  structuralHash,
  type CanonicalJsonValue,
  type DocumentIdentity,
  type StableDocumentId,
  type StructuralHash,
} from "./documentIdentity";
import type { ValidationResult } from "./validation";
import { validateComplexExpressionAst, type ComplexExpressionVariable } from "./complexExpressionAst";

export const COMPLEX_ANALYSIS_DOCUMENT_FORMAT = "math3d.complex-analysis-document" as const;
export const COMPLEX_ANALYSIS_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const COMPLEX_EXPRESSION_AST_VERSION = 1 as const;

export type ComplexPoint = Readonly<{ re: number; im: number }>;
export type ComplexExpressionAst =
  | Readonly<{ type: "number"; value: number }>
  | Readonly<{ type: "constant"; name: "i" | "pi" | "e" }>
  | Readonly<{ type: "variable"; name: "z" | "u" | "v" }>
  | Readonly<{ type: "unary"; operator: "-"; argument: ComplexExpressionAst }>
  | Readonly<{ type: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: ComplexExpressionAst; right: ComplexExpressionAst }>
  | Readonly<{ type: "call"; name: "sin" | "cos" | "tan" | "exp" | "log" | "sqrt" | "abs"; argument: ComplexExpressionAst }>;

export type ComplexFunctionDefinition = Readonly<{
  sourceText: string;
  astVersion: typeof COMPLEX_EXPRESSION_AST_VERSION;
  normalizedAst: ComplexExpressionAst;
  allowedVariables: readonly ("z" | "u" | "v")[];
}>;

export type ComplexParameter = Readonly<{
  name: string;
  value: ComplexPoint;
}>;

export type ComplexAssumption = Readonly<{
  target: string;
  predicate: "nonzero" | "real" | "integer" | "positive" | "not-on-branch-cut";
}>;

export type ComplexDomain = Readonly<{
  re: Readonly<{ min: number; max: number }>;
  im: Readonly<{ min: number; max: number }>;
  exclusions: readonly ComplexPoint[];
}>;

export type ComplexSamplingPolicy = Readonly<{
  strategy: "uniform-grid" | "adaptive-grid";
  columns: number;
  rows: number;
  maximumSamples: number;
  tolerance: number;
}>;

export type ComplexContourRecord = Readonly<{
  contourId: string;
  kind: "circle" | "rectangle" | "annulus" | "polyline" | "freehand" | "segment" | "branch-loop" | "figure-eight" | "branch-cut-crossing";
  points: readonly ComplexPoint[];
  center: ComplexPoint | null;
  radius: number | null;
  innerRadius: number | null;
  closed: boolean;
  winding: number;
}>;

export type ComplexBranchPolicy = Readonly<{
  profile: "none" | "principal" | "log" | "sqrt" | "cube-root" | "sqrt-z2-minus-one" | "custom";
  cut: Readonly<{
    kind: "principal" | "negative-real-axis" | "positive-real-axis" | "radial" | "between-branch-points" | "custom-polyline";
    angleRadians: number | null;
    points: readonly ComplexPoint[];
  }>;
  includeInfinity: boolean;
  sheetCount: number;
  activeSheet: number;
}>;

export type ComplexCoveringDefinition = Readonly<{
  kind: "exp" | "power" | "log-inverse" | "sqrt-inverse";
  degree: number | null;
  fiberWindow: number;
  deckShift: number;
}>;

export type ComplexMobiusDefinition = Readonly<{
  a: ComplexPoint;
  b: ComplexPoint;
  c: ComplexPoint;
  d: ComplexPoint;
}>;

export type ComplexResultReference = Readonly<{
  resultId: string;
  resultType: string;
  sourceRevision: number;
  sourceHash: StructuralHash;
  state: "available" | "unavailable" | "legacy-limited";
}>;

export type ComplexDocumentDiagnostic = Readonly<{
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  action: string;
}>;

export type ComplexAnalysisDocument = Readonly<{
  format: typeof COMPLEX_ANALYSIS_DOCUMENT_FORMAT;
  schemaVersion: typeof COMPLEX_ANALYSIS_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  function: ComplexFunctionDefinition;
  parameters: readonly ComplexParameter[];
  assumptions: readonly ComplexAssumption[];
  domain: ComplexDomain;
  sampling: ComplexSamplingPolicy;
  contours: readonly ComplexContourRecord[];
  branchPolicy: ComplexBranchPolicy;
  covering: ComplexCoveringDefinition | null;
  mobius: ComplexMobiusDefinition | null;
  results: readonly ComplexResultReference[];
  provenance: Readonly<{
    origin: "native" | "legacy-adapter";
    sourceFormat: string;
    sourceVersion: number;
    diagnostics: readonly ComplexDocumentDiagnostic[];
  }>;
}>;

/** These values may be stored by UI code, but are never part of mathematical persistence. */
export type ComplexAnalysisTransientViewState = Readonly<{
  panelLayout: string;
  activeInspectorTab: string;
  animationProgress: number;
  hoveredEntity: string | null;
  dragPreview: Readonly<Record<string, CanonicalJsonValue>> | null;
}>;

export const COMPLEX_ANALYSIS_TRANSIENT_VIEW_FIELDS = Object.freeze([
  "panelLayout", "activeInspectorTab", "animationProgress", "hoveredEntity", "dragPreview",
] as const);

export type ComplexAnalysisStructuralSource = Pick<ComplexAnalysisDocument,
  "function" | "parameters" | "assumptions" | "domain" | "sampling" | "contours" | "branchPolicy" | "covering" | "mobius"
>;

const DOCUMENT_FIELDS = new Set(["format", "schemaVersion", "identity", "function", "parameters", "assumptions", "domain", "sampling", "contours", "branchPolicy", "covering", "mobius", "results", "provenance"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,79}$/;
const RESULT_TYPE = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const fields = (value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]) => {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key)).sort();
  if (extras.length) errors.push(`${path} contains unknown fields: ${extras.join(", ")}.`);
};
const stringValue = (value: unknown, path: string, errors: string[], maximum = 1_000): value is string => {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    errors.push(`${path} must be a non-empty string of at most ${maximum} characters.`);
    return false;
  }
  return true;
};
const point = (value: unknown, path: string, errors: string[]): value is ComplexPoint => {
  if (!isRecord(value)) { errors.push(`${path} must be a complex point.`); return false; }
  fields(value, ["re", "im"], path, errors);
  if (!finite(value.re) || !finite(value.im)) errors.push(`${path}.re and .im must be finite.`);
  return finite(value.re) && finite(value.im);
};
const points = (value: unknown, path: string, errors: string[]) => {
  if (!Array.isArray(value)) { errors.push(`${path} must be an array.`); return; }
  if (value.length > 10_000) errors.push(`${path} exceeds the 10,000 point limit.`);
  value.forEach((entry, index) => point(entry, `${path}[${index}]`, errors));
};

const validateStructuralSource = (value: Record<string, unknown>, errors: string[]): void => {
  const fn = value.function;
  if (!isRecord(fn)) errors.push("complex.function must be an object.");
  else {
    fields(fn, ["sourceText", "astVersion", "normalizedAst", "allowedVariables"], "complex.function", errors);
    stringValue(fn.sourceText, "complex.function.sourceText", errors, 10_000);
    if (fn.astVersion !== COMPLEX_EXPRESSION_AST_VERSION) errors.push(`complex.function.astVersion must be ${COMPLEX_EXPRESSION_AST_VERSION}.`);
    const allowedVariablesValid = Array.isArray(fn.allowedVariables) && !fn.allowedVariables.some((entry) => !["z", "u", "v"].includes(entry as string)) && new Set(fn.allowedVariables).size === fn.allowedVariables.length;
    if (!allowedVariablesValid) errors.push("complex.function.allowedVariables must be a unique array drawn from z, u, v.");
    const astValidation = validateComplexExpressionAst(fn.normalizedAst, allowedVariablesValid ? fn.allowedVariables as ComplexExpressionVariable[] : ["z", "u", "v"]);
    if (!astValidation.ok) errors.push(...astValidation.errors.map((error) => `complex.function.normalizedAst: ${error}`));
  }
  if (!Array.isArray(value.parameters)) errors.push("complex.parameters must be an array.");
  else value.parameters.forEach((entry, index) => {
    const path = `complex.parameters[${index}]`;
    if (!isRecord(entry)) { errors.push(`${path} must be an object.`); return; }
    fields(entry, ["name", "value"], path, errors);
    if (typeof entry.name !== "string" || !SAFE_NAME.test(entry.name)) errors.push(`${path}.name is invalid.`);
    point(entry.value, `${path}.value`, errors);
  });
  if (Array.isArray(value.parameters) && new Set(value.parameters.map((entry) => isRecord(entry) ? entry.name : null)).size !== value.parameters.length) errors.push("complex.parameters contains duplicate names.");
  if (!Array.isArray(value.assumptions)) errors.push("complex.assumptions must be an array.");
  else value.assumptions.forEach((entry, index) => {
    const path = `complex.assumptions[${index}]`;
    if (!isRecord(entry)) { errors.push(`${path} must be an object.`); return; }
    fields(entry, ["target", "predicate"], path, errors);
    stringValue(entry.target, `${path}.target`, errors, 80);
    if (!["nonzero", "real", "integer", "positive", "not-on-branch-cut"].includes(entry.predicate as string)) errors.push(`${path}.predicate is invalid.`);
  });
  const domain = value.domain;
  if (!isRecord(domain)) errors.push("complex.domain must be an object.");
  else {
    fields(domain, ["re", "im", "exclusions"], "complex.domain", errors);
    for (const axis of ["re", "im"] as const) {
      const range = domain[axis];
      if (!isRecord(range) || !finite(range.min) || !finite(range.max) || (range.min as number) >= (range.max as number)) errors.push(`complex.domain.${axis} must have finite min < max.`);
      else fields(range, ["min", "max"], `complex.domain.${axis}`, errors);
    }
    points(domain.exclusions, "complex.domain.exclusions", errors);
  }
  const sampling = value.sampling;
  if (!isRecord(sampling)) errors.push("complex.sampling must be an object.");
  else {
    fields(sampling, ["strategy", "columns", "rows", "maximumSamples", "tolerance"], "complex.sampling", errors);
    if (!["uniform-grid", "adaptive-grid"].includes(sampling.strategy as string)) errors.push("complex.sampling.strategy is invalid.");
    for (const key of ["columns", "rows", "maximumSamples"] as const) if (!positiveInteger(sampling[key])) errors.push(`complex.sampling.${key} must be a positive safe integer.`);
    if (!finite(sampling.tolerance) || (sampling.tolerance as number) <= 0) errors.push("complex.sampling.tolerance must be positive and finite.");
    if (positiveInteger(sampling.columns) && positiveInteger(sampling.rows) && positiveInteger(sampling.maximumSamples) && sampling.columns * sampling.rows > sampling.maximumSamples) errors.push("complex.sampling grid exceeds maximumSamples.");
  }
  if (!Array.isArray(value.contours)) errors.push("complex.contours must be an array.");
  else value.contours.forEach((entry, index) => {
    const path = `complex.contours[${index}]`;
    if (!isRecord(entry)) { errors.push(`${path} must be an object.`); return; }
    fields(entry, ["contourId", "kind", "points", "center", "radius", "innerRadius", "closed", "winding"], path, errors);
    if (typeof entry.contourId !== "string" || !SAFE_ID.test(entry.contourId)) errors.push(`${path}.contourId is invalid.`);
    if (!["circle", "rectangle", "annulus", "polyline", "freehand", "segment", "branch-loop", "figure-eight", "branch-cut-crossing"].includes(entry.kind as string)) errors.push(`${path}.kind is invalid.`);
    points(entry.points, `${path}.points`, errors);
    if (entry.center !== null) point(entry.center, `${path}.center`, errors);
    for (const key of ["radius", "innerRadius"] as const) if (entry[key] !== null && (!finite(entry[key]) || (entry[key] as number) <= 0)) errors.push(`${path}.${key} must be positive and finite or null.`);
    if (typeof entry.closed !== "boolean") errors.push(`${path}.closed must be boolean.`);
    if (!Number.isSafeInteger(entry.winding)) errors.push(`${path}.winding must be a safe integer.`);
  });
  const branch = value.branchPolicy;
  if (!isRecord(branch)) errors.push("complex.branchPolicy must be an object.");
  else {
    fields(branch, ["profile", "cut", "includeInfinity", "sheetCount", "activeSheet"], "complex.branchPolicy", errors);
    if (!["none", "principal", "log", "sqrt", "cube-root", "sqrt-z2-minus-one", "custom"].includes(branch.profile as string)) errors.push("complex.branchPolicy.profile is invalid.");
    if (typeof branch.includeInfinity !== "boolean") errors.push("complex.branchPolicy.includeInfinity must be boolean.");
    if (!positiveInteger(branch.sheetCount) || !Number.isSafeInteger(branch.activeSheet) || (branch.activeSheet as number) < 0 || (branch.activeSheet as number) >= (branch.sheetCount as number)) errors.push("complex.branchPolicy requires sheetCount > activeSheet >= 0.");
    if (!isRecord(branch.cut)) errors.push("complex.branchPolicy.cut must be an object.");
    else {
      fields(branch.cut, ["kind", "angleRadians", "points"], "complex.branchPolicy.cut", errors);
      if (!["principal", "negative-real-axis", "positive-real-axis", "radial", "between-branch-points", "custom-polyline"].includes(branch.cut.kind as string)) errors.push("complex.branchPolicy.cut.kind is invalid.");
      if (branch.cut.angleRadians !== null && !finite(branch.cut.angleRadians)) errors.push("complex.branchPolicy.cut.angleRadians must be finite or null.");
      points(branch.cut.points, "complex.branchPolicy.cut.points", errors);
    }
  }
  const covering = value.covering;
  if (covering !== null) {
    if (!isRecord(covering)) errors.push("complex.covering must be an object or null.");
    else {
      fields(covering, ["kind", "degree", "fiberWindow", "deckShift"], "complex.covering", errors);
      if (!["exp", "power", "log-inverse", "sqrt-inverse"].includes(covering.kind as string)) errors.push("complex.covering.kind is invalid.");
      if (covering.degree !== null && (!positiveInteger(covering.degree) || (covering.degree as number) < 2)) errors.push("complex.covering.degree must be an integer >= 2 or null.");
      if (!positiveInteger(covering.fiberWindow) || !Number.isSafeInteger(covering.deckShift)) errors.push("complex.covering fiberWindow/deckShift are invalid.");
    }
  }
  const mobius = value.mobius;
  if (mobius !== null) {
    if (!isRecord(mobius)) errors.push("complex.mobius must be an object or null.");
    else {
      fields(mobius, ["a", "b", "c", "d"], "complex.mobius", errors);
      for (const key of ["a", "b", "c", "d"] as const) point(mobius[key], `complex.mobius.${key}`, errors);
    }
  }
};

export const complexAnalysisStructuralSource = (document: ComplexAnalysisStructuralSource): ComplexAnalysisStructuralSource => ({
  function: document.function, parameters: document.parameters, assumptions: document.assumptions,
  domain: document.domain, sampling: document.sampling, contours: document.contours,
  branchPolicy: document.branchPolicy, covering: document.covering, mobius: document.mobius,
});

export const complexAnalysisSourceHash = (source: ComplexAnalysisStructuralSource): StructuralHash => structuralHash(complexAnalysisStructuralSource(source));

export const normalizeComplexAnalysisDocument = (value: unknown): ValidationResult<ComplexAnalysisDocument> => {
  if (!isRecord(value)) return { ok: false, errors: ["Complex Analysis document must be an object."] };
  try { canonicalJsonStringify(value); } catch (error) { return { ok: false, errors: [`Complex Analysis document must be canonical JSON: ${(error as Error).message}`] }; }
  const errors: string[] = [];
  fields(value, [...DOCUMENT_FIELDS], "complex", errors);
  if (value.format !== COMPLEX_ANALYSIS_DOCUMENT_FORMAT) errors.push(`complex.format must be '${COMPLEX_ANALYSIS_DOCUMENT_FORMAT}'.`);
  if (value.schemaVersion !== COMPLEX_ANALYSIS_DOCUMENT_SCHEMA_VERSION) errors.push(`complex.schemaVersion must be ${COMPLEX_ANALYSIS_DOCUMENT_SCHEMA_VERSION}.`);
  const identity = isDocumentIdentity(value.identity) ? value.identity : null;
  if (!identity) errors.push("complex.identity must be a valid versioned document identity.");
  validateStructuralSource(value, errors);
  if (identity && !errors.length && identity.structuralHash !== complexAnalysisSourceHash(value as unknown as ComplexAnalysisDocument)) errors.push("complex.identity.structuralHash does not match the mathematical source.");
  if (!Array.isArray(value.results)) errors.push("complex.results must be an array.");
  else value.results.forEach((entry, index) => {
    const path = `complex.results[${index}]`;
    if (!isRecord(entry)) { errors.push(`${path} must be an object.`); return; }
    fields(entry, ["resultId", "resultType", "sourceRevision", "sourceHash", "state"], path, errors);
    if (typeof entry.resultId !== "string" || !SAFE_ID.test(entry.resultId)) errors.push(`${path}.resultId is invalid.`);
    if (typeof entry.resultType !== "string" || !RESULT_TYPE.test(entry.resultType)) errors.push(`${path}.resultType must be namespaced.`);
    if (!positiveInteger(entry.sourceRevision)) errors.push(`${path}.sourceRevision must be positive.`);
    if (typeof entry.sourceHash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(entry.sourceHash)) errors.push(`${path}.sourceHash is invalid.`);
    if (!["available", "unavailable", "legacy-limited"].includes(entry.state as string)) errors.push(`${path}.state is invalid.`);
    if (identity && entry.state === "available" && (entry.sourceRevision !== identity.revision || entry.sourceHash !== identity.structuralHash)) errors.push(`${path} cannot be available for a different source generation.`);
  });
  const provenance = value.provenance;
  if (!isRecord(provenance)) errors.push("complex.provenance must be an object.");
  else {
    fields(provenance, ["origin", "sourceFormat", "sourceVersion", "diagnostics"], "complex.provenance", errors);
    if (!["native", "legacy-adapter"].includes(provenance.origin as string)) errors.push("complex.provenance.origin is invalid.");
    stringValue(provenance.sourceFormat, "complex.provenance.sourceFormat", errors, 120);
    if (!positiveInteger(provenance.sourceVersion)) errors.push("complex.provenance.sourceVersion must be positive.");
    if (!Array.isArray(provenance.diagnostics)) errors.push("complex.provenance.diagnostics must be an array.");
    else provenance.diagnostics.forEach((entry, index) => {
      const path = `complex.provenance.diagnostics[${index}]`;
      if (!isRecord(entry)) { errors.push(`${path} must be an object.`); return; }
      fields(entry, ["code", "severity", "message", "action"], path, errors);
      stringValue(entry.code, `${path}.code`, errors, 120); stringValue(entry.message, `${path}.message`, errors); stringValue(entry.action, `${path}.action`, errors);
      if (!["info", "warning", "error"].includes(entry.severity as string)) errors.push(`${path}.severity is invalid.`);
    });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: immutableCanonicalJsonClone(value) as ComplexAnalysisDocument };
};

export const createComplexAnalysisDocument = (
  source: ComplexAnalysisStructuralSource,
  options: { id?: StableDocumentId; stableKey?: CanonicalJsonValue; revision?: number; results?: readonly ComplexResultReference[]; provenance?: ComplexAnalysisDocument["provenance"] } = {}
): ComplexAnalysisDocument => {
  const canonicalSource = immutableCanonicalJsonClone(source) as ComplexAnalysisStructuralSource;
  const identity = createDocumentIdentity(options.id ?? createStableDocumentId("complex", options.stableKey ?? { function: source.function.sourceText }), canonicalSource, options.revision ?? 1);
  const candidate = { format: COMPLEX_ANALYSIS_DOCUMENT_FORMAT, schemaVersion: COMPLEX_ANALYSIS_DOCUMENT_SCHEMA_VERSION, identity, ...canonicalSource, results: options.results ?? [], provenance: options.provenance ?? { origin: "native", sourceFormat: COMPLEX_ANALYSIS_DOCUMENT_FORMAT, sourceVersion: COMPLEX_ANALYSIS_DOCUMENT_SCHEMA_VERSION, diagnostics: [] } };
  const normalized = normalizeComplexAnalysisDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const serializeComplexAnalysisDocument = (document: ComplexAnalysisDocument): string => {
  const normalized = normalizeComplexAnalysisDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return canonicalJsonStringify(normalized.value);
};

export const deserializeComplexAnalysisDocument = (serialized: string): ValidationResult<ComplexAnalysisDocument> => {
  try { return normalizeComplexAnalysisDocument(JSON.parse(serialized)); }
  catch (error) { return { ok: false, errors: [`Complex Analysis document JSON is invalid: ${(error as Error).message}`] }; }
};

export type LegacyComplexExpressionParser = (sourceText: string) => ValidationResult<ComplexExpressionAst>;
export type ComplexLegacyAdaptation = Readonly<{ document?: ComplexAnalysisDocument; diagnostics: readonly ComplexDocumentDiagnostic[] }>;

export const adaptLegacyComplexAnalysisState = (
  value: unknown,
  parseExpression: LegacyComplexExpressionParser,
  stableKey: CanonicalJsonValue = "legacy-complex-state"
): ComplexLegacyAdaptation => {
  const unsupported = (message: string): ComplexLegacyAdaptation => ({ diagnostics: [{ code: "complex.legacy.unsupported", severity: "error", message, action: "Open the legacy lab and re-enter or export its mathematical definition." }] });
  if (!isRecord(value)) return unsupported("Legacy Complex Analysis state must be an object; raw text or a compiled function is not mathematical authority.");
  if (value.format === COMPLEX_ANALYSIS_DOCUMENT_FORMAT) {
    const normalized = normalizeComplexAnalysisDocument(value);
    return normalized.ok ? { document: normalized.value, diagnostics: normalized.value.provenance.diagnostics } : unsupported(normalized.errors.join(" "));
  }
  const spec = isRecord(value.complexMapSpec) ? value.complexMapSpec : value;
  const sourceText = typeof spec.fExpr === "string" ? spec.fExpr : typeof value.functionExpression === "string" ? value.functionExpression : null;
  if (!sourceText) return unsupported("No supported legacy function expression was found; compiled JavaScript functions are intentionally not migrated.");
  const parsed = parseExpression(sourceText);
  if (!parsed.ok) return unsupported(`Legacy function expression could not be normalized: ${parsed.errors.join(" ")}`);
  const numberOr = (candidate: unknown, fallback: number) => finite(candidate) ? candidate : fallback;
  const columns = Math.max(2, Math.round(numberOr(spec.nu, 96)));
  const rows = Math.max(2, Math.round(numberOr(spec.nv, 96)));
  const diagnostic: ComplexDocumentDiagnostic = { code: "complex.legacy.adapted", severity: "warning", message: "Legacy lab state was converted to ComplexAnalysisDocument v1; transient layout, hover, drag, and animation state was omitted.", action: "Review branch and contour semantics, then save in the current format." };
  const source: ComplexAnalysisStructuralSource = {
    function: { sourceText, astVersion: 1, normalizedAst: parsed.value, allowedVariables: ["z", "u", "v"] }, parameters: [], assumptions: [],
    domain: { re: { min: numberOr(spec.uMin, -2), max: numberOr(spec.uMax, 2) }, im: { min: numberOr(spec.vMin, -2), max: numberOr(spec.vMax, 2) }, exclusions: [] },
    sampling: { strategy: "uniform-grid", columns, rows, maximumSamples: Math.max(columns * rows, 1_000_000), tolerance: 1e-8 }, contours: [],
    branchPolicy: { profile: "principal", cut: { kind: "principal", angleRadians: numberOr(spec.branchCutAngle, Math.PI), points: [] }, includeInfinity: false, sheetCount: Math.max(1, Math.round(numberOr(spec.sheetCount, 1))), activeSheet: Math.max(0, Math.round(numberOr(spec.sheetIndex, 0))) },
    covering: null, mobius: null,
  };
  if (source.branchPolicy.activeSheet >= source.branchPolicy.sheetCount) return unsupported("Legacy active sheet lies outside the declared sheet count.");
  return { document: createComplexAnalysisDocument(source, { stableKey, provenance: { origin: "legacy-adapter", sourceFormat: "math3d.complex-lab-state", sourceVersion: 1, diagnostics: [diagnostic] } }), diagnostics: [diagnostic] };
};
