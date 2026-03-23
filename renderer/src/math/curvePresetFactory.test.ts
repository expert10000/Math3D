import { describe, expect, it } from "vitest";
import { buildCurveFromPreset } from "./curvePresetFactory";

describe("buildCurveFromPreset", () => {
  it("builds formula-based curves and supports uppercase PI constant", () => {
    const result = buildCurveFromPreset({
      id: "lissajous2d",
      label: "Lissajous",
      kind: "parametric",
      dimension: 2,
      formulas: { x: "sin(3*t + PI/2)", y: "sin(4*t)" },
      domain: { tMin: 0, tMax: Math.PI * 2, closed: true },
    });

    expect(result.errors).toHaveLength(0);
    expect(result.curve).toBeTruthy();
    const mid = result.curve?.eval(Math.PI / 3);
    expect(mid?.x).toSatisfy(Number.isFinite);
    expect(mid?.y).toSatisfy(Number.isFinite);
  });

  it("builds special B-spline demo evaluator", () => {
    const result = buildCurveFromPreset({
      id: "bSplineDemo",
      label: "B-spline demo",
      kind: "bspline",
      dimension: 3,
      formulas: {
        x: "sum_i N_i,p(t) * P_i.x",
        y: "sum_i N_i,p(t) * P_i.y",
        z: "sum_i N_i,p(t) * P_i.z",
      },
      domain: { tMin: 0, tMax: 1, closed: false },
    });

    expect(result.errors).toHaveLength(0);
    expect(result.source).toBe("special");
    expect(result.curve?.dimension).toBe(3);
    const p = result.curve?.eval(0.45) as { x: number; y: number; z: number } | undefined;
    expect(p?.x).toSatisfy(Number.isFinite);
    expect(p?.y).toSatisfy(Number.isFinite);
    expect(p?.z).toSatisfy(Number.isFinite);
  });

  it("evaluates helix preset in radians with multiple turns over 10pi", () => {
    const result = buildCurveFromPreset({
      id: "helix3d",
      label: "Helix",
      kind: "parametric",
      dimension: 3,
      formulas: { x: "cos(t)", y: "sin(t)", z: "0.2*t" },
      domain: { tMin: 0, tMax: Math.PI * 10, closed: false },
    });

    expect(result.errors).toHaveLength(0);
    const p0 = result.curve?.eval(0) as { x: number; y: number; z: number } | undefined;
    const p1 = result.curve?.eval(Math.PI / 2) as { x: number; y: number; z: number } | undefined;
    const pEnd = result.curve?.eval(Math.PI * 10) as { x: number; y: number; z: number } | undefined;
    expect(p0?.x).toBeCloseTo(1, 6);
    expect(p0?.y).toBeCloseTo(0, 6);
    expect(p1?.x).toBeCloseTo(0, 6);
    expect(p1?.y).toBeCloseTo(1, 6);
    expect(pEnd?.x).toBeCloseTo(1, 6);
    expect(pEnd?.y).toBeCloseTo(0, 6);
    expect(pEnd?.z).toBeCloseTo(0.2 * Math.PI * 10, 6);
  });

  it("builds special NURBS quarter arc evaluator", () => {
    const result = buildCurveFromPreset({
      id: "nurbsQuarterArc",
      label: "NURBS quarter arc",
      kind: "nurbs",
      dimension: 2,
      formulas: {
        x: "sum_i N_i,p(t) * w_i * P_i.x / sum_i N_i,p(t)*w_i",
        y: "sum_i N_i,p(t) * w_i * P_i.y / sum_i N_i,p(t)*w_i",
      },
      domain: { tMin: 0, tMax: 1, closed: false },
    });

    expect(result.errors).toHaveLength(0);
    expect(result.source).toBe("special");
    const start = result.curve?.eval(0);
    const end = result.curve?.eval(1);
    expect(start?.x).toBeCloseTo(1, 6);
    expect(start?.y).toBeCloseTo(0, 6);
    expect(end?.x).toBeCloseTo(0, 6);
    expect(end?.y).toBeCloseTo(1, 6);
  });

  it("returns compile errors for invalid formulas", () => {
    const result = buildCurveFromPreset({
      id: "broken",
      label: "Broken",
      kind: "custom",
      dimension: 2,
      formulas: { x: "sin(t", y: "foo(t)" },
      domain: { tMin: 0, tMax: 1, closed: false },
    });

    expect(result.curve).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
