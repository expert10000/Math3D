import { qualifyGeometryAnalysisRecord, type GeometryAnalysisInspectorRecord } from "./analysisResultWorkflow";
import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";

/** A portable selected-record view; no raw geometry payload or unqualified statistics. */
export function createGeometryAnalysisEvidence(record: GeometryAnalysisInspectorRecord,
  currentSourceRevision: number | null) {
  const qualification = qualifyGeometryAnalysisRecord(record, currentSourceRevision);
  const publication = createResultPublication({ module: "geometry", resultId: record.id,
    source: { id: record.sourceObjectId, revision: record.sourceRevision,
      generation: null, hash: null },
    sourceStatus: qualification.status,
    status: qualification.valuesAvailable ? "recorded" : "withheld",
    reason: qualification.reason,
    recordedClaim: `${record.quantity} (${record.units}) by ${record.method}`,
    independentCheck: "No independent mathematical check is recorded for this result.",
    summary: record.statistics });
  return {
    schema: "math3d.geometry-analysis-evidence/v1" as const,
    publication,
    result: { id: record.id, key: record.resultKey, version: record.resultVersion,
      name: record.name, lifecycle: record.lifecycle },
    execution: { computeTimeMs: record.computeTimeMs, createdAt: record.createdAt,
      updatedAt: record.updatedAt, savedAt: record.savedAt },
    source: { objectId: record.sourceObjectId, objectName: record.sourceObjectName,
      recordedRevision: record.sourceRevision, currentRevision: currentSourceRevision },
    analysis: { kind: record.kind, domain: record.domain, quantity: record.quantity,
      method: record.method, units: record.units, precision: record.precision,
      sampling: record.sampling, engine: record.engine, parameters: record.parameters,
      requestedOutputs: record.requestedOutputs },
    assessment: { status: qualification.status, reason: qualification.reason,
      claim: "Producer-recorded Geometry analysis",
      independentCheck: "No independent mathematical check is recorded for this result.",
      sourceCheck: "Current Geometry object ID and revision checked in this session; this record does not retain a source content hash.",
      omissions: qualification.valuesAvailable ? [] : ["statistics"] },
    statistics: publication.summary,
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
    ["execution.computeTimeMs", evidence.execution.computeTimeMs],
    ["execution.createdAt", evidence.execution.createdAt],
    ["execution.updatedAt", evidence.execution.updatedAt],
    ["execution.savedAt", evidence.execution.savedAt],
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
    ["assessment.sourceCheck", evidence.assessment.sourceCheck],
    ["assessment.omissions", evidence.assessment.omissions],
    ["statistics", evidence.statistics], ["warnings", evidence.warnings],
    ["publication.schema", evidence.publication.schema],
    ["publication.status", evidence.publication.assessment.status],
    ["publication.sourceStatus", evidence.publication.assessment.sourceStatus],
    ["publication.recordedClaim", evidence.publication.assessment.recordedClaim],
    ["publication.independentCheck", evidence.publication.assessment.independentCheck],
  ];
  return resultEvidenceRowsCsv(rows);
}
