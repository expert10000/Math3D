import { describe, expect, it } from "vitest";
import {
  analyzeExactSurface,
  evaluateExactSurfacePoint,
  getGeometryExactSurfacePreset,
  type GeometryAnalyticSurfaceDefinition,
} from "./exactSurfaceAnalysis";

describe("exact Geometry surface differential analysis", () => {
  it("matches the exact plane metric, forms, shape operator, and planar classification", () => {
    const point = evaluateExactSurfacePoint({ definition: getGeometryExactSurfacePreset("plane"), u: 0.3, v: -0.4 });
    expect(point.position).toEqual([0.3, -0.4, 0]);
    expect(point.derivativeU).toEqual([1, 0, 0]);
    expect(point.derivativeV).toEqual([0, 1, 0]);
    expect(point.normal).toEqual([0, 0, 1]);
    expect(point.jacobian).toBe(1);
    expect(point.metricTensor).toEqual([[1, 0], [0, 1]]);
    expect(point.secondFundamentalForm.matrix).toEqual([[0, 0], [0, 0]]);
    expect(point.shapeOperator).toEqual([[0, 0], [0, 0]]);
    expect(point.principalCurvatures).toEqual({ k1: 0, k2: 0 });
    expect(point.meanCurvature).toBe(0);
    expect(point.gaussianCurvature).toBe(0);
    expect(point.classification).toBe("planar");
  });

  it("uses outward sphere orientation with positive convex principal curvatures", () => {
    const sphere = getGeometryExactSurfacePreset("sphere");
    const point = evaluateExactSurfacePoint({ definition: sphere, u: 0, v: Math.PI / 2, normalCurvatureAngle: 0.7 });
    expect(point.position[0]).toBeCloseTo(1, 12);
    expect(point.normal?.[0]).toBeCloseTo(1, 12);
    expect(point.principalCurvatures.k1).toBeCloseTo(1, 12);
    expect(point.principalCurvatures.k2).toBeCloseTo(1, 12);
    expect(point.meanCurvature).toBeCloseTo(1, 12);
    expect(point.gaussianCurvature).toBeCloseTo(1, 12);
    expect(point.normalCurvature.value).toBeCloseTo(1, 12);
    expect(point.classification).toBe("umbilic");
    const analysis = analyzeExactSurface({ definition: sphere, u: 0, v: Math.PI / 2, uCount: 17, vCount: 9 });
    expect(analysis.conventions).toMatchObject({ principalCurvatureOrder: "k1>=k2", outwardConvex: "positive", meshCompatible: true });
    expect(analysis.classifications.degenerate).toBeGreaterThan(0);
    expect(analysis.warnings.join(" ")).toContain("degenerate");
  });

  it("matches the exact cylinder and parabolic classification", () => {
    const cylinder = getGeometryExactSurfacePreset("cylinder");
    const point = evaluateExactSurfacePoint({ definition: cylinder, u: Math.PI / 3, v: 0.4, normalCurvatureAngle: Math.PI / 2 });
    expect(point.jacobian).toBeCloseTo(1, 12);
    expect(point.principalCurvatures.k1).toBeCloseTo(1, 12);
    expect(point.principalCurvatures.k2).toBeCloseTo(0, 12);
    expect(point.meanCurvature).toBeCloseTo(0.5, 12);
    expect(point.gaussianCurvature).toBeCloseTo(0, 12);
    expect(point.normalCurvature.value).toBeCloseTo(0, 12);
    expect(point.classification).toBe("parabolic");
    expect(cylinder.domain.u).toMatchObject({ periodic: true, seam: "identified" });
  });

  it("matches torus outer/inner curvature signs and classification", () => {
    const torus = getGeometryExactSurfacePreset("torus");
    const outer = evaluateExactSurfacePoint({ definition: torus, u: 0, v: 0 });
    expect(outer.principalCurvatures.k1).toBeCloseTo(1 / 0.7, 12);
    expect(outer.principalCurvatures.k2).toBeCloseTo(1 / 2.7, 12);
    expect(outer.gaussianCurvature).toBeGreaterThan(0);
    expect(outer.classification).toBe("elliptic");
    const inner = evaluateExactSurfacePoint({ definition: torus, u: 0, v: Math.PI });
    expect(inner.principalCurvatures.k1).toBeCloseTo(1 / 0.7, 12);
    expect(inner.principalCurvatures.k2).toBeCloseTo(-1 / 1.3, 12);
    expect(inner.gaussianCurvature).toBeLessThan(0);
    expect(inner.classification).toBe("hyperbolic");
  });

  it("matches saddle forms, curvatures, directions, sections, and heatmap", () => {
    const saddle = getGeometryExactSurfacePreset("saddle");
    const analysis = analyzeExactSurface({ definition: saddle, u: 0, v: 0, uCount: 13, vCount: 11, normalCurvatureAngle: Math.PI / 4 });
    expect(analysis.point.secondFundamentalForm.matrix).toEqual([[0, -1], [-1, 0]]);
    expect(analysis.point.shapeOperator).toEqual([[0, -1], [-1, 0]]);
    expect(analysis.point.principalCurvatures.k1).toBeCloseTo(1, 12);
    expect(analysis.point.principalCurvatures.k2).toBeCloseTo(-1, 12);
    expect(analysis.point.meanCurvature).toBeCloseTo(0, 12);
    expect(analysis.point.gaussianCurvature).toBeCloseTo(-1, 12);
    expect(analysis.point.normalCurvature.value).toBeCloseTo(0, 12);
    expect(analysis.point.classification).toBe("hyperbolic");
    expect(analysis.visualization.normalSections).toHaveLength(2);
    expect(analysis.visualization.principalDirectionGlyphs.length).toBeGreaterThan(4);
    expect(analysis.visualization.heatmap).toHaveLength(13 * 11);
  });

  it("detects singular parameters and preserves trim metadata", () => {
    const sphere = getGeometryExactSurfacePreset("sphere");
    const pole = evaluateExactSurfacePoint({ definition: sphere, u: 0, v: 0 });
    expect(pole.degenerate).toBe(true);
    expect(pole.classification).toBe("degenerate");
    expect(pole.normal).toBeNull();

    const trimmed: GeometryAnalyticSurfaceDefinition = {
      ...getGeometryExactSurfacePreset("plane"),
      id: "trimmed-plane",
      trims: [{ id: "disk", description: "u²+v²≤1" }],
    };
    const analysis = analyzeExactSurface({ definition: trimmed, u: 0, v: 0 });
    expect(analysis.definition.trims).toEqual([{ id: "disk", description: "u²+v²≤1" }]);
    expect(analysis.warnings.join(" ")).toContain("trim boundary");
  });

  it("labels sampled derivative fallback explicitly", () => {
    const sampled: GeometryAnalyticSurfaceDefinition = {
      ...getGeometryExactSurfacePreset("plane"),
      id: "sampled-plane",
      capabilities: { position: "exact", first: "sampled", second: "sampled" },
    };
    const analysis = analyzeExactSurface({ definition: sampled, u: 0, v: 0 });
    expect(analysis.warnings.join(" ")).toContain("sampled fallback");
    expect(analysis.definition.capabilities.second).toBe("sampled");
  });

  it("maintains Mesh-compatible curvature identities and orthogonal principal frames", () => {
    for (const [id, u, v] of [
      ["plane", 0.2, -0.3],
      ["sphere", 0.4, 1.2],
      ["cylinder", 0.7, 0.1],
      ["torus", 0.9, 1.1],
      ["saddle", 0.3, -0.2],
    ] as const) {
      const point = evaluateExactSurfacePoint({ definition: getGeometryExactSurfacePreset(id), u, v });
      const { k1, k2 } = point.principalCurvatures;
      expect(k1).not.toBeNull();
      expect(k2).not.toBeNull();
      expect(point.meanCurvature).toBeCloseTo(((k1 ?? 0) + (k2 ?? 0)) / 2, 11);
      expect(point.gaussianCurvature).toBeCloseTo((k1 ?? 0) * (k2 ?? 0), 11);
      if (point.principalDirections.d1 && point.principalDirections.d2 && point.normal) {
        const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0);
        expect(dot(point.principalDirections.d1, point.principalDirections.d2)).toBeCloseTo(0, 10);
        expect(dot(point.principalDirections.d1, point.normal)).toBeCloseTo(0, 10);
        expect(dot(point.principalDirections.d2, point.normal)).toBeCloseTo(0, 10);
      }
    }
  });
});
