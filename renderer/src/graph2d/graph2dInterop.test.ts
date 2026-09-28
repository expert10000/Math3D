import { describe, expect, it } from "vitest";
import { createGraph2DDocument, locateGraph2DPromotionSource, locateGraph2DPromotionTarget,
  parseGraph2DExpression, promoteGraph2DToCurve, type Graph2DGraphObject } from "@math3d/core";

const parsed = (source: string, variables: string[]) => {
  const result = parseGraph2DExpression(source, variables);
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result.ast;
};
const domain = { min: -2, max: 3, includeMin: false, includeMax: true } as const;
const graph = (object: Graph2DGraphObject) => createGraph2DDocument({ stableKey: "interop",
  source: { objects: [object], variables: [], assumptions: [] } });

describe("Graph2D Curve promotion", () => {
  it("promotes explicit sources with exact expressions, domains, and trace mapping", () => {
    const source = graph({ id: "function_1", kind: "explicit-cartesian", label: "quadratic",
      expression: { source: "x^2+1", variable: "x", ast: parsed("x^2+1", ["x"]) }, domain });
    const promotion = promoteGraph2DToCurve(source, "function_1");
    expect(promotion.document.source.representation).toBe("explicit");
    expect(promotion.document.source.definition.expressions).toEqual({ x: "x", y: "x^2+1" });
    expect(promotion.document.source.domain).toMatchObject({ parameter: "x", min: -2, max: 3 });
    expect(promotion.document.source.definition.settings).toMatchObject({ includeMin: false, includeMax: true });
    expect(promotion.relation.kind).toBe("promoted-from");
    expect(locateGraph2DPromotionSource(promotion)).toMatchObject({ objectId: "function_1", revision: source.identity.revision });
    expect(locateGraph2DPromotionTarget(promotion).documentId).toBe(promotion.document.identity.id);
  });

  it("promotes parametric sources as normal two-dimensional Curve documents", () => {
    const source = graph({ id: "parametric_1", kind: "parametric", label: "arc",
      xExpression: { source: "cos(t)", variable: "t", ast: parsed("cos(t)", ["t"]) },
      yExpression: { source: "sin(t)", variable: "t", ast: parsed("sin(t)", ["t"]) }, domain });
    const promotion = promoteGraph2DToCurve(source, "parametric_1");
    expect(promotion.document.source).toMatchObject({ representation: "parametric", dimension: 2,
      definition: { expressions: { x: "cos(t)", y: "sin(t)" } } });
    expect(() => promoteGraph2DToCurve(source, "missing")).toThrow(/explicit or parametric/);
  });
});
