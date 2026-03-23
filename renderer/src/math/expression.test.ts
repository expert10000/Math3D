import { describe, expect, it } from "vitest";
import { compileExpression } from "./expression";

describe("compileExpression", () => {
  it("evaluates arithmetic with variables", () => {
    const compiled = compileExpression("2*x + y/2", ["x", "y"]);
    expect(compiled.error).toBeUndefined();
    expect(compiled.fn?.({ x: 3, y: 8 })).toBe(10);
  });

  it("supports implicit multiplication", () => {
    const compiled = compileExpression("2x + 3(y + 1)", ["x", "y"]);
    expect(compiled.error).toBeUndefined();
    expect(compiled.fn?.({ x: 2, y: 4 })).toBe(19);
  });

  it("uses right-associative exponentiation", () => {
    const compiled = compileExpression("2^3^2", []);
    expect(compiled.error).toBeUndefined();
    expect(compiled.fn?.({})).toBe(512);
  });

  it("evaluates builtin functions", () => {
    const compiled = compileExpression("max(1, 2, min(4, 3))", []);
    expect(compiled.error).toBeUndefined();
    expect(compiled.fn?.({})).toBe(3);
  });

  it("evaluates single-argument trig functions with radians", () => {
    const compiled = compileExpression("cos(t) + sin(pi/2)", ["t"]);
    expect(compiled.error).toBeUndefined();
    expect(compiled.fn?.({ t: 0 })).toBeCloseTo(2, 8);
    expect(compiled.fn?.({ t: Math.PI })).toBeCloseTo(0, 8);
  });

  it("returns an error for unknown identifiers", () => {
    const compiled = compileExpression("foo + 1", ["x"]);
    expect(compiled.fn).toBeUndefined();
    expect(compiled.error?.message).toContain("Unknown identifier");
  });

  it("returns an error for mismatched parentheses", () => {
    const compiled = compileExpression("(1 + 2", []);
    expect(compiled.fn).toBeUndefined();
    expect(compiled.error?.message).toContain("Mismatched");
  });
});
