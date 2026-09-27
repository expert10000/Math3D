import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  evaluateGraph2DRegion, inspectGraph2DCompatibility, normalizeGraph2DDocument,
  sampleGraph2DInequality } from "@math3d/core";

const domain = { min: -2, max: 2, includeMin: true, includeMax: true };
const viewport = { xMin: -2, xMax: 2, yMin: -2, yMax: 2, aspect: "free" as const };
const policy = { maxSamples: 5000, maxDepth: 10, tolerancePx: 0.75 };
const create = (operator: "all" | "any", clauses: readonly { expression: string;
  comparator: "<" | "<=" | ">" | ">=" }[]) => {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("region:" + operator), {
    type: "create-inequality", draft: { label: "region", clauses, operator, domain, yDomain: domain,
      style: { color: "#0d9488", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display,
    selection: scene.selection, stableKey: "region:" + operator });
};

describe("Graph2D inequality regions", () => {
  it("persists typed predicates and evaluates AND/OR including strict boundaries", () => {
    const clauses = [{ expression: "x", comparator: ">" as const },
      { expression: "y", comparator: ">=" as const }];
    const and = create("all", clauses), or = create("any", clauses);
    expect(and.requiredCapabilities).toContain("graph2d.inequality.v1");
    expect(inspectGraph2DCompatibility(and).status).toBe("current");
    expect(normalizeGraph2DDocument(and).ok).toBe(true);
    const a = and.source.objects[0]!, b = or.source.objects[0]!;
    if (a.kind !== "inequality" || b.kind !== "inequality") throw new Error("Expected regions.");
    expect(evaluateGraph2DRegion(a, {}, 0, 1)).toBe(false);
    expect(evaluateGraph2DRegion(a, {}, 1, 0)).toBe(true);
    expect(evaluateGraph2DRegion(a, {}, -1, 1)).toBe(false);
    expect(evaluateGraph2DRegion(b, {}, -1, 1)).toBe(true);
    expect(evaluateGraph2DRegion(b, {}, -1, -1)).toBe(false);
  });

  it("derives bounded fill and open/closed boundary groups", () => {
    const document = create("all", [{ expression: "x", comparator: ">" },
      { expression: "y", comparator: ">=" }]);
    const object = document.source.objects[0]!;
    if (object.kind !== "inequality") throw new Error("Expected region.");
    const artifact = sampleGraph2DInequality({ object, viewport, width: 400, height: 400, policy });
    expect(artifact.samplesEvaluated).toBeLessThanOrEqual(policy.maxSamples);
    expect(artifact.fills.length).toBeGreaterThan(0);
    expect(artifact.boundaries.map((entry) => entry.strict)).toEqual([true, false]);
    expect(artifact.boundaries.every((entry) => entry.segments.length > 0)).toBe(true);
    expect(artifact.fills.every((fill) => fill.xMin > -0.2 && fill.yMin > -0.2)).toBe(true);
  });

  it("reports undefined cells and complexity limits", () => {
    const document = create("all", [{ expression: "1/x", comparator: ">=" }]);
    const object = document.source.objects[0]!;
    if (object.kind !== "inequality") throw new Error("Expected region.");
    const limited = sampleGraph2DInequality({ object, viewport, width: 400, height: 400,
      policy: { ...policy, maxSamples: 64 } });
    expect(limited.state).toBe("complexity-limit");
    const singular = sampleGraph2DInequality({ object, viewport, width: 400, height: 400, policy });
    expect(singular.state).toBe("unresolved");
    expect(singular.diagnostics.some((entry) => entry.code === "invalid-sample")).toBe(true);
  });
});
