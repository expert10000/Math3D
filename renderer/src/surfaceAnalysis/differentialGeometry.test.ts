import { describe, expect, it } from "vitest";
import { getGeometryExactSurfacePreset, type GeometryAnalyticSurfaceDefinition } from "../geometry/exactSurfaceAnalysis";
import { adaptSurfaceDefinition } from "./infrastructure";
import {
  adaptMeshDifferentialPoint,
  analyzeExactSurfaceDifferentialPoint,
  analyzeGraphDifferentialPoint,
  analyzeImplicitDifferentialPoint,
  analyzeParametricDifferentialPoint,
  analyzeSurfaceDifferentialPoint,
  buildSurfaceDifferentialField,
  createSurfaceDifferentialPayload,
} from "./differentialGeometry";

const close = (actual: number | null, expected: number, tolerance = 1e-6) => {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(tolerance);
};

const expectCurvatureIdentities = (point: ReturnType<typeof analyzeExactSurfaceDifferentialPoint>, tolerance = 1e-8) => {
  expect(point.principalCurvatures).not.toBeNull();
  const [k1, k2] = point.principalCurvatures!;
  expect(k1).toBeGreaterThanOrEqual(k2);
  close(point.gaussianCurvature, k1 * k2, tolerance);
  close(point.meanCurvature, (k1 + k2) / 2, tolerance);
};

describe("Surface unified differential-geometry engine", () => {
  it("routes every representation family through one normalized point schema", () => {
    const exact = analyzeSurfaceDifferentialPoint({ kind: "exact", definition: getGeometryExactSurfacePreset("plane"), u: 0, v: 0 });
    const graph = analyzeSurfaceDifferentialPoint({
      kind: "graph", evaluate: (x, y) => x + y, x: 0, y: 0,
      domain: { x: { min: -1, max: 1 }, y: { min: -1, max: 1 } },
    });
    const implicit = analyzeSurfaceDifferentialPoint({
      kind: "implicit", evaluate: (x, y, z) => x + y + z, point: [0, 0, 0],
      gradient: [1, 1, 1], hessian: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], method: "automatic-differentiation",
    });
    const mesh = analyzeSurfaceDifferentialPoint({ kind: "mesh", position: [0, 0, 0], normal: [0, 0, 1], principalCurvatures: [0, 0] });
    expect([exact, graph, implicit, mesh].map((point) => [point.representation, point.method, point.masks.valid])).toEqual([
      ["parametric", "analytic", true],
      ["explicit", "numerical-derivatives", true],
      ["implicit", "automatic-differentiation", true],
      ["mesh-backed", "mesh-approximation", true],
    ]);
    for (const point of [exact, graph, implicit, mesh]) {
      expect(point).toHaveProperty("firstFundamentalForm");
      expect(point).toHaveProperty("secondFundamentalForm");
      expect(point).toHaveProperty("shapeOperator");
      expect(point).toHaveProperty("uncertainty");
    }
  });

  it("reuses exact Geometry definitions and freezes the canonical forms", () => {
    const sphere = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("sphere"), u: 0, v: Math.PI / 2 });
    expect(sphere).toMatchObject({
      method: "analytic",
      masks: { valid: true, singular: false, umbilic: true },
      firstFundamentalForm: { E: 1, F: 0, G: 1 },
      secondFundamentalForm: { L: 1, M: 0, N: 1 },
      metricDeterminant: 1,
    });
    close(sphere.gaussianCurvature, 1);
    close(sphere.meanCurvature, 1);
    expect(sphere.principalCurvatures).toEqual([1, 1]);
    expect(sphere.principalDirections).toBeNull();
    expectCurvatureIdentities(sphere);
  });

  it("reverses signed curvature with orientation while preserving Gaussian curvature", () => {
    const source = getGeometryExactSurfacePreset("sphere");
    const reversed: GeometryAnalyticSurfaceDefinition = { ...source, orientation: { sign: 1, description: "inward radial" } };
    const outward = analyzeExactSurfaceDifferentialPoint({ definition: source, u: 0.3, v: 1.2 });
    const inward = analyzeExactSurfaceDifferentialPoint({ definition: reversed, u: 0.3, v: 1.2 });
    close(inward.gaussianCurvature, outward.gaussianCurvature!);
    close(inward.meanCurvature, -outward.meanCurvature!);
    close(inward.principalCurvatures![0], -outward.principalCurvatures![1]);
    close(inward.principalCurvatures![1], -outward.principalCurvatures![0]);
  });

  it("computes graph forms and curvature with adaptive numerical derivatives", () => {
    const point = analyzeGraphDifferentialPoint({
      evaluate: (x, y) => x * x + y * y,
      x: 0,
      y: 0,
      domain: { x: { min: -2, max: 2 }, y: { min: -2, max: 2 } },
      units: { length: "m", angle: "rad" },
    });
    expect(point.representation).toBe("explicit");
    expect(point.method).toBe("numerical-derivatives");
    close(point.firstFundamentalForm?.E ?? null, 1);
    close(point.firstFundamentalForm?.F ?? null, 0);
    close(point.firstFundamentalForm?.G ?? null, 1);
    close(point.secondFundamentalForm?.L ?? null, -2, 1e-7);
    close(point.secondFundamentalForm?.N ?? null, -2, 1e-7);
    close(point.gaussianCurvature, 4, 1e-6);
    close(point.meanCurvature, -2, 1e-6);
    expect(point.units).toMatchObject({ gaussianCurvature: "m^-2", meanCurvature: "m^-1" });
    expectCurvatureIdentities(point, 1e-7);
  });

  it("converges toward the exact torus result and reports adaptive uncertainty", () => {
    const torus = getGeometryExactSurfacePreset("torus");
    const u = 0.7;
    const v = 1.1;
    const exact = analyzeExactSurfaceDifferentialPoint({ definition: torus, u, v });
    const evaluate = (uu: number, vv: number) => torus.evaluate(uu, vv);
    const coarse = analyzeParametricDifferentialPoint({ evaluate, u, v, domain: torus.domain, step: [0.08, 0.08] });
    const fine = analyzeParametricDifferentialPoint({ evaluate, u, v, domain: torus.domain, step: [0.02, 0.02] });
    const coarseError = Math.abs(coarse.gaussianCurvature! - exact.gaussianCurvature!);
    const fineError = Math.abs(fine.gaussianCurvature! - exact.gaussianCurvature!);
    expect(fineError).toBeLessThan(coarseError);
    expect(fineError).toBeLessThan(2e-4);
    expect(fine.uncertainty.step).toEqual([0.01, 0.01]);
    expect(fine.uncertainty.curvature).toBeGreaterThanOrEqual(0);
    expectCurvatureIdentities(fine, 1e-7);
  });

  it("uses implicit gradient/Hessian formulas and marks zero-gradient points singular", () => {
    const sphere = analyzeImplicitDifferentialPoint({
      evaluate: (x, y, z) => x * x + y * y + z * z - 1,
      point: [1, 0, 0],
      gradient: [2, 0, 0],
      hessian: [[2, 0, 0], [0, 2, 0], [0, 0, 2]],
      method: "symbolic",
    });
    expect(sphere).toMatchObject({ representation: "implicit", method: "symbolic", masks: { valid: true, singular: false, umbilic: true } });
    close(sphere.gaussianCurvature, 1);
    close(sphere.meanCurvature, 1);

    const singular = analyzeImplicitDifferentialPoint({
      evaluate: (x, y, z) => x * x + y * y + z * z,
      point: [0, 0, 0],
      gradient: [0, 0, 0],
      hessian: [[2, 0, 0], [0, 2, 0], [0, 0, 2]],
    });
    expect(singular.masks).toMatchObject({ valid: false, singular: true, degenerate: true });
    expect(singular.normal).toBeNull();
    expect(singular.warnings.join(" ")).toMatch(/gradient is zero/i);
  });

  it("numerically estimates implicit derivatives without relabelling them analytic", () => {
    const point = analyzeImplicitDifferentialPoint({
      evaluate: (x, y, z) => x * x + y * y + z * z - 4,
      point: [2, 0, 0],
      step: 0.02,
    });
    expect(point.method).toBe("numerical-derivatives");
    close(point.gaussianCurvature, 0.25, 1e-5);
    close(point.meanCurvature, 0.5, 1e-5);
    expect(point.warnings.join(" ")).toMatch(/finite differences/i);
  });

  it("uses one-sided stencils and raises the boundary mask", () => {
    const plane = analyzeParametricDifferentialPoint({
      evaluate: (u, v) => [u, v, 0],
      u: 0,
      v: 0.5,
      domain: { u: { min: 0, max: 1 }, v: { min: 0, max: 1 } },
      step: [0.05, 0.05],
    });
    expect(plane.masks).toMatchObject({ valid: true, boundary: true, degenerate: false });
    close(plane.gaussianCurvature, 0);
    close(plane.meanCurvature, 0);
  });

  it("locks discrete inputs to mesh-approximation provenance", () => {
    const point = adaptMeshDifferentialPoint({
      position: [0, 0, 1], normal: [0, 0, 1], principalCurvatures: [0.8, 1.2],
      principalDirections: [[1, 0, 0], [0, -1, 0]], uncertainty: 0.03,
    });
    expect(point.method).toBe("mesh-approximation");
    close(point.principalCurvatures?.[0] ?? null, 1.2);
    close(point.principalCurvatures?.[1] ?? null, 0.8);
    close(point.gaussianCurvature, 0.96);
    close(point.meanCurvature, 1);
    expect(point.normal).toEqual([0, 0, 1]);
    expect(point.principalDirections?.[1]).toEqual([0, 1, 0]);
    expect(point.warnings.join(" ")).toMatch(/not an analytic/i);
  });

  it("publishes aligned arrays and every per-sample validity mask", () => {
    const valid = analyzeExactSurfaceDifferentialPoint({ definition: getGeometryExactSurfacePreset("plane"), u: 0, v: 0 });
    const singular = analyzeImplicitDifferentialPoint({
      evaluate: (x, y, z) => x * x + y * y + z * z,
      point: [0, 0, 0], gradient: [0, 0, 0], hessian: [[2, 0, 0], [0, 2, 0], [0, 0, 2]],
    });
    const field = buildSurfaceDifferentialField([valid, singular]);
    expect(field.sampleCount).toBe(2);
    expect(field.firstDerivatives).toHaveLength(12);
    expect(field.secondDerivatives).toHaveLength(18);
    expect([...field.validityMask]).toEqual([1, 0]);
    expect([...field.singularityMask]).toEqual([0, 1]);
    expect([...field.degeneracyMask]).toEqual([0, 1]);
    expect([...field.umbilicMask]).toEqual([1, 0]);
  });

  it("never labels a mesh-backed differential payload analytic", () => {
    const definition = adaptSurfaceDefinition({
      id: "mesh-surface",
      revision: 1,
      label: "Mesh sphere",
      representation: "mesh-backed",
      meshId: "mesh-1",
      domain: { kind: "mesh", vertexCount: 10, faceCount: 16 },
    });
    const sample = adaptMeshDifferentialPoint({ position: [0, 0, 1], normal: [0, 0, 1], principalCurvatures: [1, 1] });
    const payload = createSurfaceDifferentialPayload({ definition, method: "analytic", samples: [sample] });
    expect(payload.method).toBe("mesh-approximation");
    expect(payload.warnings.join(" ")).toMatch(/explicitly labelled mesh approximation/i);
  });
});
