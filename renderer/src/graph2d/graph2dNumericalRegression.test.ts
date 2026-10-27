import { describe, expect, it } from "vitest";
import { analyzeGraph2DCriticalPoints, analyzeGraph2DIntersections, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument } from "@math3d/core";

const scan = (expression: string, min: number, max: number) => {
  const empty = createEmptyGraph2DDocument(`regression:${expression}`);
  const scene = applyGraph2DAuthoring(empty, { type: "create", draft: { label: expression, expression,
    domain: { min, max, includeMin: true, includeMax: true },
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  const document = createGraph2DDocument({ source: scene.source, display: scene.display,
    stableKey: `regression:${expression}` });
  return analyzeGraph2DCriticalPoints({ document, objectId: "function_1", interval: { min, max } });
};
const pairScan = (expression: string, min: number, max: number, maxEvaluations = 12000) => {
  const stableKey = `intersection-oracle:${expression}`;
  let document = createEmptyGraph2DDocument(stableKey);
  for (const source of [expression, "0"]) {
    const scene = applyGraph2DAuthoring(document, { type: "create", draft: { label: source, expression: source,
      domain: { min, max, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
    document = createGraph2DDocument({ source: scene.source, display: scene.display, stableKey });
  }
  return analyzeGraph2DIntersections({ document, firstObjectId: "function_1",
    secondObjectId: "function_2", interval: { min, max }, maxEvaluations });
};
const zeros = (result: ReturnType<typeof scan>) => result.candidates.filter(candidate => candidate.kind === "zero");
const near = (values: readonly { x: number }[], x: number, tolerance = 2e-4) =>
  values.some(candidate => Math.abs(candidate.x - x) <= tolerance);
const sineZeros = (frequency: number, min: number, max: number) =>
  Array.from({ length: Math.floor(frequency * max / Math.PI) - Math.ceil(frequency * min / Math.PI) + 1 },
    (_, index) => (Math.ceil(frequency * min / Math.PI) + index) * Math.PI / frequency);
const sineExtrema = (frequency: number, min: number, max: number, phase: number) =>
  Array.from({ length: 2 * frequency + 1 }, (_, index) =>
    (phase + 2 * Math.PI * (index - frequency)) / frequency)
    .filter(value => value > min && value < max);

const expectHonestCoverage = (result: ReturnType<typeof scan>, expected: readonly number[]) => {
  const found = zeros(result);
  expect(found.length).toBeGreaterThan(0);
  expect(found.every(candidate => expected.some(value => Math.abs(candidate.x - value) < 2e-3))).toBe(true);
  expect(found.every(candidate => Number.isFinite(candidate.residual) && candidate.residual < 1e-4)).toBe(true);
  if (result.status === "complete") {
    expect(found).toHaveLength(expected.length);
    for (const value of expected) expect(near(found, value, 2e-3)).toBe(true);
  } else {
    expect(result.status).toBe("incomplete");
    expect(result.quality).toBe("incomplete");
    expect(result.unresolvedIntervals.length).toBeGreaterThan(0);
  }
};

describe("Graph numerical regression oracles", () => {
  it("matches every analytic zero of x*sin(x^2) on [-10, 10]", () => {
    const result = scan("x*sin(x^2)", -10, 10);
    const expected = [0, ...Array.from({ length: 31 }, (_, index) => Math.sqrt((index + 1) * Math.PI))
      .flatMap(value => [-value, value])].sort((a, b) => a - b);
    expect(zeros(result)).toHaveLength(expected.length);
    for (const [index, value] of expected.entries()) expect(zeros(result)[index]!.x).toBeCloseTo(value, 3);
    expect(result.evaluations).toBeLessThanOrEqual(12000);
  });

  it("compares moderate and dense sine scans with frequency-independent exact zero sets", () => {
    for (const frequency of [12, 32, 80]) {
      const expected = sineZeros(frequency, -3, 3);
      const result = scan(`sin(${frequency}*x)`, -3, 3);
      if (frequency === 12) expect(result.status).toBe("complete");
      if (frequency === 80) expect(result.status).toBe("incomplete");
      expectHonestCoverage(result, expected);
      expect(result.evaluations).toBeLessThanOrEqual(12000);
    }
  });

  it("matches the derivative-derived extrema of a moderate oscillation", () => {
    const frequency = 12, result = scan("sin(12*x)", -3, 3);
    expect(result.status).toBe("complete");
    const maxima = result.candidates.filter(candidate => candidate.kind === "maximum");
    const minima = result.candidates.filter(candidate => candidate.kind === "minimum");
    const expectedMaxima = sineExtrema(frequency, -3, 3, Math.PI / 2);
    const expectedMinima = sineExtrema(frequency, -3, 3, 3 * Math.PI / 2);
    expect(maxima).toHaveLength(expectedMaxima.length);
    expect(minima).toHaveLength(expectedMinima.length);
    for (const value of expectedMaxima) expect(near(maxima, value, 2e-3)).toBe(true);
    for (const value of expectedMinima) expect(near(minima, value, 2e-3)).toBe(true);
  });

  it("does not claim exhaustive coverage for a compressed oscillation near a singularity", () => {
    const min = 0.02, max = 1;
    const expected = Array.from({ length: 15 }, (_, index) => 1 / ((index + 1) * Math.PI))
      .filter(value => value >= min && value <= max);
    const result = scan("sin(1/x)", min, max);
    expectHonestCoverage(result, expected);
    expect(result.evaluations).toBeLessThanOrEqual(12000);
  });

  it("checks dense pair intersections against an independent sine-zero oracle", () => {
    for (const frequency of [12, 40]) {
      const expected = sineZeros(frequency, -3, 3);
      const result = pairScan(`sin(${frequency}*x)`, -3, 3);
      if (frequency === 12) expect(result.status).toBe("complete");
      if (frequency === 40) expect(result.status).toBe("incomplete");
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates.every(candidate => expected.some(value =>
        Math.abs(candidate.x - value) < 2e-3) && candidate.residual < 1e-4)).toBe(true);
      if (result.status === "complete") {
        expect(result.candidates).toHaveLength(expected.length);
        for (const value of expected) expect(near(result.candidates, value, 2e-3)).toBe(true);
      } else {
        expect(result.quality).toBe("incomplete");
        expect(result.unresolvedIntervals.length).toBeGreaterThan(0);
      }
      expect(result.evaluations).toBeLessThanOrEqual(12000);
    }
  });

  it("keeps singular oscillation and tangent poles separate from roots", () => {
    const oscillation = scan("sin(1/x)", 0.1, 1);
    for (let n = 1; n <= 3; n += 1) expect(near(zeros(oscillation), 1 / (n * Math.PI))).toBe(true);
    expect(zeros(oscillation)).toHaveLength(3);
    const tangent = scan("tan(x)", -4, 4);
    for (const root of [-Math.PI, 0, Math.PI]) expect(near(zeros(tangent), root)).toBe(true);
    expect(zeros(tangent)).toHaveLength(3);
    for (const pole of [-Math.PI / 2, Math.PI / 2])
      expect(zeros(tangent).some(candidate => Math.abs(candidate.x - pole) < 0.01)).toBe(false);
  });

  it("reports boundary/domain limits without inventing exact symbolic quality", () => {
    const absolute = scan("abs(x)", -2, 2);
    expect(near(zeros(absolute), 0)).toBe(true);
    expect(zeros(absolute).every(candidate => candidate.quality !== "refined")).toBe(true);
    const squareRoot = scan("sqrt(x)", -2, 2);
    expect(squareRoot.status).toBe("incomplete");
    expect(squareRoot.diagnostics.some(item => item.code === "invalid-samples")).toBe(true);
    const logarithm = scan("log(x)", -1, 4);
    expect(logarithm.status).toBe("incomplete");
    expect(near(zeros(logarithm), 1)).toBe(true);
    expect(logarithm.diagnostics.some(item => item.code === "invalid-samples")).toBe(true);
    const doubleRoot = scan("(x-0.3)^2", -2, 2);
    expect(near(zeros(doubleRoot), 0.3)).toBe(true);
    expect(zeros(doubleRoot).every(candidate => candidate.quality === "approximate")).toBe(true);
  });
});
