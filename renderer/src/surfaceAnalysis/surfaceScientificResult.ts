import type { ScientificMetric, ScientificResult } from "@math3d/core";
import type { CanonicalSurfaceDefinition, SurfaceAnalysisPayload } from "./contracts";
import type { SurfaceAnalysisResult } from "./infrastructure";

/** Projects the current retained Surface result into the shared scientific result contract. */
export function adaptSurfaceCurvatureScientificResult(
  definition: CanonicalSurfaceDefinition,
  result: SurfaceAnalysisResult<SurfaceAnalysisPayload> | null,
): ScientificResult | null {
  if (!result || result.kind !== "curvature-field" || result.state !== "ready" || !result.payload) return null;
  const { identity } = definition;
  const payload = result.payload;
  const field = payload.data;
  if (field.kind !== "curvature") return null;
  if (result.identity.key !== identity.key || result.identity.surfaceId !== identity.surfaceId ||
      result.identity.surfaceRevision !== identity.surfaceRevision ||
      result.identity.representation !== identity.representation ||
      payload.surfaceId !== identity.surfaceId || payload.surfaceRevision !== identity.surfaceRevision ||
      payload.representation !== definition.representation ||
      payload.units.length !== definition.units.length || payload.units.angle !== definition.units.angle ||
      field.units.K !== `${definition.units.length}^-2` ||
      field.units.H !== `${definition.units.length}^-1` ||
      field.units.k1 !== `${definition.units.length}^-1` ||
      field.units.k2 !== `${definition.units.length}^-1` ||
      field.validDomainCount < 0 || field.validDomainCount > field.sampleCount) return null;

  const metrics: ScientificMetric[] = [
    { id: "metric.sampleCount", value: field.sampleCount, units: null },
    { id: "metric.validSamples", value: field.validDomainCount, units: null },
  ];
  for (const [scalar, units] of [["K", field.units.K], ["H", field.units.H],
    ["k1", field.units.k1], ["k2", field.units.k2]] as const) {
    const statistics = field.statistics[scalar];
    if (!statistics) continue;
    if (![statistics.mean, statistics.rms, statistics.min, statistics.max].every(Number.isFinite)) return null;
    metrics.push({ id: `metric.${scalar}.mean`, value: statistics.mean, units });
    metrics.push({ id: `metric.${scalar}.rms`, value: statistics.rms, units });
  }
  if (result.computeTimeMs !== null && Number.isFinite(result.computeTimeMs))
    metrics.push({ id: "metric.computeTimeMs", value: result.computeTimeMs, units: "ms" });
  const reference = `surface-analysis:${identity.key}:curvature-field:${result.parameterHash}:v${result.resultVersion}`;
  return {
    executionId: `surface.curvature.compute:${identity.key}:${result.parameterHash}:v${result.resultVersion}`,
    capabilityIds: ["surface.curvature.gaussian", "surface.curvature.mean", "surface.curvature.principal"],
    operationId: "surface.curvature.compute",
    sourceReference: `surface:${identity.surfaceId}@${identity.surfaceRevision}:${definition.fingerprint}`,
    metrics,
    artifacts: [{ id: "artifact.surface.curvature-field", type: "SurfaceCurvatureField", reference,
      retained: true }],
  };
}
