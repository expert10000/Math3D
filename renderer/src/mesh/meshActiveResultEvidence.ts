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
