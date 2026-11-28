import { describe, expect, it } from "vitest";
import { MATH3D_PLATFORM_DISCOVERY, validateDiscoveryJsonValue,
  type ScientificOperationDescriptor } from "@math3d/core";
import { analyticSurfaceCurvatureOperation,
  compareSurfaceCurvatureReference } from "./analyticCurvatureOperation";

const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) =>
  ArrayBuffer.isView(item) ? Array.from(item as unknown as ArrayLike<number>) : item));

describe("analytic Surface curvature reference", () => {
  it("samples an exact preset and validates its full operation contract", () => {
    const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations",
      "surface.curvature.analytic-reference") as ScientificOperationDescriptor;
    expect(descriptor).toMatchObject({ schemaCompleteness: "complete", method: "analytic" });
    expect(validateDiscoveryJsonValue(descriptor.inputSchema, { presetId: "plane" })).toBe(true);
    expect(validateDiscoveryJsonValue(descriptor.parameterSchema,
      { resolutionU: 3, resolutionV: 3 })).toBe(true);
    expect(validateDiscoveryJsonValue(descriptor.parameterSchema, { resolutionU: 257 })).toBe(false);
    const plane = analyticSurfaceCurvatureOperation.execute({ presetId: "plane", resolutionU: 3,
      resolutionV: 3 });
    expect(plane.sampleCount).toBe(9);
    expect(plane.statistics.K?.max).toBe(0);
    expect(validateDiscoveryJsonValue(descriptor.outputSchema, json(plane))).toBe(true);
    expect(compareSurfaceCurvatureReference(plane, plane, 1e-9)).toMatchObject({
      comparedCount: 9, coverage: 1, rmse: 0, passed: true });
  });

  it("reports a failed independent comparison and rejects unrelated grids", () => {
    const reference = analyticSurfaceCurvatureOperation.execute({ presetId: "saddle", resolutionU: 5,
      resolutionV: 5 });
    const changed = { ...reference, gaussianCurvature: new Float64Array(reference.gaussianCurvature) };
    changed.gaussianCurvature[12] += 0.1;
    const comparison = compareSurfaceCurvatureReference(reference, changed, 0.01);
    expect(comparison.passed).toBe(false);
    expect(comparison.maximumAbsoluteError).toBeCloseTo(0.1);
    const changedMean = { ...reference, meanCurvature: new Float64Array(reference.meanCurvature) };
    changedMean.meanCurvature[12] += 0.1;
    expect(compareSurfaceCurvatureReference(reference, changedMean, 0.01).passed).toBe(false);
    const otherGrid = analyticSurfaceCurvatureOperation.execute({ presetId: "saddle", resolutionU: 3,
      resolutionV: 3 });
    expect(() => compareSurfaceCurvatureReference(reference, otherGrid, 0.01))
      .toThrow(/parameter grid/);
  });
});
