import { bindScientificOperation, compileExpression, MATH3D_PLATFORM_DISCOVERY,
  SCIENTIFIC_CAPABILITY_REGISTRY, validateDiscoveryJsonValue } from "@math3d/core";
import { getGeometryExactSurfacePreset } from "../geometry/exactSurfaceAnalysis";
import { analyzeParametricDifferentialPoint } from "./differentialGeometry";
import { createSurfaceCurvatureFieldFromDifferential } from "./surfaceCurvature";
import { analyticSurfaceCurvatureOperation,
  compareSurfaceCurvatureReference } from "./analyticCurvatureOperation";

export type ParametricSurfaceSource = Readonly<{
  kind: "parametric";
  expressions: Readonly<{ x: string; y: string; z: string }>;
  domain: Readonly<{ u: Readonly<{ min: number; max: number; periodic?: boolean }>;
    v: Readonly<{ min: number; max: number; periodic?: boolean }> }>;
  lengthUnit?: string;
  orientationSign?: 1 | -1;
  /** Permitted only for an exact match of formula, domain, units and orientation. */
  referencePresetId?: string;
}>;

export type ParametricCurvatureParameters = Readonly<{
  resolutionU?: number;
  resolutionV?: number;
  absoluteTolerance?: number;
  relativeTolerance?: number;
}>;

const descriptor = MATH3D_PLATFORM_DISCOVERY.executableOperation(
  "surface.curvature.parametric", "browser",
  id => id === "math3d.surface.curvature-parametric");
if (!descriptor) throw new Error("Parametric Surface curvature contract is missing.");

const normalizedFormula = (text: string) => {
  const compact = text.replace(/\s+/g, "");
  return compact.includes("**") ? "invalid-multiplication" : compact.replace(/\*/g, "");
};

/** Runs the registered operation on a serializable, caller supplied Surface definition. */
export const parametricSurfaceCurvatureOperation = bindScientificOperation(
  SCIENTIFIC_CAPABILITY_REGISTRY, descriptor.id, descriptor.implementationId,
  ({ surface, parameters = {} }: { surface: ParametricSurfaceSource;
    parameters?: ParametricCurvatureParameters }) => {
    if (!validateDiscoveryJsonValue(descriptor.inputSchema, { surface }) ||
        !validateDiscoveryJsonValue(descriptor.parameterSchema, parameters))
      throw new TypeError("Invalid parametric Surface curvature input or parameters.");
    const { resolutionU = 128, resolutionV = 128,
      absoluteTolerance = 0.001, relativeTolerance = 0.01 } = parameters;
    const { domain } = surface;
    if (!Number.isFinite(domain.u.max - domain.u.min) ||
        !Number.isFinite(domain.v.max - domain.v.min) ||
        domain.u.max <= domain.u.min || domain.v.max <= domain.v.min)
      throw new RangeError("Parametric Surface domain must have positive finite extent.");
    const preset = surface.referencePresetId
      ? getGeometryExactSurfacePreset(surface.referencePresetId) : null;
    if (preset) {
      const sameFormula = (["x", "y", "z"] as const).every((axis, index) =>
        normalizedFormula(surface.expressions[axis]) === normalizedFormula(preset.formula[index]));
      const sameDomain = (["u", "v"] as const).every(axis =>
        domain[axis].min === preset.domain[axis].min &&
        domain[axis].max === preset.domain[axis].max &&
        Boolean(domain[axis].periodic) === preset.domain[axis].periodic);
      if (!sameFormula || !sameDomain ||
          (surface.lengthUnit ?? "unit") !== preset.units.position ||
          (surface.orientationSign ?? 1) !== preset.orientation.sign)
        throw new TypeError("Reference preset does not exactly match the Surface definition.");
    }
    const functions = preset ? null : (["x", "y", "z"] as const).map(axis => {
      const compiled = compileExpression(surface.expressions[axis], ["u", "v"]);
      if (!compiled.fn) throw new TypeError(`Invalid ${axis} expression: ${compiled.error?.message ?? "unknown error"}`);
      return compiled.fn;
    });
    const evaluate = preset ? preset.evaluate : (u: number, v: number): readonly [number, number, number] => {
      const variables = { u, v };
      return [functions![0](variables), functions![1](variables), functions![2](variables)];
    };
    const samples = [];
    for (let ui = 0; ui < resolutionU; ui += 1) {
      const u = domain.u.min + (domain.u.max - domain.u.min) *
        ui / (domain.u.periodic ? resolutionU : resolutionU - 1);
      for (let vi = 0; vi < resolutionV; vi += 1) {
        const v = domain.v.min + (domain.v.max - domain.v.min) *
          vi / (domain.v.periodic ? resolutionV : resolutionV - 1);
        samples.push(analyzeParametricDifferentialPoint({ evaluate, u, v, domain,
          orientation: { convention: "parameter-cross", sign: surface.orientationSign ?? 1,
            description: "Parametric orientation" },
          units: { length: surface.lengthUnit ?? "unit", angle: "rad" } }));
      }
    }
    const field = createSurfaceCurvatureFieldFromDifferential(samples,
      { lengthUnit: surface.lengthUnit ?? "unit", histogramBins: 16 });
    let referenceStatus: "passed" | "failed" | "unavailable" = "unavailable";
    let referenceRmse: number | null = null;
    let referenceMaximumAbsoluteError: number | null = null;
    let referenceComparedCount = 0;
    if (preset) {
      const reference = analyticSurfaceCurvatureOperation.execute({
        presetId: preset.id, resolutionU, resolutionV });
      const comparison = compareSurfaceCurvatureReference(reference, field,
        absoluteTolerance, relativeTolerance);
      referenceStatus = comparison.passed ? "passed" : "failed";
      referenceRmse = comparison.rmse;
      referenceMaximumAbsoluteError = comparison.maximumAbsoluteError;
      referenceComparedCount = comparison.comparedCount;
    }
    return { field, validation: {
      finiteValues: field.validDomainCount === field.sampleCount,
      domainCoverage: field.validDomainCount / field.sampleCount,
      referenceStatus, referenceRmse, referenceMaximumAbsoluteError,
      referenceComparedCount,
    } };
  });
