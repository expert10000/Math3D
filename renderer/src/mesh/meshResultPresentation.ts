import type { MeshActiveAnalysisResultSummary } from "./activeAnalysisResult";
import type { MeshAnalysisMeshIdentity, MeshAnalysisResultKind } from "./analysisResultStore";
import type { MeshResultQualification } from "./meshResultQualification";

export type MeshResultEvidencePresentation = Readonly<{
  status: MeshResultQualification["status"] | "session-local";
  claim: string;
  independentCheck: string;
  reason: string;
  source: string;
}>;

export const presentMeshActiveAnalysisResult = (input: {
  summary: MeshActiveAnalysisResultSummary;
  qualification: MeshResultQualification;
  kind: MeshAnalysisResultKind | null;
  mesh: MeshAnalysisMeshIdentity | null;
}): { summary: MeshActiveAnalysisResultSummary; evidence: MeshResultEvidencePresentation } => {
  const { summary, qualification, kind, mesh } = input;
  const claim = summary.state === "Ready"
    ? `${summary.quantity} was computed on the represented Mesh using ${summary.method}.`
    : `${summary.quantity} has no completed numerical claim in this view.`;
  const source = mesh ? `${mesh.label} · ${mesh.revision} · ${mesh.vertexCount} vertices / ${mesh.faceCount} faces` : "No active Mesh generation";
  const independentCheck = "The Inspector checks result freshness and provenance; it does not independently prove numerical correctness.";
  if (!kind || (qualification.status === "unavailable" && summary.state === "Ready" &&
      qualification.reason === "No result is recorded for this Mesh and quantity.")) return {
    summary,
    evidence: { status: "session-local", claim, independentCheck,
      reason: "This view summarizes local Mesh display state without a matching kernel result record.", source },
  };
  const canShow = qualification.canUseCurrentValues && summary.state === "Ready";
  return {
    summary: canShow ? summary : {
      ...summary,
      state: qualification.status === "computing" || summary.state === "Running" ? "Running" : "Unavailable",
      statistics: [], percentiles: [], extrema: [], histogram: [], display: undefined, probe: undefined,
      warnings: [...new Set([...summary.warnings, qualification.reason])],
    },
    evidence: { status: qualification.status, claim: canShow ? claim : `${summary.quantity} is withheld as a current numerical result.`,
      independentCheck, reason: qualification.reason, source },
  };
};
