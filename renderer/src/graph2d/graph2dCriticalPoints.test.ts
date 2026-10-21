import { describe, expect, it } from "vitest";
import { analyzeGraph2DCriticalPoints, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  analyzeGraph2DDerivative,
  graph2DQualityForNumericalCandidate,
  createGraph2DNumericalDataset,
  isGraph2DCriticalPointCurrent,
  createGraph2DDocument } from "@math3d/core";

const documentFor = (expression: string) => {
  const empty = createEmptyGraph2DDocument("critical:" + expression);
  const scene = applyGraph2DAuthoring(empty, { type: "create", draft: { label: "f", expression,
    domain: { min: -10, max: 10, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  return createGraph2DDocument({ source: scene.source, display: scene.display, stableKey: "critical:" + expression });
};
const analyze = (expression: string, min: number, max: number) =>
  analyzeGraph2DCriticalPoints({ document: documentFor(expression), objectId: "function_1", interval: { min, max } });
const near = (items: readonly { x: number }[], expected: number, tolerance = 1e-4) =>
  items.some((item) => Math.abs(item.x - expected) < tolerance);

describe("Graph2D critical point analysis", () => {
  it("finds a double zero and minimum without inventing an inflection", () => {
    const document = documentFor("x^2");
    const result = analyzeGraph2DCriticalPoints({ document, objectId: "function_1", interval: { min: -3, max: 3 } });
    expect(result.status).toBe("complete");
    expect(result.quality).toBe("approximate");
    expect(result.unresolvedIntervals).toEqual([]);
    expect(near(result.candidates.filter((entry) => entry.kind === "zero"), 0)).toBe(true);
    expect(near(result.candidates.filter((entry) => entry.kind === "minimum"), 0)).toBe(true);
    expect(result.candidates.some((entry) => entry.kind === "inflection")).toBe(false);
    expect(result.candidates.every((entry) => entry.source.structuralHash === result.publication.provenance.source.structuralHash)).toBe(true);
    expect(result.candidates.every((entry) => isGraph2DCriticalPointCurrent(entry, document))).toBe(true);
    expect(isGraph2DCriticalPointCurrent(result.candidates[0]!, { ...document,
      identity: { ...document.identity, revision: document.identity.revision + 1 } })).toBe(false);
    expect(result.candidates.every((entry) => Number.isFinite(entry.residual) && entry.residual <= 1e-7)).toBe(true);
    expect(result.candidates.find((entry) => entry.kind === "zero")?.quality).toBe("approximate");
    const dataset = createGraph2DNumericalDataset(result);
    expect(dataset).toMatchObject({ format: "math3d.graph2d-numerical.v1", operation: "critical-points",
      source: { documentId: document.identity.id, structuralHash: document.identity.structuralHash },
      scan: { status: "complete", quality: "approximate" } });
    expect(dataset.candidates.some(entry => entry.kind === "zero" && entry.x === 0)).toBe(true);
  });

  it("only labels residual-checked bracket refinement as Refined", () => {
    const result = analyze("x-0.3", -2, 2);
    const zero = result.candidates.find((entry) => entry.kind === "zero");
    expect(zero?.method).toBe("bracket-bisection");
    expect(zero?.quality).toBe("refined");
    expect(result.publication.summary.quality).toBe("approximate");
    expect(graph2DQualityForNumericalCandidate({ method: "minimum-absolute-residual",
      confidence: "heuristic", residual: 0 }, 1e-7)).toBe("approximate");
    expect(graph2DQualityForNumericalCandidate({ method: "bracket-bisection",
      confidence: "numerical", residual: 2e-7 }, 1e-7)).toBe("approximate");
    expect(graph2DQualityForNumericalCandidate({ method: "bracket-bisection",
      confidence: "numerical", residual: 1e-8 }, 1e-7)).toBe("refined");
  });

  it("refines a zero away from the sample grid and labels even multiplicity as possible", () => {
    const result = analyze("(x-1)^2", -3, 3);
    const zero = result.candidates.find((entry) => entry.kind === "zero" && Math.abs(entry.x - 1) < 1e-4);
    expect(zero).toBeDefined();
    expect(zero?.confidence).toBe("heuristic");
    expect(zero?.multiplicity).toBe("even-possible");
    expect(near(result.candidates.filter((entry) => entry.kind === "minimum"), 1)).toBe(true);
  });

  it("does not turn every near-zero sample in a narrow interval into a root", () => {
    const result = analyze("x^2", -0.01, 0.01);
    const zeros = result.candidates.filter((entry) => entry.kind === "zero");
    expect(zeros).toHaveLength(1);
    expect(zeros[0]?.x).toBe(0);
    expect(result.status).toBe("complete");
  });

  it("distinguishes a stationary point from an inflection", () => {
    const result = analyze("x^3", -3, 3);
    expect(near(result.candidates.filter((entry) => entry.kind === "zero"), 0)).toBe(true);
    expect(near(result.candidates.filter((entry) => entry.kind === "inflection"), 0)).toBe(true);
    expect(result.candidates.some((entry) => entry.kind === "minimum" || entry.kind === "maximum")).toBe(false);
    expect(result.diagnostics.some((entry) => entry.code === "stationary-unclassified")).toBe(true);
  });

  it("finds periodic zeros, extrema, and inflections with bounded work", () => {
    const result = analyze("sin(x)", -4, 4);
    const zeros = result.candidates.filter((entry) => entry.kind === "zero");
    expect(near(zeros, -Math.PI)).toBe(true);
    expect(near(zeros, 0)).toBe(true);
    expect(near(zeros, Math.PI)).toBe(true);
    expect(near(result.candidates.filter((entry) => entry.kind === "minimum"), -Math.PI / 2)).toBe(true);
    expect(near(result.candidates.filter((entry) => entry.kind === "maximum"), Math.PI / 2)).toBe(true);
    expect(near(result.candidates.filter((entry) => entry.kind === "inflection"), 0)).toBe(true);
    expect(result.evaluations).toBeLessThanOrEqual(12000);
    expect(result.candidates.length).toBeLessThanOrEqual(256);
  });

  it("resolves the 63 zeros of x sin(x²) on [-10, 10] without borrowing rendering samples", () => {
    const result = analyze("x*sin(x^2)", -10, 10);
    const zeros = result.candidates.filter((entry) => entry.kind === "zero");
    expect(zeros).toHaveLength(63);
    for (let n = 1; n <= 31; n += 1) {
      expect(near(zeros, -Math.sqrt(n * Math.PI), 2e-4)).toBe(true);
      expect(near(zeros, Math.sqrt(n * Math.PI), 2e-4)).toBe(true);
    }
    expect(near(zeros, 0)).toBe(true);
    expect(result.candidates.filter((entry) => entry.kind === "minimum").length).toBeGreaterThan(25);
    expect(result.candidates.filter((entry) => entry.kind === "maximum").length).toBeGreaterThan(25);
    expect(result.candidates.filter((entry) => entry.kind === "inflection").length).toBeGreaterThan(50);
    expect(result.evaluations).toBeLessThanOrEqual(12000);
    expect(result.candidates.every((entry) => entry.residual < 1e-5)).toBe(true);
    const outerZero = zeros.find((entry) => Math.abs(entry.x - Math.sqrt(31 * Math.PI)) < 2e-4);
    expect(outerZero?.localSensitivity).toBeGreaterThan(0);
    expect(outerZero?.estimatedXError).toBeLessThan(1e-6);
    expect(zeros.find((entry) => entry.x === 0)?.localSensitivity).toBeNull();
    const document = documentFor("x*sin(x^2)");
    const first = analyzeGraph2DDerivative({ document, objectId: "function_1", x: 2, order: 1 });
    const second = analyzeGraph2DDerivative({ document, objectId: "function_1", x: 2, order: 2 });
    expect(first.value).toBeCloseTo(Math.sin(4) + 8 * Math.cos(4), 8);
    expect(second.value).toBeCloseTo(12 * Math.cos(4) - 32 * Math.sin(4), 8);
  });

  it("reports a partial scan when the analysis evaluation budget is exhausted", () => {
    const document = documentFor("x*sin(x^2)");
    const result = analyzeGraph2DCriticalPoints({ document, objectId: "function_1",
      interval: { min: -10, max: 10 }, maxEvaluations: 400 });
    expect(result.status).toBe("incomplete");
    expect(result.quality).toBe("incomplete");
    expect(result.evaluations).toBe(400);
    expect(result.diagnostics.some((entry) => entry.code === "evaluation-limit")).toBe(true);
    expect(result.unresolvedIntervals).toContainEqual({ min: -10, max: 10, reason: "work-limit" });
    expect(result.publication.warnings.some((warning) => warning.includes("Analysis is partial"))).toBe(true);
    const thorough = analyzeGraph2DCriticalPoints({ document, objectId: "function_1",
      interval: { min: -10, max: 10 }, maxEvaluations: 12000 });
    expect(thorough.publication.resultId).not.toBe(result.publication.resultId);
    expect(thorough.publication.provenance.operation.parameters.maxEvaluations).toBe(12000);
  });

  it("does not claim a finished bounded scan for frequencies beyond its refinement budget", () => {
    const result = analyze("sin(100*x)", -10, 10);
    expect(result.status).toBe("incomplete");
    expect(result.diagnostics.some((entry) => ["refinement-limit", "evaluation-limit", "candidate-limit"].includes(entry.code))).toBe(true);
    expect(result.unresolvedIntervals.length).toBeGreaterThan(0);
    expect(result.unresolvedIntervals.length).toBeLessThanOrEqual(128);
    expect(result.unresolvedIntervals.every(entry => entry.min >= -10 && entry.max <= 10 &&
      entry.min < entry.max)).toBe(true);
  });

  it("rejects poles rather than reporting them as zeros or inflections", () => {
    const reciprocal = analyze("1/x", -2, 2);
    expect(reciprocal.candidates).toHaveLength(0);
    expect(reciprocal.diagnostics.some((entry) => entry.code === "invalid-samples")).toBe(true);
    expect(reciprocal.unresolvedIntervals.some(entry => entry.reason === "undefined" &&
      entry.min <= 0 && entry.max >= 0)).toBe(true);
    const tangent = analyze("tan(x)", -2, 2);
    expect(near(tangent.candidates.filter((entry) => entry.kind === "zero"), 0)).toBe(true);
    expect(tangent.candidates.some((entry) => Math.abs(Math.abs(entry.x) - Math.PI / 2) < 1e-3)).toBe(false);
  });
});
