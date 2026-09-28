import { describe, expect, it } from "vitest";
import {
  createGraph2DDocument, evaluateGraph2DPiecewise, inspectGraph2DPiecewiseDomains,
  parseGraph2DExpression, parseGraph2DInterval, sampleGraph2DPiecewise,
  serializeGraph2DDocument, type Graph2DPiecewiseObject,
} from "@math3d/core";

const expression = (source: string) => {
  const parsed = parseGraph2DExpression(source, ["x"]);
  if (!parsed.ok) throw new Error(parsed.errors.join(" "));
  return { source, variable: "x" as const, ast: parsed.ast };
};

const object: Graph2DPiecewiseObject = {
  id: "piecewise_1", kind: "piecewise", label: "p",
  pieces: [
    { expression: expression("-x"), domain: parseGraph2DInterval("[-2, 0)") },
    { expression: expression("x^2"), domain: parseGraph2DInterval("[0, 2]") },
  ],
};

describe("Graph2D piecewise expressions", () => {
  it("parses interval endpoint intent and rejects invalid notation", () => {
    expect(parseGraph2DInterval("(-1, 2]")).toEqual({ min: -1, max: 2, includeMin: false, includeMax: true });
    expect(() => parseGraph2DInterval("[2, 1]")).toThrow(/increasing/);
  });

  it("reports gaps and overlaps while evaluating only included endpoints", () => {
    expect(inspectGraph2DPiecewiseDomains(object)).toEqual([]);
    expect(evaluateGraph2DPiecewise(object, {}, -2)?.y).toBe(2);
    expect(evaluateGraph2DPiecewise(object, {}, 0)?.y).toBe(0);
    expect(evaluateGraph2DPiecewise(object, {}, 3)).toBeNull();
    expect(inspectGraph2DPiecewiseDomains({ pieces: [
      object.pieces[0]!, { ...object.pieces[1]!, domain: parseGraph2DInterval("(0, 2]") },
    ] })[0]?.kind).toBe("gap");
  });

  it("samples pieces independently and preserves open and closed boundaries", () => {
    const artifact = sampleGraph2DPiecewise({ object, viewport: { xMin: -3, xMax: 3, yMin: -1, yMax: 4, aspect: "equal" },
      width: 600, height: 400, policy: { maxSamples: 1200, maxDepth: 10, tolerancePx: 0.75 } });
    expect(artifact.segments.length).toBeGreaterThanOrEqual(2);
    expect(artifact.segments.some((segment) => segment.openEnd)).toBe(true);
    expect(artifact.segments.some((segment) => !segment.openStart && segment.points[0]?.x === 0)).toBe(true);
  });

  it("round-trips the portable piecewise capability", () => {
    const document = createGraph2DDocument({ source: { objects: [object], variables: [], assumptions: [] }, stableKey: "piecewise" });
    expect(document.requiredCapabilities).toContain("graph2d.piecewise.v1");
    expect(JSON.parse(serializeGraph2DDocument(document)).source.objects[0].pieces).toHaveLength(2);
  });
});
