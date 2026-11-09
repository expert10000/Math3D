import { projectLineIntegralStatus, projectRegionResultStatus,
  type AnalysisResultEnvelope, type CanonicalJsonValue, type Math3DProject,
  type VectorField3DDocument } from "@math3d/core";

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
  const claim = theorem ? result.summary.state === "consistent" ? "Numerical theorem agreement" :
    result.summary.state === "mismatch" ? "Numerical theorem mismatch" :
      "Inconclusive numerical theorem check" : operation === "vector3d.line-integral" ?
    "Bounded numerical path integral" : "Bounded numerical region integral";
  const checkScope = theorem ?
    "Two numerical estimates were compared at the recorded resolution. This is not a symbolic theorem proof." :
    "No independent mathematical check is recorded; quadrature or sampling error remains possible.";
  const fields = theorem ? theoremFields : operation === "vector3d.line-integral" ? lineFields : regionFields;
  return { resultId: result.resultId, source: result.provenance.source, operation,
    selectionId: String(result.provenance.operation.parameters.selectionId ?? "unknown"),
    orientation: String(result.provenance.operation.parameters.orientation ?? result.summary.orientation ?? "undeclared"),
    method: result.provenance.operation.algorithm, claim, checkScope,
    unit: typeof result.summary.unit === "string" ? result.summary.unit : "undeclared",
    qualification: current ? "current" : "withheld", reason: status.reason,
    values: current ? selectedValues(result.summary, fields) : null };
}

/** Numeric export is available only when the exact source and saved selection qualify. */
export function vectorField3DResultEvidenceJson(evidence: VectorField3DResultEvidence): string {
  if (evidence.qualification !== "current" || !evidence.values)
    throw new TypeError(`Field result values withheld: ${evidence.reason ?? "unavailable"}`);
  return JSON.stringify({ format: "math3d.vectorfield3d-result-evidence.v1", ...evidence }, null, 2) + "\n";
}

const csvCell = (value: string | number | boolean | null): string => {
  const text = value === null ? "" : String(value);
  return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function vectorField3DResultEvidenceCsv(evidence: VectorField3DResultEvidence): string {
  if (evidence.qualification !== "current" || !evidence.values)
    throw new TypeError(`Field result values withheld: ${evidence.reason ?? "unavailable"}`);
  const rows: readonly [string, string | number | boolean | null][] = [
    ["result_id", evidence.resultId], ["source_document", evidence.source.documentId],
    ["source_revision", evidence.source.revision], ["source_generation", evidence.source.generation],
    ["source_hash", evidence.source.structuralHash], ["operation", evidence.operation],
    ["selection_id", evidence.selectionId], ["orientation", evidence.orientation],
    ["method", evidence.method], ["claim", evidence.claim], ["check_scope", evidence.checkScope],
    ["unit", evidence.unit], ["qualification", evidence.qualification],
    ...Object.entries(evidence.values).map(([key, value]) => [key, typeof value === "object" ?
      JSON.stringify(value) : value] as [string, string | number | boolean | null]),
  ];
  return ["field,value", ...rows.map(([field, value]) => `${csvCell(field)},${csvCell(value)}`)].join("\n") + "\n";
}
