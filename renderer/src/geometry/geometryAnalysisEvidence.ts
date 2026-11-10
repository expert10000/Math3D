import { qualifyGeometryAnalysisRecord, type GeometryAnalysisInspectorRecord } from "./analysisResultWorkflow";

/** A portable selected-record view; no raw geometry payload or unqualified statistics. */
export function createGeometryAnalysisEvidence(record: GeometryAnalysisInspectorRecord,
  currentSourceRevision: number | null) {
  const qualification = qualifyGeometryAnalysisRecord(record, currentSourceRevision);
  return {
    schema: "math3d.geometry-analysis-evidence/v1" as const,
    result: { id: record.id, key: record.resultKey, version: record.resultVersion,
      name: record.name, lifecycle: record.lifecycle },
    source: { objectId: record.sourceObjectId, objectName: record.sourceObjectName,
      recordedRevision: record.sourceRevision, currentRevision: currentSourceRevision },
    analysis: { kind: record.kind, domain: record.domain, quantity: record.quantity,
      method: record.method, units: record.units, precision: record.precision,
      sampling: record.sampling, engine: record.engine, parameters: record.parameters,
      requestedOutputs: record.requestedOutputs },
    assessment: { status: qualification.status, reason: qualification.reason,
      claim: "Producer-recorded Geometry analysis",
      independentCheck: "No independent mathematical check is recorded for this result.",
      omissions: qualification.valuesAvailable ? [] : ["statistics"] },
    statistics: qualification.valuesAvailable ? record.statistics : null,
    warnings: record.warnings,
  };
}

export type GeometryAnalysisEvidence = ReturnType<typeof createGeometryAnalysisEvidence>;

export function geometryAnalysisEvidenceJson(evidence: GeometryAnalysisEvidence): string {
  return JSON.stringify(evidence, null, 2) + "\n";
}

/** Two-column CSV carries the same qualified facts, with formula-like cells neutralized. */
export function geometryAnalysisEvidenceCsv(evidence: GeometryAnalysisEvidence): string {
  const rows: ReadonlyArray<readonly [string, unknown]> = [
    ["schema", evidence.schema], ["result.id", evidence.result.id],
    ["result.key", evidence.result.key], ["result.version", evidence.result.version],
    ["result.lifecycle", evidence.result.lifecycle],
    ["source.objectId", evidence.source.objectId],
    ["source.recordedRevision", evidence.source.recordedRevision],
    ["source.currentRevision", evidence.source.currentRevision],
    ["analysis.kind", evidence.analysis.kind], ["analysis.domain", evidence.analysis.domain],
    ["analysis.quantity", evidence.analysis.quantity], ["analysis.method", evidence.analysis.method],
    ["analysis.units", evidence.analysis.units], ["analysis.precision", evidence.analysis.precision],
    ["analysis.sampling", evidence.analysis.sampling], ["analysis.engine", evidence.analysis.engine],
    ["analysis.parameters", evidence.analysis.parameters],
    ["analysis.requestedOutputs", evidence.analysis.requestedOutputs],
    ["assessment.status", evidence.assessment.status], ["assessment.reason", evidence.assessment.reason],
    ["assessment.claim", evidence.assessment.claim],
    ["assessment.independentCheck", evidence.assessment.independentCheck],
    ["assessment.omissions", evidence.assessment.omissions],
    ["statistics", evidence.statistics], ["warnings", evidence.warnings],
  ];
  const cell = (value: unknown) => {
    const raw = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
    const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return ["field,value", ...rows.map(([key, value]) => `${cell(key)},${cell(value)}`)].join("\r\n") + "\r\n";
}
