import { describe, expect, it } from "vitest";
import { GRAPH2D_FUNCTIONS, evaluateGraph2DExpression, parseGraph2DExpression } from "@math3d/core";
import { graph2DFormulaFunctionGroups, insertGraph2DFormulaFunction } from "./Graph2DFormulaInput";

describe("Graph formula buttons", () => {
  it("wraps selected text with a supported function", () => {
    expect(insertGraph2DFormulaFunction("x+theta", 2, 7, "sin"))
      .toEqual({ value: "x+sin(theta)", cursor: 11 });
  });

  it("inserts an empty function at the caret and leaves the caret inside", () => {
    expect(insertGraph2DFormulaFunction("x+1", 2, 2, "exp"))
      .toEqual({ value: "x+exp()1", cursor: 6 });
  });

  it("offers every supported parser function exactly once", () => {
    const names = graph2DFormulaFunctionGroups.flatMap(group => group.functions.map(item => item.name));
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...GRAPH2D_FUNCTIONS].sort());
  });

  it.each([
    ["sinh(1)", Math.sinh(1)], ["cosh(1)", Math.cosh(1)], ["tanh(1)", Math.tanh(1)],
    ["asinh(1)", Math.asinh(1)], ["acosh(2)", Math.acosh(2)], ["atanh(0.5)", Math.atanh(.5)],
    ["cbrt(-8)", -2], ["log2(8)", 3], ["sinc(0)", 1], ["sinc(pi)", 0],
    ["sec(0)", 1], ["csc(pi/2)", 1], ["cot(pi/4)", 1],
    ["sign(-4)", -1], ["round(2.6)", 3], ["trunc(-2.6)", -2],
  ])("evaluates %s", (source, expected) => {
    const parsed = parseGraph2DExpression(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const value = evaluateGraph2DExpression(parsed.ast, {});
    expect(value.ok).toBe(true);
    if (value.ok) expect(value.value).toBeCloseTo(expected, 10);
  });

  it.each(["acosh(0)", "atanh(1)", "log2(0)", "csc(0)", "cot(0)", "sec(pi/2)"])(
    "reports the domain error for %s", source => {
      const parsed = parseGraph2DExpression(source);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const result = evaluateGraph2DExpression(parsed.ast, {});
      expect(result).toMatchObject({ ok: false, diagnostic: { code: "domain" } });
    });
});
