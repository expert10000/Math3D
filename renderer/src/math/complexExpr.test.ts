import { describe, expect, it } from "vitest";
import { compileComplexExpression } from "./complexExpr";
import { C } from "./complex";

function expectComplexNear(
  value: { re: number; im: number } | undefined,
  expected: { re: number; im: number },
  digits = 8
) {
  expect(value).toBeDefined();
  expect(value?.re).toBeCloseTo(expected.re, digits);
  expect(value?.im).toBeCloseTo(expected.im, digits);
}

describe("compileComplexExpression", () => {
  it("supports implicit multiplication with i", () => {
    const compiled = compileComplexExpression("z + 2i");
    expect(compiled.error).toBeUndefined();
    expectComplexNear(compiled.fn?.({ z: C(1, -1) }), C(1, 1));
  });

  it("evaluates unary negation", () => {
    const compiled = compileComplexExpression("-z");
    expect(compiled.error).toBeUndefined();
    expectComplexNear(compiled.fn?.({ z: C(2, -3) }), C(-2, 3));
  });

  it("evaluates complex functions", () => {
    const compiled = compileComplexExpression("exp(log(z))");
    expect(compiled.error).toBeUndefined();
    expectComplexNear(compiled.fn?.({ z: C(2, 0) }), C(2, 0), 6);
  });

  it("returns NaN for non-real powers", () => {
    const compiled = compileComplexExpression("z^(1+i)");
    expect(compiled.error).toBeUndefined();
    const out = compiled.fn?.({ z: C(2, 0) });
    expect(out?.re).toSatisfy(Number.isNaN);
    expect(out?.im).toSatisfy(Number.isNaN);
  });

  it("returns an error for unknown identifiers", () => {
    const compiled = compileComplexExpression("foo + z");
    expect(compiled.fn).toBeUndefined();
    expect(compiled.error?.message).toContain("Unknown identifier");
  });

  it("respects allowed variable whitelist", () => {
    const compiled = compileComplexExpression("u + 1", ["z"]);
    expect(compiled.fn).toBeUndefined();
    expect(compiled.error?.message).toContain("Unknown identifier");
  });
});
