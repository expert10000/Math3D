import { canonicalJsonStringify, structuralHash,
  VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
  type AnalysisResultEnvelope,
  type Math3DProject } from "@math3d/core";
import type { NotebookReference } from "@math3d/workbook";
import { inspectScientificSubrectangleReport,
  isScientificSubrectangle } from "./scientificSubrectangleWorkbook";
import type { ScientificChartField, ScientificProfile } from
  "./scientificSubrectangleChart";

type Inspection = Awaited<ReturnType<typeof inspectScientificSubrectangleReport>>;
type FieldStatistics = { count: number; gaps: number; mean: number | null;
  min: number | null; max: number | null };
type VerifiedField = { key: string; label: string; status: "verified";
  unit: string; statistics: FieldStatistics; sourceReferences: unknown[];
  sourceHashes: Record<string, unknown>;
  profiles: { column: ScientificProfile; row: ScientificProfile;
    columnGaps: number; rowGaps: number } };
type WithheldField = { key: string; label: string;
  status: "checking" | "missing" | "changed" | "error" };
type AuditBase = { schemaVersion: 1; kind: "scientific-subrectangle-audit";
  projectId: string; resultId: string };
export type ScientificSubrectangleAuditExport = AuditBase & ({
  verification: { status: "verified" | "partial"; checkedAt: string;
    resultHash: string; method: "source-and-profile-row-reverification" };
  source: AnalysisResultEnvelope["provenance"]["source"];
  region: unknown; bounds: unknown;
  algorithm: AnalysisResultEnvelope["provenance"]["operation"]["algorithm"];
  algorithmVersion: string; fields: Array<VerifiedField | WithheldField>;
} | { verification: { status: "withheld"; checkedAt: string;
  reason: string }; fields: WithheldField[] });

function sourceEvidence(result: AnalysisResultEnvelope, key: string):
  { sourceReferences: unknown[]; sourceHashes: Record<string, unknown> } {
  const p = result.provenance.operation.parameters;
  const vector = key === "vector" || key === "divergence" || key === "curlMagnitude";
  if (vector) return {
    sourceReferences: Array.isArray(p.vectorReferences) ? p.vectorReferences : [],
    sourceHashes: {
      document: result.provenance.source.structuralHash,
      vectorSamples: p.vectorSamples ?? null,
      ...(key === "divergence" || key === "curlMagnitude" ?
        { derivedSamples: p.derivedSamples ?? null } : {}) } };
  if (key === "scalar") return {
    sourceReferences: p.scalarReference ? [p.scalarReference] : [],
    sourceHashes: { scalarSampleSha256: p.scalarSampleSha256 ?? null } };
  return { sourceReferences: [p.realReference, p.imaginaryReference]
    .filter(reference => reference !== undefined && reference !== null),
    sourceHashes: { realSampleSha256: p.realSampleSha256 ?? null,
      imaginarySampleSha256: p.imaginarySampleSha256 ?? null } };
}

function statistics(result: AnalysisResultEnvelope, key: string):
  FieldStatistics | null {
  const value = result.summary[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  const optionalNumber = (item: unknown) => item === null ||
    typeof item === "number" && Number.isFinite(item);
  return typeof s.count === "number" && Number.isSafeInteger(s.count) &&
    typeof s.gaps === "number" && Number.isSafeInteger(s.gaps) &&
    optionalNumber(s.mean) && optionalNumber(s.min) && optionalNumber(s.max) ?
      s as FieldStatistics : null;
}

function auditField(result: AnalysisResultEnvelope, field: ScientificChartField):
  VerifiedField | WithheldField {
  const withheld = (status: WithheldField["status"]): WithheldField =>
    ({ key: field.key, label: field.label, status });
  if (field.status !== "source-current") return withheld(field.status);
  const column = field.column, row = field.row;
  const saved = statistics(result, field.key);
  if (!column || !row || !saved) return withheld("changed");
  return { key: field.key, label: field.label, status: "verified",
    unit: column.yUnit, statistics: saved, ...sourceEvidence(result, field.key),
    profiles: { column, row,
      columnGaps: column.rows.filter(item => item.y === null).length,
      rowGaps: row.rows.filter(item => item.y === null).length } };
}

/** A fresh inspection gates every numerical value; failed fields have status only. */
export async function createScientificSubrectangleAuditExport(project: Math3DProject,
  reference: NotebookReference,
  inspect: () => Promise<Inspection> = () =>
    inspectScientificSubrectangleReport(project, reference),
  now: () => Date = () => new Date()):
  Promise<ScientificSubrectangleAuditExport> {
  const base: AuditBase = { schemaVersion: 1,
    kind: "scientific-subrectangle-audit", projectId: project.identity.id,
    resultId: reference.targetId };
  try {
    const { result, chart } = await inspect();
    const expectedKeys = result.provenance.operation.type ===
      VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE ?
      ["vector", "scalar", "complexMagnitude", "complexPhase",
        "divergence", "curlMagnitude"] :
      ["vector", "divergence", "curlMagnitude"];
    if (!isScientificSubrectangle(result) ||
        result.resultId !== reference.targetId || chart.resultId !== result.resultId ||
        chart.sourceHash !== result.provenance.source.structuralHash ||
        canonicalJsonStringify(chart.bounds) !== canonicalJsonStringify(
          result.provenance.operation.parameters.bounds) ||
        canonicalJsonStringify(chart.fields.map(field => field.key)) !==
          canonicalJsonStringify(expectedKeys))
      throw new TypeError("The verified subrectangle does not match the Workbook reference.");
    const fields = chart.fields.map(field => auditField(result, field));
    const verified = fields.filter(field => field.status === "verified").length;
    if (!verified) return { ...base, verification: { status: "withheld",
      checkedAt: now().toISOString(), reason: "No source and profile rows verified." },
      fields: fields as WithheldField[] };
    return { ...base, verification: { status: verified === fields.length ?
      "verified" : "partial", checkedAt: now().toISOString(),
      resultHash: structuralHash(result),
      method: "source-and-profile-row-reverification" },
    source: result.provenance.source,
    region: result.provenance.operation.parameters.region,
    bounds: chart.bounds,
    algorithm: result.provenance.operation.algorithm,
    algorithmVersion: result.provenance.operation.algorithmVersion,
    fields };
  } catch (cause) {
    return { ...base, verification: { status: "withheld",
      checkedAt: now().toISOString(), reason: cause instanceof Error ?
        cause.message.slice(0, 500) : "Source or profile verification failed." },
      fields: [] };
  }
}

export function downloadScientificSubrectangleAuditExport(
  record: ScientificSubrectangleAuditExport): void {
  const body = `${JSON.stringify(record, null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `scientific-subrectangle-${record.resultId.replace(
    /[^a-zA-Z0-9_-]/g, "-")}.audit.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
