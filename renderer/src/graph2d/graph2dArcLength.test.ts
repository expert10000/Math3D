import { describe, expect, it } from "vitest";
import { analyzeGraph2DArcLength, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, isGraph2DArcLengthCurrent } from "@math3d/core";

const documentFor = (expression: string) => {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("length:" + expression), {
    type: "create", draft: { label: "f", expression,
      domain: { min: -10, max: 10, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display, stableKey: "length:" + expression });
};
const analyze = (expression: string, min = -1, max = 1) =>
  analyzeGraph2DArcLength({ document: documentFor(expression), objectId: "function_1",
    interval: { min, max } });

describe("Graph2D arc length", () => {
  it("measures horizontal and sloped lines", () => {
    expect(analyze("0").value).toBeCloseTo(2, 8);
    expect(analyze("x").value).toBeCloseTo(2 * Math.SQRT2, 8);
  });

  it("integrates a curved source with provenance and bounded work", () => {
    const document = documentFor("x^2");
    const result = analyzeGraph2DArcLength({ document, objectId: "function_1",
      interval: { min: 0, max: 1 } });
    expect(result.status).toBe("complete");
    expect(result.value).toBeCloseTo((Math.sqrt(5) + Math.asinh(2) / 2) / 2, 5);
    expect(result.errorEstimate).not.toBeNull();
    expect(result.evaluations).toBeLessThanOrEqual(12000);
    expect(result.publication.resultId).toBe(result.resultId);
    expect(isGraph2DArcLengthCurrent(result, document)).toBe(true);
  });

  it("withholds a full-interval answer at singular and undefined cells", () => {
    const singular = analyze("1/x");
    expect(singular.status).toBe("unavailable");
    expect(singular.value).toBeNull();
    expect(singular.unresolvedCells).toBeGreaterThan(0);
    const domainGap = analyze("sqrt(x)");
    expect(domainGap.status).toBe("unavailable");
    expect(domainGap.value).toBeNull();
  });
});
