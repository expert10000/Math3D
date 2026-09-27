import { describe, expect, it } from "vitest";
import { analyzeGraph2DIntersections, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, isGraph2DIntersectionCurrent } from "@math3d/core";

const documentFor = (first: string, second: string) => {
  let document = createEmptyGraph2DDocument(`intersection:${first}:${second}`);
  for (const [label, expression] of [["f", first], ["g", second]]) {
    const scene = applyGraph2DAuthoring(document, { type: "create", draft: { label, expression,
      domain: { min: -10, max: 10, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    document = createGraph2DDocument({ source: scene.source, display: scene.display,
      stableKey: `intersection:${first}:${second}` });
  }
  return document;
};
const analyze = (first: string, second: string, min = -2, max = 2) =>
  analyzeGraph2DIntersections({ document: documentFor(first, second),
    firstObjectId: "function_1", secondObjectId: "function_2", interval: { min, max } });
const near = (values: readonly { x: number }[], x: number, tolerance = 1e-4) =>
  values.some((entry) => Math.abs(entry.x - x) < tolerance);

describe("Graph2D pairwise intersections", () => {
  it("refines two crossings and links candidates to the exact pair result", () => {
    const document = documentFor("x^2", "1");
    const result = analyzeGraph2DIntersections({ document, firstObjectId: "function_1",
      secondObjectId: "function_2", interval: { min: -2, max: 2 } });
    expect(result.status).toBe("complete");
    expect(near(result.candidates, -1)).toBe(true);
    expect(near(result.candidates, 1)).toBe(true);
    expect(result.candidates.every((entry) => entry.classification === "crossing" &&
      entry.resultId === result.resultId && entry.residual <= 1e-7)).toBe(true);
    expect(result.evaluations).toBeLessThanOrEqual(12000);
    expect(isGraph2DIntersectionCurrent(result, document)).toBe(true);
  });

  it("reports an even tangency as possible, including off-grid", () => {
    const atZero = analyze("x^2", "0");
    expect(near(atZero.candidates.filter((entry) => entry.classification === "tangent-possible"), 0)).toBe(true);
    const shifted = analyze("(x-0.3)^2", "0");
    expect(near(shifted.candidates.filter((entry) => entry.classification === "tangent-possible"), 0.3)).toBe(true);
  });

  it("rejects poles and keeps unresolved brackets visible", () => {
    const reciprocal = analyze("1/x", "0");
    expect(reciprocal.candidates).toHaveLength(0);
    expect(reciprocal.invalidCells).toBeGreaterThan(0);
    const tangent = analyze("tan(x)", "0");
    expect(near(tangent.candidates, 0)).toBe(true);
    expect(tangent.candidates.some((entry) => Math.abs(Math.abs(entry.x) - Math.PI / 2) < 1e-3)).toBe(false);
    expect(tangent.unresolvedBrackets).toBeGreaterThan(0);
  });

  it("flags coincident functions instead of manufacturing many isolated crossings", () => {
    const result = analyze("x^2", "x^2");
    expect(result.status).toBe("incomplete");
    expect(result.candidates).toHaveLength(0);
    expect(result.coincidentCells).toBeGreaterThan(0);
  });

  it("requires an explicit distinct pair", () => {
    const document = documentFor("x", "2*x");
    expect(() => analyzeGraph2DIntersections({ document, firstObjectId: "function_1",
      secondObjectId: "function_1" })).toThrow();
  });
});
