import { structuralHash, isStructuralHash, type StructuralHash } from "./documentIdentity";
import type { Graph2DDocument } from "./graph2dDocument";
import type { Graph2DPointRow } from "./graph2dPointSeries";

export const GRAPH2D_PARAMETER_STUDY_CAPABILITY = "graph2d.parameter-study.v1" as const;
export const GRAPH2D_MAX_PARAMETER_STUDIES = 16;
export const GRAPH2D_PARAMETER_STUDY_MAX_SAMPLES = 256;
export type Graph2DParameterStudy = Readonly<{
  id: string; label: string; sourceObjectId: string; parameterName: string;
  range: Readonly<{ min: number; max: number; samples: number }>;
  measurement: Readonly<{ kind: "point-value"; x: number }>;
}>;
export type Graph2DParameterStudyOrigin = Readonly<{
  kind: "parameter-study/v1"; studyId: string; studyHash: StructuralHash;
  sourceFingerprint: StructuralHash; rowsSha256: StructuralHash;
}>;
export type Graph2DParameterStudyResult = Readonly<{
  studyId: string; studyHash: StructuralHash; sourceFingerprint: StructuralHash;
  rows: readonly Readonly<{ x: number; y: number }>[];
}>;
export type Graph2DParameterStudyStatus = Readonly<{ status: "current" | "withheld";
  reason: "study-missing" | "study-changed" | "source-missing" | "source-changed" |
    "samples-missing" | "samples-changed" | null }>;

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const isGraph2DParameterStudy = (value: unknown): value is Graph2DParameterStudy =>
  record(value) && exact(value, ["id", "label", "sourceObjectId", "parameterName", "range", "measurement"]) &&
  typeof value.id === "string" && /^study_[1-9][0-9]{0,5}$/.test(value.id) &&
  typeof value.label === "string" && value.label.length > 0 && value.label.length <= 160 &&
  value.label.trim() === value.label && typeof value.sourceObjectId === "string" &&
  value.sourceObjectId.length > 0 && value.sourceObjectId.length <= 160 &&
  typeof value.parameterName === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(value.parameterName) &&
  record(value.range) && exact(value.range, ["min", "max", "samples"]) &&
  finite(value.range.min) && finite(value.range.max) && value.range.min < value.range.max &&
  Math.abs(value.range.min) <= 1e6 && Math.abs(value.range.max) <= 1e6 &&
  Number.isSafeInteger(value.range.samples) && Number(value.range.samples) >= 2 &&
  Number(value.range.samples) <= GRAPH2D_PARAMETER_STUDY_MAX_SAMPLES &&
  record(value.measurement) && exact(value.measurement, ["kind", "x"]) &&
  value.measurement.kind === "point-value" && finite(value.measurement.x) &&
  Math.abs(value.measurement.x) <= 1e12;

export const isGraph2DParameterStudyOrigin = (value: unknown): value is Graph2DParameterStudyOrigin =>
  record(value) && exact(value, ["kind", "studyId", "studyHash", "sourceFingerprint", "rowsSha256"]) &&
  value.kind === "parameter-study/v1" && typeof value.studyId === "string" &&
  /^study_[1-9][0-9]{0,5}$/.test(value.studyId) && isStructuralHash(value.studyHash) &&
  isStructuralHash(value.sourceFingerprint) && isStructuralHash(value.rowsSha256);

export const isGraph2DParameterStudyResult = (value: unknown): value is Graph2DParameterStudyResult =>
  record(value) && exact(value, ["studyId", "studyHash", "sourceFingerprint", "rows"]) &&
  typeof value.studyId === "string" && /^study_[1-9][0-9]{0,5}$/.test(value.studyId) &&
  isStructuralHash(value.studyHash) && isStructuralHash(value.sourceFingerprint) &&
  Array.isArray(value.rows) && value.rows.length >= 2 &&
  value.rows.length <= GRAPH2D_PARAMETER_STUDY_MAX_SAMPLES &&
  (value.rows as unknown[]).every((row: unknown, index: number) => record(row) && exact(row, ["x", "y"]) &&
    finite(row.x) && finite(row.y) && (index === 0 ||
      record((value.rows as unknown[])[index - 1]) &&
      Number(((value.rows as unknown[])[index - 1] as Record<string, unknown>).x) < row.x));

/** A function or variable edit changes this fingerprint; adding the result row does not. */
export const graph2DParameterStudySourceFingerprint = (document: Graph2DDocument,
  study: Graph2DParameterStudy): StructuralHash | null => {
  const object = document.source.objects.find(item => item.id === study.sourceObjectId);
  const parameter = document.source.variables.find(item => item.name === study.parameterName);
  if (object?.kind !== "explicit-cartesian" || !parameter) return null;
  return structuralHash({ object, variables: document.source.variables });
};

export const graph2DParameterStudyStatus = (document: Graph2DDocument,
  origin: Graph2DParameterStudyOrigin, rows: readonly Graph2DPointRow[] | null): Graph2DParameterStudyStatus => {
  const study = document.source.parameterStudies?.find(item => item.id === origin.studyId);
  if (!study) return { status: "withheld", reason: "study-missing" };
  if (structuralHash(study) !== origin.studyHash)
    return { status: "withheld", reason: "study-changed" };
  const fingerprint = graph2DParameterStudySourceFingerprint(document, study);
  if (!fingerprint) return { status: "withheld", reason: "source-missing" };
  if (fingerprint !== origin.sourceFingerprint)
    return { status: "withheld", reason: "source-changed" };
  if (!rows) return { status: "withheld", reason: "samples-missing" };
  if (structuralHash(rows) !== origin.rowsSha256)
    return { status: "withheld", reason: "samples-changed" };
  return { status: "current", reason: null };
};

export const graph2DParameterStudyRows = (result: Graph2DParameterStudyResult): readonly Graph2DPointRow[] =>
  result.rows.map((row, index) => ({ id: `row_${index + 1}`, x: row.x, y: row.y }));

export const graph2DParameterStudyOrigin = (document: Graph2DDocument,
  result: Graph2DParameterStudyResult): Graph2DParameterStudyOrigin => {
  const study = document.source.parameterStudies?.find(item => item.id === result.studyId);
  if (!study || structuralHash(study) !== result.studyHash ||
      graph2DParameterStudySourceFingerprint(document, study) !== result.sourceFingerprint ||
      result.rows.length !== study.range.samples || result.rows.some(row => !finite(row.x) || !finite(row.y)))
    throw new TypeError("A current complete parameter study is required.");
  return { kind: "parameter-study/v1", studyId: study.id, studyHash: result.studyHash,
    sourceFingerprint: result.sourceFingerprint,
    rowsSha256: structuralHash(graph2DParameterStudyRows(result)) };
};

export const nextGraph2DParameterStudyId = (document: Graph2DDocument): string => {
  const used = new Set(document.source.parameterStudies?.map(item => item.id) ?? []);
  for (let serial = 1; serial <= 999999; serial++) if (!used.has(`study_${serial}`)) return `study_${serial}`;
  throw new TypeError("Parameter study ID limit reached.");
};
