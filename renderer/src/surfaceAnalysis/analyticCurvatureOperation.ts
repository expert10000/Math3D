import { bindScientificOperation, MATH3D_PLATFORM_DISCOVERY,
  SCIENTIFIC_CAPABILITY_REGISTRY } from "@math3d/core";
import { getGeometryExactSurfacePreset } from "../geometry/exactSurfaceAnalysis";
import { analyzeExactSurfaceDifferentialPoint } from "./differentialGeometry";
import { createSurfaceCurvatureFieldFromDifferential } from "./surfaceCurvature";
import type { SurfaceCurvatureFieldPayload } from "./contracts";

const descriptor = MATH3D_PLATFORM_DISCOVERY.executableOperation(
  "surface.curvature.analytic-reference", "browser",
  id => id === "math3d.surface.curvature-analytic-reference");
if (!descriptor || descriptor.schemaCompleteness !== "complete")
  throw new Error("Analytic Surface curvature reference contract is missing.");

export const analyticSurfaceCurvatureOperation = bindScientificOperation(
  SCIENTIFIC_CAPABILITY_REGISTRY, descriptor.id, descriptor.implementationId,
  ({ presetId, resolutionU = 17, resolutionV = 17 }: {
    presetId: string; resolutionU?: number; resolutionV?: number;
  }): SurfaceCurvatureFieldPayload => {
    if (![resolutionU, resolutionV].every(value => Number.isInteger(value) && value >= 2 && value <= 256))
      throw new RangeError("Analytic Surface resolution must be between 2 and 256.");
    const definition = getGeometryExactSurfacePreset(presetId);
    if (definition.capabilities.first !== "exact" || definition.capabilities.second !== "exact")
      throw new TypeError("Surface preset does not supply exact first and second derivatives.");
    const samples = [];
    for (let uIndex = 0; uIndex < resolutionU; uIndex += 1) {
      const uDomain = definition.domain.u;
      const u = uDomain.min + (uDomain.max - uDomain.min) *
        uIndex / (uDomain.periodic ? resolutionU : resolutionU - 1);
      for (let vIndex = 0; vIndex < resolutionV; vIndex += 1) {
        const vDomain = definition.domain.v;
        const v = vDomain.min + (vDomain.max - vDomain.min) *
          vIndex / (vDomain.periodic ? resolutionV : resolutionV - 1);
        samples.push(analyzeExactSurfaceDifferentialPoint({ definition, u, v }));
      }
    }
    return createSurfaceCurvatureFieldFromDifferential(samples,
      { lengthUnit: definition.units.position, histogramBins: 16 });
  });

export type CurvatureReferenceComparison = Readonly<{
  sampleCount: number;
  comparedCount: number;
  coverage: number;
  rmse: number | null;
  maximumAbsoluteError: number | null;
  tolerance: number;
  passed: boolean;
}>;

/** Corresponding samples must share a parameter grid and curvature units. */
export function compareSurfaceCurvatureReference(reference: SurfaceCurvatureFieldPayload,
  candidate: SurfaceCurvatureFieldPayload, absoluteTolerance: number,
  relativeTolerance = 0): CurvatureReferenceComparison {
  if (!Number.isFinite(absoluteTolerance) || absoluteTolerance < 0 ||
      !Number.isFinite(relativeTolerance) || relativeTolerance < 0)
    throw new RangeError("Reference tolerances must be nonnegative and finite.");
  if (reference.sampleCount !== candidate.sampleCount ||
      (["K", "H", "k1", "k2"] as const).some(unit =>
        reference.units[unit] !== candidate.units[unit]) ||
      reference.parameters.length !== candidate.parameters.length ||
      !Array.from(reference.parameters).every((value, index) =>
        Number.isFinite(value) && Math.abs(value - candidate.parameters[index]) <= 1e-10))
    throw new TypeError("Curvature fields do not share a parameter grid and units.");
  let comparedCount = 0, squaredError = 0, maximumAbsoluteError = 0, passed = true;
  for (let index = 0; index < reference.sampleCount; index += 1) {
    if (!reference.validityMask[index] || !candidate.validityMask[index]) continue;
    const expectedValues = [reference.gaussianCurvature[index], reference.meanCurvature[index],
      reference.principalCurvatures[index * 2], reference.principalCurvatures[index * 2 + 1]];
    const actualValues = [candidate.gaussianCurvature[index], candidate.meanCurvature[index],
      candidate.principalCurvatures[index * 2], candidate.principalCurvatures[index * 2 + 1]];
    if (![...expectedValues, ...actualValues].every(Number.isFinite)) continue;
    for (let channel = 0; channel < expectedValues.length; channel += 1) {
      const expected = expectedValues[channel];
      const error = Math.abs(actualValues[channel] - expected);
      maximumAbsoluteError = Math.max(maximumAbsoluteError, error);
      squaredError += error * error;
      if (error > absoluteTolerance + relativeTolerance * Math.abs(expected)) passed = false;
    }
    comparedCount += 1;
  }
  return { sampleCount: reference.sampleCount, comparedCount,
    coverage: reference.sampleCount ? comparedCount / reference.sampleCount : 0,
    rmse: comparedCount ? Math.sqrt(squaredError / (comparedCount * 4)) : null,
    maximumAbsoluteError: comparedCount ? maximumAbsoluteError : null,
    tolerance: absoluteTolerance, passed: passed && comparedCount === reference.validDomainCount };
}
