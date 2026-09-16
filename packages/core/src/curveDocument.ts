import {
  advanceDocumentIdentity, canonicalJsonStringify, createDocumentIdentity,
  createStableDocumentId, defineDocumentFieldPolicy, isDocumentIdentity,
  type CanonicalJsonValue, type DocumentIdentity,
} from "./documentIdentity";
import type { ValidationResult } from "./validation";

export const CURVE_DOCUMENT_FORMAT = "math3d.curve-document" as const;
export const CURVE_DOCUMENT_SCHEMA_VERSION = 1 as const;

/** Structural inputs only: evaluated samples, frames, and plot series never enter this source. */
export type CurveDocumentSource = Readonly<{
  representation: "parametric" | "explicit" | "implicit" | "polar" | "bezier" | "b-spline" | "nurbs" | "polyline" | "curve-on-surface" | "derived";
  dimension: 2 | 3;
  domain: Readonly<{ parameter: string; min: number; max: number; closed: boolean; periodic: boolean }>;
  units: Readonly<{ position: string; parameter: string; angle: "rad" | "deg" }>;
  orientation: CanonicalJsonValue;
  derivatives: CanonicalJsonValue;
  definition: Readonly<{
    familyId: string;
    expressions?: Readonly<Record<string, string>>;
    settings?: Readonly<Record<string, number | string | boolean | null>>;
    sourceIds?: readonly string[];
    pointCount?: number;
    points?: readonly (readonly number[])[];
    controlPointCount?: number;
    controlPoints?: readonly (readonly number[])[];
    knots?: readonly number[];
    weights?: readonly number[];
    surfaceLink?: Readonly<{ surfaceId: string; surfaceRevision: number }>;
  }>;
  dependencies: CanonicalJsonValue;
}>;

export type CurveDocument = Readonly<{
  format: typeof CURVE_DOCUMENT_FORMAT;
  schemaVersion: typeof CURVE_DOCUMENT_SCHEMA_VERSION;
  identity: DocumentIdentity;
  source: CurveDocumentSource;
  metadata: Readonly<{ title: string; legacyCurveId: string | null; analysisSettings: CanonicalJsonValue }>;
  selection: Readonly<{ controlIds: readonly string[] }>;
}>;

export const CURVE_DOCUMENT_FIELD_POLICY = defineDocumentFieldPolicy({
  format: "persistent-metadata", schemaVersion: "persistent-metadata", identity: "persistent-metadata",
  source: "structural", metadata: "persistent-metadata", selection: "persistent-metadata",
});

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const fields = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const clone = <T>(value: T): T => JSON.parse(canonicalJsonStringify(value)) as T;
const finiteNumbers = (value: unknown): value is number[] => Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
const points = (value: unknown, dimension: number): boolean => Array.isArray(value) && value.every((entry) => finiteNumbers(entry) && (entry.length === 0 || entry.length === dimension));

export const normalizeCurveDocument = (value: unknown): ValidationResult<CurveDocument> => {
  const errors: string[] = [];
  if (!record(value) || value.format !== CURVE_DOCUMENT_FORMAT || value.schemaVersion !== 1) return { ok: false, errors: ["Unsupported Curve document."] };
  if (!fields(value, ["format", "schemaVersion", "identity", "source", "metadata", "selection"])) errors.push("Curve document contains unknown or missing fields.");
  if (!isDocumentIdentity(value.identity)) errors.push("Invalid Curve document identity.");
  const source = value.source;
  if (!record(source) || !fields(source, ["representation", "dimension", "domain", "units", "orientation", "derivatives", "definition", "dependencies"]) ||
      !["parametric", "explicit", "implicit", "polar", "bezier", "b-spline", "nurbs", "polyline", "curve-on-surface", "derived"].includes(String(source.representation)) ||
      (source.dimension !== 2 && source.dimension !== 3) || !record(source.domain) ||
      !fields(source.domain, ["parameter", "min", "max", "closed", "periodic"]) ||
      typeof source.domain.parameter !== "string" || !source.domain.parameter ||
      !Number.isFinite(source.domain.min) || !Number.isFinite(source.domain.max) || Number(source.domain.max) <= Number(source.domain.min) ||
      typeof source.domain.closed !== "boolean" || typeof source.domain.periodic !== "boolean" ||
      !record(source.units) || !fields(source.units, ["position", "parameter", "angle"]) ||
      typeof source.units.position !== "string" || !source.units.position || typeof source.units.parameter !== "string" || !source.units.parameter ||
      (source.units.angle !== "rad" && source.units.angle !== "deg") ||
      !record(source.definition) || !fields(source.definition, ["familyId"], ["expressions", "settings", "sourceIds", "pointCount", "points", "controlPointCount", "controlPoints", "knots", "weights", "surfaceLink"]) ||
      typeof source.definition.familyId !== "string" || !source.definition.familyId || !Array.isArray(source.dependencies)) errors.push("Invalid Curve source.");
  if (record(source) && record(source.definition)) {
    const detail = source.definition;
    if (detail.expressions !== undefined && (!record(detail.expressions) || Object.values(detail.expressions).some((entry) => typeof entry !== "string"))) errors.push("Invalid Curve expressions.");
    if (detail.settings !== undefined && (!record(detail.settings) || Object.values(detail.settings).some((entry) => entry !== null && !["number", "string", "boolean"].includes(typeof entry)))) errors.push("Invalid Curve settings.");
    if (detail.sourceIds !== undefined && (!Array.isArray(detail.sourceIds) || detail.sourceIds.some((entry: unknown) => typeof entry !== "string" || !entry))) errors.push("Invalid Curve source references.");
    if (detail.points !== undefined && !points(detail.points, Number(source.dimension))) errors.push("Invalid Curve points.");
    if (detail.controlPoints !== undefined && !points(detail.controlPoints, Number(source.dimension))) errors.push("Invalid Curve control points.");
    if (detail.knots !== undefined && !finiteNumbers(detail.knots)) errors.push("Invalid Curve knot vector.");
    if (detail.weights !== undefined && (!finiteNumbers(detail.weights) || detail.weights.some((entry) => entry <= 0))) errors.push("Invalid Curve weights.");
    for (const count of [detail.pointCount, detail.controlPointCount]) if (count !== undefined && (!Number.isSafeInteger(count) || Number(count) < 0)) errors.push("Invalid Curve point count.");
    if (detail.surfaceLink !== undefined && (!record(detail.surfaceLink) || !fields(detail.surfaceLink, ["surfaceId", "surfaceRevision"]) || typeof detail.surfaceLink.surfaceId !== "string" || !Number.isSafeInteger(detail.surfaceLink.surfaceRevision))) errors.push("Invalid Curve Surface link.");
  }
  if (!record(value.metadata) || !fields(value.metadata, ["title", "legacyCurveId", "analysisSettings"]) ||
      typeof value.metadata.title !== "string" || !(value.metadata.legacyCurveId === null || typeof value.metadata.legacyCurveId === "string")) errors.push("Invalid Curve metadata.");
  if (!record(value.selection) || !fields(value.selection, ["controlIds"]) || !Array.isArray(value.selection.controlIds) ||
      value.selection.controlIds.some((id: unknown) => typeof id !== "string" || !id) ||
      new Set(value.selection.controlIds).size !== value.selection.controlIds.length) errors.push("Invalid committed Curve control selection.");
  if (errors.length) return { ok: false, errors };
  try {
    const document = clone(value) as CurveDocument;
    if (document.identity.structuralHash !== createDocumentIdentity(document.identity.id, document.source, document.identity.revision).structuralHash) errors.push("Curve structural hash does not match source.");
    return errors.length ? { ok: false, errors } : { ok: true, value: document };
  } catch (error) { return { ok: false, errors: [String((error as Error).message ?? error)] }; }
};

export const createCurveDocument = (input: {
  source: CurveDocumentSource;
  identity?: DocumentIdentity;
  stableKey?: CanonicalJsonValue;
  metadata?: Partial<CurveDocument["metadata"]>;
  selection?: Partial<CurveDocument["selection"]>;
}): CurveDocument => {
  const source = clone(input.source);
  const candidate = {
    format: CURVE_DOCUMENT_FORMAT, schemaVersion: CURVE_DOCUMENT_SCHEMA_VERSION,
    identity: input.identity ?? createDocumentIdentity(createStableDocumentId("curve", input.stableKey ?? source), source),
    source,
    metadata: { title: input.metadata?.title ?? "Curve", legacyCurveId: input.metadata?.legacyCurveId ?? null, analysisSettings: input.metadata?.analysisSettings ?? {} },
    selection: { controlIds: [...(input.selection?.controlIds ?? [])] },
  };
  const normalized = normalizeCurveDocument(candidate);
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};

export const replaceCurveDocumentSource = (document: CurveDocument, source: CurveDocumentSource): CurveDocument =>
  createCurveDocument({ ...document, source, identity: advanceDocumentIdentity(document.identity, source) });
export const replaceCurveDocumentAnalysisSettings = (document: CurveDocument, analysisSettings: CanonicalJsonValue): CurveDocument =>
  createCurveDocument({ ...document, metadata: { ...document.metadata, analysisSettings } });
export const replaceCurveDocumentSelection = (document: CurveDocument, controlIds: readonly string[]): CurveDocument =>
  createCurveDocument({ ...document, selection: { controlIds } });
export const serializeCurveDocument = (document: CurveDocument): string => canonicalJsonStringify(document);
export const parseCurveDocument = (text: string): CurveDocument => {
  const normalized = normalizeCurveDocument(JSON.parse(text));
  if (!normalized.ok) throw new TypeError(normalized.errors.join(" "));
  return normalized.value;
};
