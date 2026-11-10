import type { WorkbookSageEvidence, WorkbookSageFreshness } from "@math3d/workbook";
import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";

export function workbookSagePublication(evidence: WorkbookSageEvidence,
  freshness: WorkbookSageFreshness) {
  const selfContained = evidence.source.id.startsWith("sage-input:");
  const sourceCurrent = freshness === "current" || selfContained;
  const recorded = sourceCurrent && evidence.response.success;
  const sourceStatus = selfContained ? "self-contained saved input" : freshness;
  const reason = !sourceCurrent ? `Saved source is ${freshness}; rerun before using its result.` :
    evidence.response.success ? "Saved input and successful Sage response are recorded together." :
      `Sage execution failed: ${evidence.response.error ?? "no result was produced"}`;
  return createResultPublication({ module: "workbook",
    resultId: evidence.request.jobId ?? `${evidence.source.id}:${evidence.savedAt}`,
    source: { id: evidence.source.id, revision: evidence.source.revision,
      generation: null, hash: evidence.source.fingerprint },
    sourceStatus, status: recorded ? "recorded" : "withheld", reason,
    recordedClaim: `${evidence.request.operation} returned a SageMath result for the saved input.`,
    independentCheck: "Workbook compares the saved source identity; it does not independently prove the SageMath result.",
    summary: { operation: evidence.request.operation, result: evidence.response.result,
      latex: evidence.response.latex, warnings: evidence.response.warnings,
      engine: evidence.engine } });
}

export function workbookSageEvidenceJson(evidence: WorkbookSageEvidence,
  freshness: WorkbookSageFreshness): string {
  const publication = workbookSagePublication(evidence, freshness);
  const recorded = publication.assessment.status === "recorded";
  return JSON.stringify({ format: "math3d.workbook-sage-evidence/v1",
    source: evidence.source, request: evidence.request, engine: evidence.engine,
    savedAt: evidence.savedAt, response: recorded ? evidence.response : {
      success: evidence.response.success, error: evidence.response.error ?? null,
      errorCode: evidence.response.errorCode ?? null },
    diagnostics: recorded ? evidence.diagnostics : [], publication }, null, 2) + "\n";
}

export function workbookSageEvidenceCsv(evidence: WorkbookSageEvidence,
  freshness: WorkbookSageFreshness): string {
  const publication = workbookSagePublication(evidence, freshness);
  return resultEvidenceRowsCsv([
    ["resultId", publication.resultId], ["sourceId", publication.source.id],
    ["sourceRevision", publication.source.revision], ["sourceFingerprint", publication.source.hash],
    ["sourceStatus", publication.assessment.sourceStatus],
    ["publicationStatus", publication.assessment.status],
    ["operation", evidence.request.operation], ["backend", evidence.engine.backend],
    ["recordedClaim", publication.assessment.recordedClaim],
    ["independentCheck", publication.assessment.independentCheck],
    ["result", publication.summary?.result ?? null],
    ["latex", publication.summary?.latex ?? null],
    ["error", evidence.response.success ? null : evidence.response.error ?? null],
  ]);
}
