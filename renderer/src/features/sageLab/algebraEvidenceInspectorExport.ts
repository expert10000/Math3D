import type { Math3DProject, ProjectAlgebraEvidence } from "@math3d/core";
import { algebraEvidenceInspectorModel } from "./algebraEvidenceInspectorModel";

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
  }, null, 2) + "\n";
}
