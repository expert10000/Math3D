import { describe, expect, it } from "vitest";
import { buildComplexMapSweep, compileComplexMapExpressions, type ComplexMapSweepSpec } from "./complexMapSweep";

const baseSpec: ComplexMapSweepSpec = {
  inputMode: "reim",
  fExpr: "z",
  reExpr: "u",
  imExpr: "v",
  uMin: -1,
  uMax: 1,
  vMin: -1,
  vMax: 1,
  nu: 8,
  nv: 8,
  sweepAxis: "v",
  outputMode: "sweep",
  wScale: 1,
  clampAbs: null,
  showIsolines: false,
  isolinesCountU: 4,
  isolinesCountV: 4,
  mapMode: "standard",
  sheetCount: 2,
  sheetMode: "single",
  sheetIndex: 0,
  branchCutAngle: 0,
};

describe("complexMapSweep f(z) parser", () => {
  it("evaluates direct f(z) expressions", () => {
    const compiled = compileComplexMapExpressions("u", "v", { inputMode: "fz", fExpr: "z^2" });
    expect(compiled.error).toBeUndefined();
    expect(compiled.reFn?.(2, 3)).toBeCloseTo(-5, 8);
    expect(compiled.imFn?.(2, 3)).toBeCloseTo(12, 8);
  });

  it("accepts f(z)=... and w=... prefixes", () => {
    const a = compileComplexMapExpressions("u", "v", { inputMode: "fz", fExpr: "f(z)=z+i" });
    const b = compileComplexMapExpressions("u", "v", { inputMode: "fz", fExpr: "w=z+i" });
    expect(a.error).toBeUndefined();
    expect(b.error).toBeUndefined();
    expect(a.reFn?.(1, 2)).toBeCloseTo(1, 8);
    expect(a.imFn?.(1, 2)).toBeCloseTo(3, 8);
    expect(b.reFn?.(1, 2)).toBeCloseTo(1, 8);
    expect(b.imFn?.(1, 2)).toBeCloseTo(3, 8);
  });

  it("builds surface geometry using f(z) mode", () => {
    const res = buildComplexMapSweep({
      ...baseSpec,
      inputMode: "fz",
      fExpr: "z^2 + 1",
    });
    expect(res.error).toBeUndefined();
    expect(res.build).toBeDefined();
    expect((res.build?.indices.length ?? 0) > 0).toBe(true);
  });
});
