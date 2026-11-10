import { projectLineIntegralStatus, projectRegionResultStatus,
  type AnalysisResultEnvelope, type CanonicalJsonValue, type Math3DProject,
  type VectorField3DDocument } from "@math3d/core";
import { createResultPublication, resultEvidenceRowsCsv,
  type ResultPublication } from "../results/resultPublication";

export type VectorField3DResultEvidence = Readonly<{
  resultId: string;
  source: AnalysisResultEnvelope["provenance"]["source"];
  operation: string;
  selectionId: string;
  orientation: string;
  method: string;
  claim: string;
  checkScope: string;
  unit: string;
  qualification: "current" | "withheld";
  reason: string | null;
  values: Readonly<Record<string, CanonicalJsonValue>> | null;
  publication: ResultPublication<Readonly<Record<string, CanonicalJsonValue>>>;
}>;

const lineFields = ["state", "value", "errorEstimate", "coverage", "completedSegments",
  "segmentCount", "evaluations"] as const;
const regionFields = ["state", "value", "coverage", "resolution", "completedSamples",
  "evaluations"] as const;
const theoremFields = ["state", "boundaryValue", "interiorValue", "absoluteResidual",
  "relativeResidual", "resolution"] as const;

function selectedValues(summary: AnalysisResultEnvelope["summary"], fields: readonly string[]) {
  return Object.fromEntries(fields.filter(field => field in summary).map(field => [field, summary[field]!])) as
    Record<string, CanonicalJsonValue>;
}

/** Qualifies one saved record against the Project and the currently open Field document. */
export function vectorField3DResultEvidence(project: Math3DProject, result: AnalysisResultEnvelope,
  document: VectorField3DDocument): VectorField3DResultEvidence {
  const operation = result.provenance.operation.type;
  if (!["vector3d.line-integral", "vector3d.region-integral", "vector3d.theorem-check"].includes(operation))
    throw new TypeError(`Unsupported Field result: ${operation}`);
  const status = operation === "vector3d.line-integral" ? projectLineIntegralStatus(project, result, document) :
    projectRegionResultStatus(project, result, document);
  const current = status.status === "current";
  const theorem = operation === "vector3d.theorem-check";
  const claim = theorem ? !current ? "Numerical theorem comparison (outcome withheld)" :
    result.summary.state === "consistent" ? "Numerical theorem agreement" :
      result.summary.state === "mismatch" ? "Numerical theorem mismatch" :
        "Inconclusive numerical theorem check" : operation === "vector3d.line-integral" ?
    "Bounded numerical path integral" : "Bounded numerical region integral";
  const checkScope = theorem ?
    "Two numerical estimates were compared at the recorded resolution. This is not a symbolic theorem proof." :
    "No independent mathematical check is recorded; quadrature or sampling error remains possible.";
  const fields = theorem ? theoremFields : operation === "vector3d.line-integral" ? lineFields : regionFields;
  const values = selectedValues(result.summary, fields);
  const publication = createResultPublication({ module: "vector3d", resultId: result.resultId,
    source: { id: result.provenance.source.documentId, revision: result.provenance.source.revision,
      generation: result.provenance.source.generation,
      hash: result.provenance.source.structuralHash },
    sourceStatus: current ? "current" : status.reason ?? status.status,
    status: current ? "recorded" : "withheld",
    reason: current ? "The saved Field source and selection qualify this result." :
      status.reason ?? "The saved Field result is incomplete or unavailable.",
    recordedClaim: claim, independentCheck: checkScope, summary: values });
  return { resultId: result.resultId, source: result.provenance.source, operation,
    selectionId: String(result.provenance.operation.parameters.selectionId ?? "unknown"),
    orientation: String(result.provenance.operation.parameters.orientation ??
      (current ? result.summary.orientation : null) ?? "undeclared"),
    method: result.provenance.operation.algorithm, claim, checkScope,
    unit: typeof result.summary.unit === "string" ? result.summary.unit : "undeclared",
    qualification: current ? "current" : "withheld", reason: status.reason,
    values: publication.summary, publication };
}

/** Metadata remains exportable when values are withheld. */
export function vectorField3DResultEvidenceJson(evidence: VectorField3DResultEvidence): string {
  return JSON.stringify({ format: "math3d.vectorfield3d-result-evidence.v1", ...evidence }, null, 2) + "\n";
}

export function vectorField3DResultEvidenceCsv(evidence: VectorField3DResultEvidence): string {
  const rows: ReadonlyArray<readonly [string, unknown]> = [
    ["result_id", evidence.resultId], ["source_document", evidence.source.documentId],
    ["source_revision", evidence.source.revision], ["source_generation", evidence.source.generation],
    ["source_hash", evidence.source.structuralHash], ["operation", evidence.operation],
    ["selection_id", evidence.selectionId], ["orientation", evidence.orientation],
    ["method", evidence.method], ["claim", evidence.claim], ["check_scope", evidence.checkScope],
    ["unit", evidence.unit], ["qualification", evidence.qualification],
    ["reason", evidence.reason], ["publication.schema", evidence.publication.schema],
    ["publication.status", evidence.publication.assessment.status],
    ["publication.sourceStatus", evidence.publication.assessment.sourceStatus],
    ["publication.recordedClaim", evidence.publication.assessment.recordedClaim],
    ["publication.independentCheck", evidence.publication.assessment.independentCheck],
    ["publication.omissions", evidence.publication.assessment.omissions],
    ["values", evidence.values],
    ...Object.entries(evidence.values ?? {}).map(([key, value]) => [key, value] as const),
  ];
  return resultEvidenceRowsCsv(rows);
}
