import type { Math3DProject, ProjectAlgebraEvidence } from "@math3d/core";
import { algebraEvidenceInspectorModel } from "./algebraEvidenceInspectorModel";
import { createResultPublication, resultEvidenceRowsCsv } from "../../results/resultPublication";

export function algebraEvidencePublication(project: Math3DProject, evidence: ProjectAlgebraEvidence) {
  const model = algebraEvidenceInspectorModel(project, evidence);
  return createResultPublication({ module: "cas", resultId: evidence.id,
    source: { id: evidence.request.target.objectId, revision: evidence.request.target.revision,
      generation: null, hash: evidence.targetHash },
    sourceStatus: model.qualification.status,
    status: model.qualification.canUseResult ? "recorded" : "withheld",
    reason: model.qualification.reason,
    recordedClaim: "Sage output for the pinned operation and object revision.",
    independentCheck: "Only listed operation-specific checks apply; an execution certificate is not a mathematical proof.",
    summary: { operation: evidence.request.operation, outputSchema: evidence.request.outputSchema,
      resultHash: evidence.resultHash, result: evidence.result } });
}

/** A portable, explicitly qualified Inspector report, including the recorded Sage output. */
export function algebraEvidenceInspectorExportJson(project: Math3DProject,
  evidence: ProjectAlgebraEvidence): string {
  const model = algebraEvidenceInspectorModel(project, evidence);
  if (!model.qualification.canUseResult)
    throw new TypeError(`CAS evidence export withheld: ${model.qualification.reason}`);
  return JSON.stringify({
    format: "math3d.cas-algebra-evidence-inspector.v1",
    projectId: project.identity.id,
    resultId: evidence.id,
    qualification: model.qualification,
    recordedClaim: "Sage output for the pinned operation and object revision.",
    checkScope: "Only the listed operation-specific checks apply; an execution certificate is not a mathematical proof.",
    units: "Operation-defined algebraic values; physical units are not declared.",
    verification: { mode: model.mode, checks: model.checks },
    source: { target: evidence.request.target, definitionHash: evidence.targetHash },
    operation: evidence.request.operation,
    outputSchema: evidence.request.outputSchema,
    resultHash: evidence.resultHash,
    runtime: evidence.runtime,
    certificate: evidence.certificate ?? null,
    result: evidence.result,
    publication: algebraEvidencePublication(project, evidence),
  }, null, 2) + "\n";
}

export function algebraEvidenceInspectorExportCsv(project: Math3DProject,
  evidence: ProjectAlgebraEvidence): string {
  const publication = algebraEvidencePublication(project, evidence);
  if (publication.assessment.status !== "recorded")
    throw new TypeError(`CAS evidence export withheld: ${publication.assessment.reason}`);
  return resultEvidenceRowsCsv([
    ["resultId", evidence.id], ["sourceObjectId", publication.source.id],
    ["sourceRevision", publication.source.revision], ["sourceHash", publication.source.hash],
    ["sourceStatus", publication.assessment.sourceStatus], ["operation", evidence.request.operation],
    ["outputSchema", evidence.request.outputSchema], ["resultHash", evidence.resultHash],
    ["recordedClaim", publication.assessment.recordedClaim],
    ["independentCheck", publication.assessment.independentCheck], ["result", evidence.result],
  ]);
}
