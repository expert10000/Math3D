import { describe, expect, it } from "vitest";
import { getGeometryExactSurfacePreset } from "./exactSurfaceAnalysis";
import { analyzeIntrinsicGeometry, evaluateIntrinsicMetric } from "./intrinsicGeometry";

describe("intrinsic geometry", () => {
  it("computes the identity metric and straight geodesic on a plane", () => {
    const plane = getGeometryExactSurfacePreset("plane");
    const result = analyzeIntrinsicGeometry({ definition: plane, start: { u: 0, v: 0 }, destination: { u: 1, v: 1 } });
    expect(result.metricPoint.metric).toEqual([[1, 0], [0, 1]]);
    expect(result.metricPoint.christoffel).toEqual([[[0, 0], [0, 0]], [[0, 0], [0, 0]]]);
    expect(result.paths[0]).toMatchObject({ method: "analytic-plane", length: Math.SQRT2 });
    expect(result.surfaceArea).toBeCloseTo(16, 8);
  });

  it("unwraps a cylinder seam and reports alternative winding paths", () => {
    const cylinder = getGeometryExactSurfacePreset("cylinder");
    const result = analyzeIntrinsicGeometry({ definition: cylinder, start: { u: 0.1, v: 0 }, destination: { u: Math.PI * 2 - 0.1, v: 1 } });
    expect(result.paths).toHaveLength(3);
    expect(result.paths[0].length).toBeCloseTo(Math.hypot(0.2, 1), 8);
    expect(result.paths[0].method).toBe("analytic-cylinder-unwrapped");
    expect(result.warnings.join(" ")).toContain("seams");
  });

  it("uses great-circle distance and canonical sphere metric", () => {
    const sphere = getGeometryExactSurfacePreset("sphere");
    const metric = evaluateIntrinsicMetric(sphere, 0, Math.PI / 2);
    const result = analyzeIntrinsicGeometry({ definition: sphere, start: { u: 0, v: Math.PI / 2 }, destination: { u: Math.PI / 2, v: Math.PI / 2 } });
    expect(metric.metric[0][0]).toBeCloseTo(1, 9);
    expect(metric.metric[1][1]).toBeCloseTo(1, 9);
    expect(result.paths[0].length).toBeCloseTo(Math.PI / 2, 8);
    expect(result.enclosedVolume).toBeCloseTo(4 * Math.PI / 3, 8);
    expect(result.surfaceArea).toBeCloseTo(4 * Math.PI, 2);
  });

  it("reports metric distortion and numerical provenance for a saddle", () => {
    const result = analyzeIntrinsicGeometry({ definition: getGeometryExactSurfacePreset("saddle"), start: { u: -1, v: -1 }, destination: { u: 1, v: 1 } });
    expect(result.metricPoint.metricConditionNumber).not.toBeNull();
    expect(result.engine).toMatchObject({ exact: false, reusedEngine: "parametric" });
    expect(result.overlays.parameterGrid.length).toBeGreaterThan(1);
    expect(result.overlays.metricEllipse.length).toBeGreaterThan(20);
    expect(result.warnings.join(" ")).toContain("closed-form geodesic");
  });
});
