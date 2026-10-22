import { describe, expect, it } from "vitest";
import { analyzeGraph2DVectorField, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, sampleGraph2DPhasePortrait, type Graph2DPhasePortraitDraft } from "@math3d/core";

const bounds = { min: -2, max: 2, includeMin: true, includeMax: true };
const viewport = { xMin: -2, xMax: 2, yMin: -2, yMax: 2, aspect: "free" as const };
const field = (xDerivative: string, yDerivative: string) => {
  const draft: Graph2DPhasePortraitDraft = { label: "field", xDerivative, yDerivative,
    domain: bounds, yDomain: bounds, seeds: [{ x: 1, y: 0 }], timeSpan: 2,
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } };
  const document = createGraph2DDocument({ ...applyGraph2DAuthoring(createEmptyGraph2DDocument("field"),
    { type: "create-phase-portrait", draft }), stableKey: "field" });
  const object = document.source.objects[0];
  if (object?.kind !== "phase-portrait") throw new Error("Missing phase field.");
  return object;
};

describe("GRA-N23 independent planar vector-field diagnostics", () => {
  it("measures divergence and curl on a bounded grid without changing orbit sampling", () => {
    const object = field("y", "-x");
    const request = { object, variables: {}, viewport };
    const scene = sampleGraph2DPhasePortrait({ ...request, width: 400, height: 400,
      maxSamples: 2000, includeAnalysis: false });
    const quick = analyzeGraph2DVectorField({ ...request, maxEvaluations: 2000 });
    const thorough = analyzeGraph2DVectorField({ ...request, maxEvaluations: 12000 });
    expect(quick).toMatchObject({ status: "complete", reason: "none", gridSize: 14,
      validCells: 196, invalidCells: 0, evaluations: 1960, evaluationBudget: 2000 });
    expect(thorough.gridSize).toBe(32);
    expect(thorough.evaluations).toBeLessThanOrEqual(12000);
    expect(thorough.resultId).not.toBe(quick.resultId);
    expect(analyzeGraph2DVectorField({ ...request, object: { ...object, seeds: [{ x: 0, y: 1 }],
      fieldDensity: 24 }, maxEvaluations: 2000 }).resultId).toBe(quick.resultId);
    expect(quick.divergence?.mean).toBeCloseTo(0, 9);
    expect(quick.curl?.mean).toBeCloseTo(-2, 9);
    expect(quick.speed?.max).toBeGreaterThan(quick.speed?.min ?? 0);
    expect(sampleGraph2DPhasePortrait({ ...request, width: 400, height: 400,
      maxSamples: 2000, includeAnalysis: false })).toEqual(scene);
  });

  it("reports undefined cells and unavailable domains without claiming complete coverage", () => {
    const object = field("sqrt(x)", "y");
    const result = analyzeGraph2DVectorField({ object, variables: {}, viewport, maxEvaluations: 2000 });
    expect(result.status).toBe("partial");
    expect(result.reason).toBe("undefined-samples");
    expect(result.validCells).toBeGreaterThan(0);
    expect(result.invalidCells).toBeGreaterThan(0);
    expect(result.evaluations).toBeLessThanOrEqual(2000);
    expect(analyzeGraph2DVectorField({ object, variables: {}, viewport: { ...viewport, xScale: "log10" },
      maxEvaluations: 2000 })).toMatchObject({ status: "unavailable", reason: "unsupported-scale", evaluations: 0 });
    expect(analyzeGraph2DVectorField({ object, variables: {}, viewport,
      maxEvaluations: 2000, deadlineMs: Date.now() - 1 })).toMatchObject({ status: "partial", reason: "deadline" });
    expect(() => analyzeGraph2DVectorField({ object, variables: {}, viewport, maxEvaluations: 12001 }))
      .toThrow(/budget/);
  });
});
