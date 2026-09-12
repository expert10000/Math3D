import { describe, expect, it } from "vitest";
import { getGeometryExactSurfacePreset } from "../geometry/exactSurfaceAnalysis";
import { analyzeExactSurfaceDifferentialPoint, analyzeImplicitDifferentialPoint, analyzeParametricDifferentialPoint } from "./differentialGeometry";
import { SURFACE_ANALYSIS_TOLERANCES, SURFACE_V1_REGRESSION_MATRIX, validateSurfaceRegressionMatrix, withinSurfaceTolerance } from "./regressionMatrix";

const value = (input: number | null): number => { expect(input).not.toBeNull(); return input!; };

describe("Surface Analysis v1 regression matrix", () => {
  it("freezes the canonical and pathological coverage inventory", () => {
    expect(validateSurfaceRegressionMatrix()).toEqual([]);
    expect(SURFACE_V1_REGRESSION_MATRIX.filter((entry) => entry.family === "canonical")).toHaveLength(17);
    expect(SURFACE_V1_REGRESSION_MATRIX.filter((entry) => entry.family === "pathological")).toHaveLength(10);
  });

  it("locks plane, unit sphere, unit cylinder, saddle, and torus truth values", () => {
    const plane = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("plane"), u: 0.2, v: -0.4 });
    expect([plane.gaussianCurvature, plane.meanCurvature, ...(plane.principalCurvatures ?? [])].every((entry) => withinSurfaceTolerance(value(entry), 0, "exact"))).toBe(true);
    const sphere = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("sphere"), u: 0.4, v: 1.2 });
    expect(withinSurfaceTolerance(value(sphere.gaussianCurvature), 1, "exact")).toBe(true);
    expect(sphere.principalCurvatures?.map((entry) => withinSurfaceTolerance(Math.abs(entry), 1, "exact"))).toEqual([true, true]);
    const cylinder = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("cylinder"), u: 0.7, v: 0.2 });
    expect(withinSurfaceTolerance(value(cylinder.gaussianCurvature), 0, "exact")).toBe(true);
    const cylinderPrincipal = cylinder.principalCurvatures?.map(Math.abs).sort((a, b) => a - b) ?? [];
    expect(cylinderPrincipal).toHaveLength(2);
    expect(cylinderPrincipal.every((entry, index) => withinSurfaceTolerance(entry, index, "exact"))).toBe(true);
    const saddle = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("saddle"), u: 0, v: 0 });
    expect(value(saddle.gaussianCurvature)).toBeLessThan(0);
    const torus = getGeometryExactSurfacePreset("torus");
    const outer = analyzeExactSurfaceDifferentialPoint({ definition: torus, u: 0, v: 0 });
    const transition = analyzeExactSurfaceDifferentialPoint({ definition: torus, u: 0, v: Math.PI / 2 });
    const inner = analyzeExactSurfaceDifferentialPoint({ definition: torus, u: 0, v: Math.PI });
    expect([Math.sign(value(outer.gaussianCurvature)), Math.abs(value(transition.gaussianCurvature)) < 1e-10, Math.sign(value(inner.gaussianCurvature))]).toEqual([1, true, -1]);
  });

  it("scales sphere and cylinder curvature by radius", () => {
    const radius = 2;
    const sphere = analyzeImplicitDifferentialPoint({ evaluate: (x, y, z) => x * x + y * y + z * z - radius * radius, point: [radius, 0, 0], gradient: [2 * radius, 0, 0], hessian: [[2, 0, 0], [0, 2, 0], [0, 0, 2]], method: "symbolic" });
    expect(withinSurfaceTolerance(value(sphere.gaussianCurvature), 1 / (radius * radius), "exact")).toBe(true);
    expect(withinSurfaceTolerance(Math.abs(value(sphere.meanCurvature)), 1 / radius, "exact")).toBe(true);
    const cylinder = analyzeParametricDifferentialPoint({ evaluate: (u, v) => [radius * Math.cos(u), radius * Math.sin(u), v], u: 0.7, v: 0.2, domain: { u: { min: 0, max: 2 * Math.PI, periodic: true }, v: { min: -1, max: 1 } }, step: [0.005, 0.005] });
    expect(withinSurfaceTolerance(value(cylinder.gaussianCurvature), 0, "numerical")).toBe(true);
    expect(cylinder.principalCurvatures?.map(Math.abs).sort((a, b) => a - b)[1]).toBeCloseTo(1 / radius, 4);
  });

  it("preserves intrinsic curvature under coordinate swap and follows orientation for signed curvature", () => {
    const torus = getGeometryExactSurfacePreset("torus"); const u = 0.7; const v = 1.1;
    const direct = analyzeParametricDifferentialPoint({ evaluate: torus.evaluate, u, v, domain: torus.domain, step: [0.01, 0.01] });
    const swapped = analyzeParametricDifferentialPoint({ evaluate: (vv, uu) => torus.evaluate(uu, vv), u: v, v: u, domain: { u: torus.domain.v, v: torus.domain.u }, step: [0.01, 0.01] });
    expect(withinSurfaceTolerance(value(swapped.gaussianCurvature), value(direct.gaussianCurvature), "numerical")).toBe(true);
    expect(withinSurfaceTolerance(value(swapped.meanCurvature), -value(direct.meanCurvature), "numerical")).toBe(true);
  });

  it("keeps method tolerances distinct and requires convergence outside exact analysis", () => {
    expect(SURFACE_ANALYSIS_TOLERANCES.exact.absolute).toBeLessThan(SURFACE_ANALYSIS_TOLERANCES.numerical.absolute);
    expect(SURFACE_ANALYSIS_TOLERANCES.numerical.absolute).toBeLessThan(SURFACE_ANALYSIS_TOLERANCES.sampled.absolute);
    expect(SURFACE_ANALYSIS_TOLERANCES.sampled.absolute).toBeLessThan(SURFACE_ANALYSIS_TOLERANCES["mesh-approximation"].absolute);
    expect(SURFACE_ANALYSIS_TOLERANCES.exact.convergenceRequired).toBe(false);
    expect(["numerical", "sampled", "mesh-approximation"].every((kind) => SURFACE_ANALYSIS_TOLERANCES[kind as keyof typeof SURFACE_ANALYSIS_TOLERANCES].convergenceRequired)).toBe(true);
  });

  it("rejects degenerate parameterizations and zero-gradient implicit critical points", () => {
    const degenerate = analyzeParametricDifferentialPoint({ evaluate: (u) => [u, 0, 0], u: 0, v: 0, domain: { u: { min: -1, max: 1 }, v: { min: -1, max: 1 } } });
    expect(degenerate.masks).toMatchObject({ valid: false, degenerate: true });
    const critical = analyzeImplicitDifferentialPoint({ evaluate: (x, y, z) => x * x + y * y + z * z, point: [0, 0, 0], gradient: [0, 0, 0], hessian: [[2, 0, 0], [0, 2, 0], [0, 0, 2]] });
    expect(critical.masks).toMatchObject({ valid: false, singular: true, degenerate: true });
  });
});
