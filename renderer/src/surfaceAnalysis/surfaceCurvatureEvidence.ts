import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";
import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload } from "./contracts";
import type { SurfaceAnalysisResult } from "./infrastructure";
import type { SurfaceResultPresentation } from "./surfaceResultPresentation";

/** Exact sampled field is included only while its Surface dependency qualifies. */
export function createSurfaceCurvatureEvidence(input: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload>;
  qualification: SurfaceResultPresentation;
}) {
  const { definition, result, qualification } = input;
  const payload = result.payload;
  if (result.kind !== "curvature-field" || payload?.data.kind !== "curvature" ||
      payload.surfaceId !== result.identity.surfaceId ||
      payload.surfaceRevision !== result.identity.surfaceRevision ||
      qualification.status === "unavailable")
    throw new TypeError("Curvature evidence requires a matching Surface result.");
  const current = qualification.status === "current" && qualification.canUseCurrentValues &&
    definition.identity.key === result.identity.key;
  const field = payload.data;
  const publication = createResultPublication({ module: "surface",
    resultId: `${result.identity.key}:curvature-field:v${result.resultVersion}`,
    source: { id: result.identity.key, revision: result.identity.surfaceRevision,
      generation: null, hash: current ? definition.fingerprint : null },
    sourceStatus: qualification.status, status: current ? "recorded" : "withheld",
    reason: qualification.reason, recordedClaim: qualification.claim,
    independentCheck: qualification.verification,
    summary: { sampleCount: field.sampleCount, validDomainCount: field.validDomainCount,
      classificationCounts: field.classificationCounts, statistics: field.statistics,
      units: field.units } });
  return { format: "math3d.surface-curvature-evidence/v1" as const,
    source: { identity: result.identity, fingerprint: publication.source.hash,
      representation: payload.representation, units: payload.units, orientation: payload.orientation },
    result: { kind: result.kind, variant: result.variant, version: result.resultVersion,
      state: result.state, method: payload.method, backend: result.backend,
      parameters: result.parameters, dependencies: result.dependencies },
    qualification: { status: qualification.status, claim: qualification.claim,
      independentCheck: qualification.verification, reason: qualification.reason },
    warnings: payload.warnings, field: current ? field : null, publication };
}

export type SurfaceCurvatureEvidence = ReturnType<typeof createSurfaceCurvatureEvidence>;

export const surfaceCurvatureEvidenceJson = (evidence: SurfaceCurvatureEvidence): string =>
  JSON.stringify(evidence, (_key, value) => ArrayBuffer.isView(value)
    ? Array.from(value as unknown as ArrayLike<number>) : value, 2) + "\n";

/** Compact statistics, counts and units; no per-sample arrays. */
export const surfaceCurvatureEvidenceCsv = (evidence: SurfaceCurvatureEvidence): string =>
  resultEvidenceRowsCsv([
    ["resultId", evidence.publication.resultId], ["sourceId", evidence.publication.source.id],
    ["sourceRevision", evidence.publication.source.revision],
    ["sourceFingerprint", evidence.publication.source.hash],
    ["sourceStatus", evidence.publication.assessment.sourceStatus],
    ["publicationStatus", evidence.publication.assessment.status],
    ["recordedClaim", evidence.publication.assessment.recordedClaim],
    ["independentCheck", evidence.publication.assessment.independentCheck],
    ["sampleCount", evidence.publication.summary?.sampleCount ?? null],
    ["validDomainCount", evidence.publication.summary?.validDomainCount ?? null],
    ["classificationCounts", evidence.publication.summary?.classificationCounts ?? null],
    ["statistics", evidence.publication.summary?.statistics ?? null],
    ["units", evidence.publication.summary?.units ?? null], ["warnings", evidence.warnings],
  ]);
