import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload,
  SurfaceCurveResultLayer, SurfaceFeatureResultLayer } from "./contracts";
import type { SurfaceAnalysisResult } from "./infrastructure";
import type { SurfaceLayerQualification } from "./surfaceLayerQualification";

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
  return {
    format: "math3d.surface-layer-evidence/v1" as const,
    source: {
      identity: result.identity,
      fingerprint: qualification.status === "current" && definition.identity.key === result.identity.key ? definition.fingerprint : null,
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
    layer: "confidence" in layer ? { ...layer, confidence: Array.from(layer.confidence) } : layer,
  };
};
