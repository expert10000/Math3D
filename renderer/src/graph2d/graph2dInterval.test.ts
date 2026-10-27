import { describe, expect, it } from "vitest";
import { parseGraph2DExpression } from "@math3d/core";
import { graph2DExpressionInterval, graph2DExpressionPossibleDomainBoundary } from "../../../packages/core/src/graph2dInterval";

const interval = (source: string, x: readonly [number, number], y: readonly [number, number]) => {
  const parsed = parseGraph2DExpression(source, ["x", "y"]);
  if (!parsed.ok) throw new Error("Invalid fixture expression");
  return graph2DExpressionInterval(parsed.ast, x, y);
};
const boundary = (source: string, x: readonly [number, number]) => {
  const parsed = parseGraph2DExpression(source, ["x"]);
  if (!parsed.ok) throw new Error("Invalid fixture expression");
  return graph2DExpressionPossibleDomainBoundary(parsed.ast, x);
};

describe("Graph implicit interval screen", () => {
  it("excludes zero for a positive polynomial cell", () => {
    const result = interval("x^2+y^2+1", [-.5, .5], [-.5, .5]);
    expect(result?.[0]).toBeGreaterThan(0);
  });

  it("keeps cells that may contain an isolated zero", () => {
    const result = interval("(x-0.03)^2+(y-0.03)^2", [0, .1], [0, .1]);
    expect(result?.[0]).toBeLessThanOrEqual(0);
    expect(result?.[1]).toBeGreaterThan(0);
  });

  it("declines unsupported transcendental bounds", () => {
    expect(interval("sin(x)+y", [-1, 1], [-1, 1])).toBeNull();
  });

  it("screens off-grid poles and real-domain edges without flagging safe cells", () => {
    expect(boundary("1/(x-0.003)", [0, 0.01])).toBe(true);
    expect(boundary("1/(x-0.003)", [0.004, 0.01])).toBe(false);
    expect(boundary("1/(x^2+1)", [-2, 2])).toBe(false);
    expect(boundary("tan(x)", [1.5, 1.6])).toBe(true);
    expect(boundary("tan(x)", [0, 1])).toBe(false);
    expect(boundary("cot(x)", [-0.1, 0.1])).toBe(true);
    expect(boundary("sqrt(x-0.003)", [0, 0.01])).toBe(true);
    expect(boundary("log(x-0.003)", [0, 0.01])).toBe(true);
    expect(boundary("x^0.5", [-1, 1])).toBe(true);
  });
});
