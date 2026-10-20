import { describe, expect, it } from "vitest";
import { parseGraph2DExpression } from "@math3d/core";
import { graph2DExpressionInterval } from "../../../packages/core/src/graph2dInterval";

const interval = (source: string, x: readonly [number, number], y: readonly [number, number]) => {
  const parsed = parseGraph2DExpression(source, ["x", "y"]);
  if (!parsed.ok) throw new Error("Invalid fixture expression");
  return graph2DExpressionInterval(parsed.ast, x, y);
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
});
