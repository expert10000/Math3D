import type { MeshActiveAnalysisResultSummary } from "./activeAnalysisResult";
import type { MeshAnalysisMeshIdentity, MeshAnalysisResult } from "./analysisResultStore";
import type { MeshResultEvidencePresentation } from "./meshResultPresentation";

/** A portable snapshot of the Inspector summary, without claiming independent certification. */
export const createMeshActiveResultEvidence = (input: {
  mesh: MeshAnalysisMeshIdentity | null;
  result: MeshAnalysisResult | null;
  summary: MeshActiveAnalysisResultSummary;
  presentation: MeshResultEvidencePresentation;
}) => {
  const { mesh, result, summary, presentation } = input;
  if (!mesh || (presentation.status === "unavailable" && !result)) return null;
  if (result && result.identity.key !== mesh.key) throw new TypeError("Mesh result evidence source generation does not match.");
  if (presentation.status === "current" && (!result || result.state !== "ready" || result.payload == null))
    throw new TypeError("Current Mesh evidence requires a completed recorded result.");
  if (presentation.status !== "current" && presentation.status !== "session-local" &&
      (summary.statistics.length || summary.percentiles.length || summary.extrema?.length || summary.histogram?.length || summary.display || summary.probe))
    throw new TypeError("Noncurrent Mesh evidence cannot contain numerical values.");
  return {
    format: "math3d.mesh-active-result-evidence/v1" as const,
    source: { meshId: mesh.meshId, revision: mesh.revision, sourceLabel: mesh.sourceLabel,
      label: mesh.label, vertexCount: mesh.vertexCount, faceCount: mesh.faceCount },
    result: result ? { kind: result.kind, variant: result.variant, state: result.state,
      version: result.resultVersion, parameterHash: result.parameterHash, parameters: result.parameters,
      dependencies: result.dependencies, backend: result.backend, computeTimeMs: result.computeTimeMs,
      updatedAt: result.updatedAt } : null,
    qualification: { status: presentation.status, reason: presentation.reason,
      mathematicalClaim: presentation.claim, independentCheck: presentation.independentCheck },
    summary: { category: summary.category, quantity: summary.quantity, state: summary.state,
      method: summary.method, domain: summary.domain, unit: summary.field?.unit ?? null,
      statistics: summary.statistics, percentiles: summary.percentiles,
      extrema: summary.extrema ?? [], histogram: summary.histogram ?? [],
      warnings: summary.warnings, provenance: summary.provenance },
  };
};

export type MeshActiveResultEvidence = NonNullable<ReturnType<typeof createMeshActiveResultEvidence>>;

const csvCell = (value: string | number | null): string => {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+@]/.test(raw) || /^-(?![0-9.])/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** Long-form Inspector summary; it never exports raw per-vertex or per-face arrays. */
export const meshActiveResultSummaryCsv = (evidence: MeshActiveResultEvidence): string => {
  const rows: Array<[string, string, string | number | null, string | null]> = [];
  const add = (section: string, label: string, value: string | number | null, unit: string | null = null) =>
    rows.push([section, label, value, unit]);
  add("source", "Mesh ID", evidence.source.meshId);
  add("source", "Revision", evidence.source.revision);
  add("source", "Label", evidence.source.label);
  add("source", "Source", evidence.source.sourceLabel);
  add("source", "Vertices", evidence.source.vertexCount);
  add("source", "Faces", evidence.source.faceCount);
  add("result", "Kind", evidence.result?.kind ?? "session-local");
  add("result", "Variant", evidence.result?.variant ?? null);
  add("result", "Version", evidence.result?.version ?? null);
  add("result", "Parameter hash", evidence.result?.parameterHash ?? null);
  add("result", "Backend", evidence.result?.backend ?? null);
  add("qualification", "Status", evidence.qualification.status);
  add("qualification", "Reason", evidence.qualification.reason);
  add("qualification", "Mathematical claim", evidence.qualification.mathematicalClaim);
  add("qualification", "Independent check", evidence.qualification.independentCheck);
  add("summary", "Quantity", evidence.summary.quantity);
  add("summary", "State", evidence.summary.state);
  add("summary", "Method", evidence.summary.method);
  add("summary", "Domain", evidence.summary.domain);
  add("summary", "Unit", evidence.summary.unit);
  for (const entry of evidence.summary.statistics) add("statistics", entry.label, entry.value, evidence.summary.unit);
  for (const entry of evidence.summary.percentiles) add("percentiles", entry.label, entry.value, evidence.summary.unit);
  for (const entry of evidence.summary.extrema) add("extrema", entry.label, entry.value, evidence.summary.unit);
  for (const [index, bin] of evidence.summary.histogram.entries()) {
    add("histogram", `Bin ${index + 1} minimum`, bin.min, evidence.summary.unit);
    add("histogram", `Bin ${index + 1} maximum`, bin.max, evidence.summary.unit);
    add("histogram", `Bin ${index + 1} count`, bin.count);
  }
  for (const warning of evidence.summary.warnings) add("warning", "Warning", warning);
  return ["section,label,value,unit", ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
};
