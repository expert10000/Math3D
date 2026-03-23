import { describe, expect, it } from "vitest";
import {
  buildSplineSurfacePointEvaluator,
  isSplinePatchSurfaceId,
  DEFAULT_BSPLINE_CONTROL_GRID_TEXT,
} from "./splineSurface";

describe("spline surface evaluators", () => {
  it("evaluates the Bezier patch corners from the control grid", () => {
    const evalBezier = buildSplineSurfacePointEvaluator("bezierSurface");
    expect(evalBezier).toBeTypeOf("function");
    if (!evalBezier) return;

    const p00 = evalBezier(0, 0);
    const p11 = evalBezier(1, 1);
    expect(p00.x).toBeCloseTo(-1.6, 6);
    expect(p00.y).toBeCloseTo(-1.6, 6);
    expect(p00.z).toBeCloseTo(-0.4, 6);
    expect(p11.x).toBeCloseTo(1.6, 6);
    expect(p11.y).toBeCloseTo(1.6, 6);
    expect(p11.z).toBeCloseTo(-0.35, 6);
  });

  it("evaluates B-spline and NURBS patches to finite points", () => {
    const evalBSpline = buildSplineSurfacePointEvaluator("bSplineSurface");
    const evalNurbs = buildSplineSurfacePointEvaluator("nurbsSurface");
    expect(evalBSpline).toBeTypeOf("function");
    expect(evalNurbs).toBeTypeOf("function");
    if (!evalBSpline || !evalNurbs) return;

    const pB = evalBSpline(0.68, 0.41);
    const pN = evalNurbs(0.68, 0.41);
    expect(Number.isFinite(pB.x)).toBe(true);
    expect(Number.isFinite(pB.y)).toBe(true);
    expect(Number.isFinite(pB.z)).toBe(true);
    expect(Number.isFinite(pN.x)).toBe(true);
    expect(Number.isFinite(pN.y)).toBe(true);
    expect(Number.isFinite(pN.z)).toBe(true);
  });

  it("applies NURBS weights differently than non-rational B-spline", () => {
    const evalBSpline = buildSplineSurfacePointEvaluator("bSplineSurface");
    const evalNurbs = buildSplineSurfacePointEvaluator("nurbsSurface");
    expect(evalBSpline).toBeTypeOf("function");
    expect(evalNurbs).toBeTypeOf("function");
    if (!evalBSpline || !evalNurbs) return;

    const pB = evalBSpline(0.68, 0.41);
    const pN = evalNurbs(0.68, 0.41);
    expect(Math.abs(pB.z - pN.z)).toBeGreaterThan(1e-3);
  });

  it("recognizes spline patch ids", () => {
    expect(isSplinePatchSurfaceId("bezierSurface")).toBe(true);
    expect(isSplinePatchSurfaceId("bSplineSurface")).toBe(true);
    expect(isSplinePatchSurfaceId("nurbsSurface")).toBe(true);
    expect(isSplinePatchSurfaceId("plane")).toBe(false);
  });

  it("accepts editable control net and knot parameters", () => {
    const evalBezier = buildSplineSurfacePointEvaluator("bezierSurface", {
      bezierControlGridText: `
        0,0,0; 1,0,0
        0,1,0; 1,1,1
      `,
    });
    expect(evalBezier).toBeTypeOf("function");
    if (!evalBezier) return;
    const p = evalBezier(1, 1);
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.y).toBeCloseTo(1, 6);
    expect(p.z).toBeCloseTo(1, 6);

    const evalBSpline = buildSplineSurfacePointEvaluator("bSplineSurface", {
      bSplineControlGridText: DEFAULT_BSPLINE_CONTROL_GRID_TEXT,
      bSplineDegreeU: 2,
      bSplineDegreeV: 2,
      bSplineKnotUText: "0,0,0,0.33,0.66,1,1,1",
      bSplineKnotVText: "0,0,0,0.33,0.66,1,1,1",
    });
    expect(evalBSpline).toBeTypeOf("function");
    if (!evalBSpline) return;
    const q = evalBSpline(0.23, 0.71);
    expect(Number.isFinite(q.x)).toBe(true);
    expect(Number.isFinite(q.y)).toBe(true);
    expect(Number.isFinite(q.z)).toBe(true);
  });
});
