import { describe, expect, it } from "vitest";
import { analyzeGraph2DIntegral, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, isGraph2DIntegralCurrent } from "@math3d/core";

const documentFor = (expression: string) => {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("integral:" + expression), {
    type: "create", draft: { label: "f", expression,
      domain: { min: -10, max: 10, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display, stableKey: "integral:" + expression });
};
const analyze = (expression: string, mode: "signed" | "absolute", min = -1, max = 1) =>
  analyzeGraph2DIntegral({ document: documentFor(expression), objectId: "function_1",
    interval: { min, max }, mode });

describe("Graph2D interval integration", () => {
  it("integrates a quadratic with an error estimate and bounded fill geometry", () => {
    const document = documentFor("x^2");
    const result = analyzeGraph2DIntegral({ document, objectId: "function_1",
      interval: { min: -1, max: 1 }, mode: "signed" });
    expect(result.status).toBe("complete");
    expect(result.value).toBeCloseTo(2 / 3, 8);
    expect(result.errorEstimate).not.toBeNull();
    expect(result.evaluations).toBeLessThanOrEqual(12000);
    expect(result.fillSegments).toHaveLength(256);
    expect(result.fillSegments.every((segment) => segment.resultId === result.resultId)).toBe(true);
    expect(result.publication.resultId).toBe(result.resultId);
    expect(isGraph2DIntegralCurrent(result, document)).toBe(true);
  });

  it("distinguishes signed cancellation from absolute area", () => {
    expect(analyze("x", "signed").value).toBeCloseTo(0, 8);
    expect(analyze("x", "absolute").value).toBeCloseTo(1, 8);
  });

  it("marks a singular interval incomplete and retains only partial fill segments", () => {
    const result = analyze("1/x", "signed");
    expect(result.status).toBe("incomplete");
    expect(result.value).toBeNull();
    expect(result.skippedCells).toBeGreaterThan(0);
    expect(result.fillSegments.length).toBeLessThan(256);
    expect(result.errorEstimate).toBeNull();
    const offGrid = analyze("1/(x-0.2)", "signed");
    expect(offGrid.status).toBe("incomplete");
    expect(offGrid.value).toBeNull();
  });

  it("splits a partially undefined source domain", () => {
    const result = analyze("sqrt(x)", "absolute");
    expect(result.status).toBe("incomplete");
    expect(result.value).toBeNull();
    expect(result.partialValue).toBeCloseTo(2 / 3, 3);
  });
});
