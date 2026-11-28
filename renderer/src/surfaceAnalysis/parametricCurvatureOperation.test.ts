import { describe, expect, it } from "vitest";
import { MATH3D_PLATFORM_DISCOVERY, benchmarkScientificOperation,
  scientificWorkflowNode, validateDiscoveryJsonValue,
  type ScientificOperationDescriptor } from "@math3d/core";
import { parametricSurfaceCurvatureOperation,
  type ParametricSurfaceSource } from "./parametricCurvatureOperation";

const plane: ParametricSurfaceSource = {
  kind: "parametric", expressions: { x: "u", y: "v", z: "0" },
  domain: { u: { min: -2, max: 2 }, v: { min: -2, max: 2 } },
  lengthUnit: "scene-unit", referencePresetId: "plane",
};
const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) =>
  ArrayBuffer.isView(item) ? Array.from(item as unknown as ArrayLike<number>) : item));

describe("serializable parametric Surface curvature operation", () => {
  const descriptor = MATH3D_PLATFORM_DISCOVERY.get("scientific-operations",
    "surface.curvature.parametric") as ScientificOperationDescriptor;
  const host = { environment: "browser" as const,
    implementations: ["math3d.surface.curvature-parametric"] };

  it("advertises a complete 128 by 128 contract and a verified workflow node", () => {
    expect(descriptor.schemaCompleteness).toBe("complete");
    expect(descriptor.parameterSchema.properties?.resolutionU?.default).toBe(128);
    expect(descriptor.parameterSchema.properties?.resolutionV?.default).toBe(128);
    expect(scientificWorkflowNode(descriptor, host)?.operationId).toBe(descriptor.id);
    expect(validateDiscoveryJsonValue(descriptor.inputSchema, { surface: plane })).toBe(true);
  });

  it("computes from expressions and automatically compares a matching exact preset", () => {
    const result = parametricSurfaceCurvatureOperation.execute({ surface: plane,
      parameters: { resolutionU: 5, resolutionV: 5 } });
    expect(result.field.sampleCount).toBe(25);
    expect(result.field.statistics.K?.max).toBeCloseTo(0);
    expect(result.validation).toMatchObject({ finiteValues: true, domainCoverage: 1,
      referenceStatus: "passed", referenceComparedCount: 25 });
    expect(validateDiscoveryJsonValue(descriptor.outputSchema, json(result))).toBe(true);
  });

  it("uses 128 by 128 when no sampling parameters are supplied", () => {
    const result = parametricSurfaceCurvatureOperation.execute({ surface: {
      kind: "parametric", expressions: { x: "u", y: "v", z: "0" },
      domain: { u: { min: -1, max: 1 }, v: { min: -1, max: 1 } },
    } });
    expect(result.field.sampleCount).toBe(128 * 128);
    expect(result.validation.domainCoverage).toBe(1);
  });

  it("reports an unavailable reference for arbitrary expressions and rejects false matches", () => {
    const arbitrary = { kind: "parametric" as const,
      expressions: { x: "u", y: "v", z: "u^2+v^2" }, domain: plane.domain,
      lengthUnit: "scene-unit" };
    const result = parametricSurfaceCurvatureOperation.execute({ surface: arbitrary,
      parameters: { resolutionU: 5, resolutionV: 5 } });
    expect(result.validation.referenceStatus).toBe("unavailable");
    expect(result.field.gaussianCurvature[12]).toBeCloseTo(4, 2);
    expect(() => parametricSurfaceCurvatureOperation.execute({
      surface: { ...arbitrary, referencePresetId: "plane" },
      parameters: { resolutionU: 3, resolutionV: 3 },
    })).toThrow(/does not exactly match/);
  });

  it("compares a curved Surface with the exact derivative preset", () => {
    const result = parametricSurfaceCurvatureOperation.execute({ surface: {
      kind: "parametric", expressions: { x: "u", y: "v", z: "uv" },
      domain: { u: { min: -1.5, max: 1.5 }, v: { min: -1.5, max: 1.5 } },
      lengthUnit: "scene-unit", orientationSign: 1, referencePresetId: "saddle",
    }, parameters: { resolutionU: 7, resolutionV: 7 } });
    expect(result.validation.referenceStatus).toBe("passed");
    expect(result.validation.referenceComparedCount).toBe(49);
  });

  it("runs a descriptor driven benchmark on the same executor", async () => {
    const report = await benchmarkScientificOperation({ id: descriptor.id, host,
      input: { surface: plane }, parameters: { resolutionU: 3, resolutionV: 3 },
      iterations: 1, execute: (input, parameters) =>
        parametricSurfaceCurvatureOperation.execute({
          surface: (input as { surface: ParametricSurfaceSource }).surface,
          parameters: parameters as { resolutionU: number; resolutionV: number },
        }) });
    expect(report.iterations).toBe(1);
  });
});
