import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload,
  SurfaceCurveResultLayer, SurfaceFeatureResultLayer } from "./contracts";
import type { SurfaceAnalysisResult } from "./infrastructure";
import type { SurfaceLayerQualification } from "./surfaceLayerQualification";
import { createResultPublication, resultEvidenceRowsCsv } from "../results/resultPublication";

export const surfaceLayerPublication = (input: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload>;
  layer: SurfaceCurveResultLayer | SurfaceFeatureResultLayer;
  qualification: SurfaceLayerQualification;
}) => {
  const { definition, result, layer, qualification } = input;
  const current = qualification.status === "current" && qualification.canUseCurrentActions &&
    definition.identity.key === result.identity.key;
  return createResultPublication({ module: "surface",
    resultId: `${result.identity.key}:${result.kind}:${layer.layerId}:v${result.resultVersion}`,
    source: { id: result.identity.key, revision: result.identity.surfaceRevision,
      generation: null, hash: current ? definition.fingerprint : null },
    sourceStatus: qualification.status, status: current ? "recorded" : "withheld",
    reason: qualification.reason, recordedClaim: qualification.claim,
    independentCheck: qualification.verification,
    summary: { layerId: layer.layerId, label: layer.label, layerKind: layer.layerKind,
      statistics: layer.statistics, units: result.payload?.units ?? null } });
};

/** Portable evidence for one collected layer. Source freshness is a snapshot, not a certificate. */
export const createSurfaceLayerEvidence = (input: {
  definition: CanonicalSurfaceDefinition;
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload>;
  layer: SurfaceCurveResultLayer | SurfaceFeatureResultLayer;
  qualification: SurfaceLayerQualification;
}) => {
  const { definition, result, layer, qualification } = input;
  const payload = result.payload;
  if (!payload || (payload.data.kind !== "curve-layers" && payload.data.kind !== "feature-layers") ||
    !payload.data.layers.some(entry => entry.layerId === layer.layerId && entry.identity.key === layer.identity.key) ||
    qualification.status === "unavailable") {
    throw new TypeError("Surface layer evidence requires a matching collected result.");
  }
  const publication = surfaceLayerPublication(input);
  const current = publication.assessment.status === "recorded";
  return {
    format: "math3d.surface-layer-evidence/v1" as const,
    source: {
      identity: result.identity,
      fingerprint: current ? definition.fingerprint : null,
      representation: payload.representation,
      units: payload.units,
      orientation: payload.orientation,
    },
    result: {
      kind: result.kind,
      variant: result.variant,
      state: result.state,
      version: result.resultVersion,
      method: payload.method,
      backend: result.backend,
      parameters: result.parameters,
      dependencies: result.dependencies,
    },
    qualification: { status: qualification.status, claim: qualification.claim,
      independentCheck: qualification.verification, reason: qualification.reason },
    warnings: [...new Set([...payload.warnings, ...layer.warnings])],
    layer: current ? "confidence" in layer ? { ...layer, confidence: Array.from(layer.confidence) } : layer : null,
    publication,
  };
};

export const surfaceLayerEvidenceCsv = (evidence: ReturnType<typeof createSurfaceLayerEvidence>): string =>
  resultEvidenceRowsCsv([
    ["resultId", evidence.publication.resultId], ["sourceId", evidence.publication.source.id],
    ["sourceRevision", evidence.publication.source.revision],
    ["sourceFingerprint", evidence.publication.source.hash],
    ["sourceStatus", evidence.publication.assessment.sourceStatus],
    ["publicationStatus", evidence.publication.assessment.status],
    ["recordedClaim", evidence.publication.assessment.recordedClaim],
    ["independentCheck", evidence.publication.assessment.independentCheck],
    ["layerId", evidence.publication.summary?.layerId ?? null],
    ["layerKind", evidence.publication.summary?.layerKind ?? null],
    ["statistics", evidence.publication.summary?.statistics ?? null],
    ["units", evidence.source.units], ["warnings", evidence.warnings],
  ]);
