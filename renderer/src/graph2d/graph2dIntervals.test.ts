import { describe, expect, it } from "vitest";
import { analyzeGraph2DIntervals, applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  isGraph2DIntervalAnalysisCurrent, type Graph2DDocument } from "@math3d/core";

const documentFor = (expression: string): Graph2DDocument => {
  const scene = applyGraph2DAuthoring(createEmptyGraph2DDocument("interval:" + expression), { type: "create", draft: {
    label: "f", expression, domain: { min: -10, max: 10, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true },
  } });
  return createGraph2DDocument({ source: scene.source, display: scene.display, stableKey: "interval:" + expression });
};
const analyze = (expression: string) => analyzeGraph2DIntervals({ document: documentFor(expression),
  objectId: "function_1", interval: { min: -2, max: 2 } });
const at = (result: ReturnType<typeof analyze>, x: number) =>
  result.partitions.find((part) => x > part.min && x < part.max);

describe("Graph2D interval diagnostics", () => {
  it("partitions x² at its minimum and shares the table/overlay identity", () => {
    const document = documentFor("x^2");
    const result = analyzeGraph2DIntervals({ document, objectId: "function_1", interval: { min: -2, max: 2 } });
    expect(at(result, -1)?.monotonicity).toBe("decreasing");
    expect(at(result, 1)?.monotonicity).toBe("increasing");
    expect(at(result, -1)?.concavity).toBe("up");
    expect(at(result, 1)?.concavity).toBe("up");
    expect(result.partitions.every((part) => part.resultId === result.resultId)).toBe(true);
    expect(result.publication.resultId).toBe(result.resultId);
    expect(isGraph2DIntervalAnalysisCurrent(result, document)).toBe(true);
  });

  it("separates concavity at an inflection without inventing an extremum", () => {
    const result = analyze("x^3");
    expect(at(result, -1)?.monotonicity).toBe("increasing");
    expect(at(result, 1)?.monotonicity).toBe("increasing");
    expect(at(result, -1)?.concavity).toBe("down");
    expect(at(result, 1)?.concavity).toBe("up");
  });

  it("isolates an undefined sample as unknown rather than asserting smooth signs", () => {
    const result = analyze("1/x");
    expect(result.invalidSamples).toBeGreaterThan(0);
    expect(at(result, 0)?.monotonicity).toBe("unknown");
    expect(at(result, 0)?.concavity).toBe("unknown");
    expect(at(result, -1)?.monotonicity).toBe("decreasing");
    expect(at(result, 1)?.monotonicity).toBe("decreasing");
  });

  it("does not assign a sign outside the source domain", () => {
    const document = documentFor("x^2");
    const result = analyzeGraph2DIntervals({ document, objectId: "function_1", interval: { min: 11, max: 12 } });
    expect(result.status).toBe("unavailable");
    expect(result.partitions).toHaveLength(0);
  });
});
