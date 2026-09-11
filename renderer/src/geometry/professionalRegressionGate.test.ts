import { describe, expect, it } from "vitest";
import {
  GEOMETRY_CANONICAL_CURVES,
  GEOMETRY_CANONICAL_SURFACES,
  GEOMETRY_CANONICAL_TOPOLOGY_CASES,
  GEOMETRY_TOLERANCE_CLASSES,
  circlePolygonLength,
  measureGeometryProfessionalPerformance,
  verifyCanonicalCurve,
  verifyCanonicalSurface,
  withinGeometryTolerance,
} from "./professionalRegressionGate";
import { evaluateExactCurveFrame } from "./exactCurveAnalysis";
import { evaluateExactSurfacePoint } from "./exactSurfaceAnalysis";

describe("Geometry professional regression gate", () => {
  it("covers the canonical curve, surface, solid and pathological inventory", () => {
    expect(GEOMETRY_CANONICAL_CURVES.map((entry) => entry.id)).toEqual(["line", "circle", "helix", "bezier", "bspline", "degenerate"]);
    expect(GEOMETRY_CANONICAL_SURFACES.map((entry) => entry.id)).toEqual(["plane", "sphere", "cylinder", "cone", "torus", "saddle", "ruled", "trimmed", "singular"]);
    expect(GEOMETRY_CANONICAL_TOPOLOGY_CASES.filter((entry) => entry.kind === "solid")).toHaveLength(2);
    expect(GEOMETRY_CANONICAL_TOPOLOGY_CASES.filter((entry) => entry.pathological).length).toBeGreaterThanOrEqual(6);
    expect(GEOMETRY_CANONICAL_CURVES.every(verifyCanonicalCurve)).toBe(true);
    expect(GEOMETRY_CANONICAL_SURFACES.every(verifyCanonicalSurface)).toBe(true);
  });

  it("documents and applies all five numerical tolerance classes", () => {
    expect(GEOMETRY_TOLERANCE_CLASSES.map((entry) => entry.id)).toEqual(["symbolic-identity", "machine-precision-analytic", "numerically-evaluated-analytic", "sampled-field", "mesh-approximation"]);
    expect(withinGeometryTolerance(1, 1, "symbolic-identity")).toBe(true);
    expect(withinGeometryTolerance(1 + 1e-13, 1, "machine-precision-analytic")).toBe(true);
    expect(withinGeometryTolerance(1.001, 1, "mesh-approximation")).toBe(true);
    expect(withinGeometryTolerance(1.02, 1, "mesh-approximation")).toBe(false);
  });

  it("passes convergence, perturbation, orientation, units and exact-versus-discrete checks", () => {
    const e16 = Math.abs(circlePolygonLength(16) - 2 * Math.PI);
    const e64 = Math.abs(circlePolygonLength(64) - 2 * Math.PI);
    const e256 = Math.abs(circlePolygonLength(256) - 2 * Math.PI);
    expect(e64).toBeLessThan(e16);
    expect(e256).toBeLessThan(e64);
    expect(withinGeometryTolerance(circlePolygonLength(256), 2 * Math.PI, "mesh-approximation")).toBe(true);

    const circle = GEOMETRY_CANONICAL_CURVES.find((entry) => entry.id === "circle")!;
    const frame = evaluateExactCurveFrame(circle, 0.75);
    expect(withinGeometryTolerance(frame.curvature ?? 0, 1, "machine-precision-analytic")).toBe(true);
    expect(withinGeometryTolerance((frame.curvature ?? 0) + 1e-6, 1, "sampled-field")).toBe(true);
    expect(withinGeometryTolerance(circlePolygonLength(128, 100), 200 * Math.PI, "mesh-approximation")).toBe(true);

    const sphere = GEOMETRY_CANONICAL_SURFACES.find((entry) => entry.id === "sphere")!;
    const outward = evaluateExactSurfacePoint({ definition: sphere, u: 0.7, v: 0.8 });
    const inward = evaluateExactSurfacePoint({ definition: { ...sphere, orientation: { sign: -1, description: "reversed" } }, u: 0.7, v: 0.8 });
    expect(withinGeometryTolerance(outward.gaussianCurvature ?? 0, inward.gaussianCurvature ?? 0, "numerically-evaluated-analytic")).toBe(true);
    expect(withinGeometryTolerance(outward.meanCurvature ?? 0, -(inward.meanCurvature ?? 0), "numerically-evaluated-analytic")).toBe(true);
  });

  it("keeps reviewed responsiveness budgets for all professional operations", () => {
    const results = measureGeometryProfessionalPerformance();
    expect(results.map((entry) => entry.id)).toEqual(["scene-load", "selection", "pointwise-analysis", "sample-10k", "sample-100k", "overlay-upload", "cancel-latency", "module-switch", "mesh-regeneration", "comparison"]);
    expect(results.filter((entry) => !entry.passed)).toEqual([]);
  });
});
