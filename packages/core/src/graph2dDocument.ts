import {
  canonicalJsonStringify, createDocumentIdentity, createStableDocumentId,
  defineDocumentFieldPolicy, isDocumentIdentity, structuralHash,
  type CanonicalJsonValue, type DocumentIdentity,
} from "./documentIdentity";
import type { ValidationResult } from "./validation";
import { parseGraph2DExpression, type Graph2DExpressionAst } from "./graph2dExpression";

export const GRAPH2D_DOCUMENT_FORMAT = "math3d.graph2d-document" as const;
export const GRAPH2D_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const GRAPH2D_EXPLICIT_CAPABILITY = "graph2d.explicit.v1" as const;
export const GRAPH2D_PARAMETRIC_CAPABILITY = "graph2d.parametric.v1" as const;
export const GRAPH2D_POLAR_CAPABILITY = "graph2d.polar.v1" as const;
export const GRAPH2D_IMPLICIT_CAPABILITY = "graph2d.implicit.v1" as const;
export const GRAPH2D_INEQUALITY_CAPABILITY = "graph2d.inequality.v1" as const;
export const GRAPH2D_OBJECT_KINDS = ["explicit-cartesian", "parametric", "polar", "implicit", "inequality", "point-series", "piecewise"] as const;
export type Graph2DObjectKind = (typeof GRAPH2D_OBJECT_KINDS)[number];
export const GRAPH2D_RESERVED_OBJECT_KINDS = GRAPH2D_OBJECT_KINDS.slice(1);
export const GRAPH2D_MAX_DOCUMENT_BYTES = 256 * 1024;
export const GRAPH2D_MAX_OBJECTS = 64;
export const GRAPH2D_MAX_EXPRESSION_LENGTH = 2048;

export type Graph2DDomain = Readonly<{ min: number; max: number; includeMin: boolean; includeMax: boolean }>;
export type Graph2DExplicitObject = Readonly<{
  id: string;
  kind: "explicit-cartesian";
  label: string;
  expression: Readonly<{ source: string; variable: "x"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
}>;
export type Graph2DParametricObject = Readonly<{
  id: string;
  kind: "parametric";
  label: string;
  xExpression: Readonly<{ source: string; variable: "t"; ast: Graph2DExpressionAst }>;
  yExpression: Readonly<{ source: string; variable: "t"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
}>;
export type Graph2DPolarObject = Readonly<{
  id: string;
  kind: "polar";
  label: string;
  rExpression: Readonly<{ source: string; variable: "theta"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
}>;
export type Graph2DImplicitObject = Readonly<{
  id: string;
  kind: "implicit";
  label: string;
  expression: Readonly<{ source: string; variable: "xy"; ast: Graph2DExpressionAst }>;
  domain: Graph2DDomain;
  yDomain: Graph2DDomain;
}>;
export type Graph2DInequalityClause = Readonly<{
  source: string;
  variable: "xy";
  ast: Graph2DExpressionAst;
  comparator: "<" | "<=" | ">" | ">=";
}>;
export type Graph2DInequalityObject = Readonly<{
  id: string;
  kind: "inequality";
  label: string;
  clauses: readonly Graph2DInequalityClause[];
  operator: "all" | "any";
  domain: Graph2DDomain;
  yDomain: Graph2DDomain;
}>;
export type Graph2DGraphObject = Graph2DExplicitObject | Graph2DParametricObject | Graph2DPolarObject |
  Graph2DImplicitObject | Graph2DInequalityObject;
export type Graph2DSource = Readonly<{
  objects: readonly Graph2DGraphObject[];
  variables: readonly Readonly<{ name: string; value: number }>[];
  assumptions: readonly string[];
}>;
export const graph2DRequiredCapabilities = (source: Graph2DSource): Graph2DDocument["requiredCapabilities"] =>
  [GRAPH2D_EXPLICIT_CAPABILITY,
    ...(source.objects.some((object) => object.kind === "parametric") ? [GRAPH2D_PARAMETRIC_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "polar") ? [GRAPH2D_POLAR_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "implicit") ? [GRAPH2D_IMPLICIT_CAPABILITY] : []),
    ...(source.objects.some((object) => object.kind === "inequality") ? [GRAPH2D_INEQUALITY_CAPABILITY] : [])];
export type Graph2DObjectDisplay = Readonly<{
  objectId: string;
  visible: boolean;
  color: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
}>;
export type Graph2DDisplay = Readonly<{
  viewport: Readonly<{ xMin: number; xMax: number; yMin: number; yMax: number; aspect: "free" | "equal" }>;
  axes: Readonly<{ x: boolean; y: boolean; grid: boolean; labels: boolean;
    gridMode?: "cartesian" | "polar" }>;
  objects: readonly Graph2DObjectDisplay[];
  sampling: Readonly<{ maxSamples: number; maxDepth: number; tolerancePx: number }>;
}>;
export type Graph2DProbe = Readonly<{ objectId: string; x: number; y: number; parameter?: number }>;
export type Graph2DSelection = Readonly<{ objectId: string | null; probe: Graph2DProbe | null }>;
export type Graph2DDocument = Readonly<{
  format: typeof GRAPH2D_DOCUMENT_FORMAT;
  schemaVersion: typeof GRAPH2D_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  requiredCapabilities: readonly (typeof GRAPH2D_EXPLICIT_CAPABILITY | typeof GRAPH2D_PARAMETRIC_CAPABILITY |
    typeof GRAPH2D_POLAR_CAPABILITY | typeof GRAPH2D_IMPLICIT_CAPABILITY | typeof GRAPH2D_INEQUALITY_CAPABILITY)[];
  source: Graph2DSource;
  display: Graph2DDisplay;
  selection: Graph2DSelection;
  metadata: Readonly<{ title: string }>;
}>;

export const GRAPH2D_DOCUMENT_FIELD_POLICY = defineDocumentFieldPolicy({
  format: "persistent-metadata", schemaVersion: "persistent-metadata", identity: "persistent-metadata",
  requiredCapabilities: "persistent-metadata", source: "structural", display: "persistent-display",
  selection: "persistent-metadata", metadata: "persistent-metadata",
});

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const bounded = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
const objectId = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
const variableName = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(value);
const integerWithin = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;
const validExpression = (value: unknown, variables: readonly string[], variable: "x" | "t" | "theta" | "xy" = "x"): boolean => {
  if (!record(value) || !exact(value, ["source", "variable", "ast"]) ||
      !bounded(value.source, GRAPH2D_MAX_EXPRESSION_LENGTH) || value.variable !== variable) return false;
  const parsed = parseGraph2DExpression(value.source, variables);
  if (!parsed.ok) return false;
  try { return canonicalJsonStringify(value.ast) === canonicalJsonStringify(parsed.ast); }
  catch { return false; }
};

const validDomain = (value: unknown): value is Graph2DDomain => record(value) &&
  exact(value, ["min", "max", "includeMin", "includeMax"]) && finite(value.min) && finite(value.max) &&
  value.min < value.max && typeof value.includeMin === "boolean" && typeof value.includeMax === "boolean";
const validObject = (value: unknown, variables: readonly string[]): value is Graph2DExplicitObject => record(value) &&
  exact(value, ["id", "kind", "label", "expression", "domain"]) && objectId(value.id) &&
  value.kind === "explicit-cartesian" && bounded(value.label, 160) && validExpression(value.expression, variables) && validDomain(value.domain);
const validParametricObject = (value: unknown, variables: readonly string[]): value is Graph2DParametricObject => record(value) &&
  exact(value, ["id", "kind", "label", "xExpression", "yExpression", "domain"]) && objectId(value.id) &&
  value.kind === "parametric" && bounded(value.label, 160) &&
  validExpression(value.xExpression, variables, "t") && validExpression(value.yExpression, variables, "t") &&
  validDomain(value.domain);
const validPolarObject = (value: unknown, variables: readonly string[]): value is Graph2DPolarObject => record(value) &&
  exact(value, ["id", "kind", "label", "rExpression", "domain"]) && objectId(value.id) &&
  value.kind === "polar" && bounded(value.label, 160) &&
  validExpression(value.rExpression, variables, "theta") && validDomain(value.domain);
const validImplicitObject = (value: unknown, variables: readonly string[]): value is Graph2DImplicitObject => record(value) &&
  exact(value, ["id", "kind", "label", "expression", "domain", "yDomain"]) && objectId(value.id) &&
  value.kind === "implicit" && bounded(value.label, 160) &&
  validExpression(value.expression, variables, "xy") && validDomain(value.domain) && validDomain(value.yDomain);
const validInequalityObject = (value: unknown, variables: readonly string[]): value is Graph2DInequalityObject => record(value) &&
  exact(value, ["id", "kind", "label", "clauses", "operator", "domain", "yDomain"]) && objectId(value.id) &&
  value.kind === "inequality" && bounded(value.label, 160) && ["all", "any"].includes(String(value.operator)) &&
  Array.isArray(value.clauses) && value.clauses.length >= 1 && value.clauses.length <= 8 &&
  value.clauses.every((clause: unknown) => record(clause) &&
    exact(clause, ["source", "variable", "ast", "comparator"]) &&
    ["<", "<=", ">", ">="].includes(String(clause.comparator)) &&
    validExpression({ source: clause.source, variable: clause.variable, ast: clause.ast }, variables, "xy")) &&
  validDomain(value.domain) && validDomain(value.yDomain);
const validSource = (value: unknown): value is Graph2DSource => {
  if (!record(value) || !exact(value, ["objects", "variables", "assumptions"]) || !Array.isArray(value.objects) ||
      value.objects.length > GRAPH2D_MAX_OBJECTS ||
      !Array.isArray(value.variables) || value.variables.length > 16 ||
      !value.variables.every((entry: unknown) => record(entry) && exact(entry, ["name", "value"]) && variableName(entry.name) &&
        entry.name !== "x" && finite(entry.value)) ||
      new Set(value.variables.map((entry: { name: string }) => entry.name)).size !== value.variables.length ||
      !Array.isArray(value.assumptions) || value.assumptions.length > 32 ||
      !value.assumptions.every((entry: unknown) => bounded(entry, 160))) return false;
  const names = value.variables.map((entry: { name: string }) => entry.name);
  if (names.includes("t") && value.objects.some((entry: Graph2DGraphObject) => entry.kind === "parametric")) return false;
  if (names.includes("theta") && value.objects.some((entry: Graph2DGraphObject) => entry.kind === "polar")) return false;
  if (names.includes("y") && value.objects.some((entry: Graph2DGraphObject) =>
    entry.kind === "implicit" || entry.kind === "inequality")) return false;
  return value.objects.every((entry: unknown) => validObject(entry, ["x", ...names]) ||
    validParametricObject(entry, ["t", ...names]) || validPolarObject(entry, ["theta", ...names]) ||
    validImplicitObject(entry, ["x", "y", ...names]) || validInequalityObject(entry, ["x", "y", ...names])) &&
    new Set(value.objects.map((entry: Graph2DGraphObject) => entry.id)).size === value.objects.length;
};
const validDisplay = (value: unknown, source: Graph2DSource): value is Graph2DDisplay => {
  if (!record(value) || !exact(value, ["viewport", "axes", "objects", "sampling"]) ||
      !record(value.viewport) || !exact(value.viewport, ["xMin", "xMax", "yMin", "yMax", "aspect"]) ||
      !finite(value.viewport.xMin) || !finite(value.viewport.xMax) || value.viewport.xMin >= value.viewport.xMax ||
      !finite(value.viewport.yMin) || !finite(value.viewport.yMax) || value.viewport.yMin >= value.viewport.yMax ||
      value.viewport.xMax - value.viewport.xMin < 1e-9 || value.viewport.xMax - value.viewport.xMin > 1e12 ||
      value.viewport.yMax - value.viewport.yMin < 1e-9 || value.viewport.yMax - value.viewport.yMin > 1e12 ||
      !["free", "equal"].includes(String(value.viewport.aspect)) ||
      !record(value.axes) || ![4, 5].includes(Object.keys(value.axes).length) ||
      !["x", "y", "grid", "labels"].every((key) => Object.prototype.hasOwnProperty.call(value.axes, key)) ||
      Object.keys(value.axes).some((key) => !["x", "y", "grid", "labels", "gridMode"].includes(key)) ||
      [value.axes.x, value.axes.y, value.axes.grid, value.axes.labels].some((item) => typeof item !== "boolean") ||
      (value.axes.gridMode !== undefined && !["cartesian", "polar"].includes(String(value.axes.gridMode))) ||
      !Array.isArray(value.objects) || value.objects.length !== source.objects.length ||
      !value.objects.every((item: unknown, index: number) => record(item) && exact(item, ["objectId", "visible", "color", "lineWidth", "lineStyle"]) &&
        item.objectId === source.objects[index]?.id && typeof item.visible === "boolean" &&
        typeof item.color === "string" && /^#[0-9a-fA-F]{6}$/.test(item.color) &&
        finite(item.lineWidth) && item.lineWidth >= 0.5 && item.lineWidth <= 12 &&
        ["solid", "dashed", "dotted"].includes(String(item.lineStyle))) ||
      !record(value.sampling) || !exact(value.sampling, ["maxSamples", "maxDepth", "tolerancePx"]) ||
      !integerWithin(value.sampling.maxSamples, 32, 200000) || !integerWithin(value.sampling.maxDepth, 1, 24) ||
      !finite(value.sampling.tolerancePx) || value.sampling.tolerancePx < 0.1 || value.sampling.tolerancePx > 16) return false;
  return true;
};
const validSelection = (value: unknown, source: Graph2DSource): value is Graph2DSelection => {
  if (!record(value) || !exact(value, ["objectId", "probe"])) return false;
  const ids = new Set(source.objects.map((entry) => entry.id));
  if (value.objectId !== null && (typeof value.objectId !== "string" || !ids.has(value.objectId))) return false;
  if (value.probe === null) return true;
  if (!record(value.probe) || ![3, 4].includes(Object.keys(value.probe).length) ||
    !["objectId", "x", "y"].every((key) => Object.prototype.hasOwnProperty.call(value.probe, key))) return false;
  const selected = source.objects.find((entry) => entry.id === value.objectId);
  const needsParameter = selected?.kind === "parametric" || selected?.kind === "polar";
  if (needsParameter !== Object.prototype.hasOwnProperty.call(value.probe, "parameter")) return false;
  return Object.keys(value.probe).every((key) => ["objectId", "x", "y", "parameter"].includes(key)) &&
    typeof value.probe.objectId === "string" && value.probe.objectId === value.objectId &&
    finite(value.probe.x) && finite(value.probe.y) &&
    (!needsParameter || finite(value.probe.parameter) && value.probe.parameter >= selected.domain.min &&
      value.probe.parameter <= selected.domain.max);
};

export const normalizeGraph2DDocument = (value: unknown): ValidationResult<Graph2DDocument> => {
  if (!record(value) || value.format !== GRAPH2D_DOCUMENT_FORMAT || value.schemaVersion !== GRAPH2D_DOCUMENT_SCHEMA_VERSION)
    return { ok: false, errors: ["Unsupported Graph2D document format or version."] };
  const errors: string[] = [];
  if (!exact(value, ["format", "schemaVersion", "identity", "requiredCapabilities", "source", "display", "selection", "metadata"]))
    errors.push("Graph2D document contains unknown or missing fields.");
  if (!isDocumentIdentity(value.identity) || !record(value.identity) ||
      !exact(value.identity, ["schemaVersion", "id", "revision", "structuralHash"]) ||
      !String(value.identity.id).startsWith("math3d:graph2d:")) errors.push("Invalid Graph2D identity.");
  const expectedCapabilities = validSource(value.source) ? graph2DRequiredCapabilities(value.source) :
    [GRAPH2D_EXPLICIT_CAPABILITY];
  if (!Array.isArray(value.requiredCapabilities) ||
      canonicalJsonStringify(value.requiredCapabilities) !== canonicalJsonStringify(expectedCapabilities))
    errors.push("Unsupported Graph2D required capabilities.");
  if (!validSource(value.source)) errors.push("Invalid Graph2D source or object list.");
  if (validSource(value.source) && !validDisplay(value.display, value.source)) errors.push("Invalid Graph2D display intent.");
  if (validSource(value.source) && !validSelection(value.selection, value.source)) errors.push("Invalid Graph2D selection or probe.");
  if (!record(value.metadata) || !exact(value.metadata, ["title"]) || !bounded(value.metadata.title, 160))
    errors.push("Invalid Graph2D metadata.");
  if (errors.length) return { ok: false, errors };
  try {
    const text = canonicalJsonStringify(value);
    if (new TextEncoder().encode(text).length > GRAPH2D_MAX_DOCUMENT_BYTES)
      return { ok: false, errors: ["Graph2D document exceeds size limit."] };
    const document = JSON.parse(text) as Graph2DDocument;
    if (document.identity.structuralHash !== structuralHash(document.source))
      return { ok: false, errors: ["Graph2D structural hash does not match source."] };
    return { ok: true, value: document };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

export const createGraph2DDocument = (input: {
  source: Graph2DSource;
  stableKey: CanonicalJsonValue;
  title?: string;
  identity?: DocumentIdentity;
  display?: Graph2DDisplay;
  selection?: Graph2DSelection;
}): Graph2DDocument => {
  const source = clone(input.source);
  const display = input.display ?? { viewport: { xMin: -10, xMax: 10, yMin: -10, yMax: 10, aspect: "equal" },
    axes: { x: true, y: true, grid: true, labels: true },
    objects: source.objects.map((object) => ({ objectId: object.id, visible: true, color: "#2563eb", lineWidth: 2, lineStyle: "solid" })),
    sampling: { maxSamples: 12000, maxDepth: 12, tolerancePx: 0.75 } };
  const candidate = {
    format: GRAPH2D_DOCUMENT_FORMAT, schemaVersion: GRAPH2D_DOCUMENT_SCHEMA_VERSION,
    identity: input.identity ?? createDocumentIdentity(createStableDocumentId("graph2d", input.stableKey), source),
    requiredCapabilities: graph2DRequiredCapabilities(source), source,
    display,
    selection: input.selection ?? { objectId: null, probe: null }, metadata: { title: input.title ?? "Graphs" },
  };
  const normalized = normalizeGraph2DDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const createEmptyGraph2DDocument = (stableKey: CanonicalJsonValue, title = "Graphs"): Graph2DDocument =>
  createGraph2DDocument({ source: { objects: [], variables: [], assumptions: [] }, stableKey, title });

export const serializeGraph2DDocument = (document: Graph2DDocument): string => {
  const normalized = normalizeGraph2DDocument(document);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return canonicalJsonStringify(normalized.value);
};
export const parseGraph2DDocument = (text: string): Graph2DDocument => {
  if (new TextEncoder().encode(text).length > GRAPH2D_MAX_DOCUMENT_BYTES) throw new TypeError("Graph2D document exceeds size limit.");
  const normalized = normalizeGraph2DDocument(JSON.parse(text));
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
