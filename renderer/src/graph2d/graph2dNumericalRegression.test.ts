import { describe, expect, it } from "vitest";
import { analyzeGraph2DCriticalPoints, applyGraph2DAuthoring, createEmptyGraph2DDocument,
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
const zeros = (result: ReturnType<typeof scan>) => result.candidates.filter(candidate => candidate.kind === "zero");
const near = (values: readonly { x: number }[], x: number, tolerance = 2e-4) =>
  values.some(candidate => Math.abs(candidate.x - x) <= tolerance);

describe("Graph numerical regression oracles", () => {
  it("matches every analytic zero of x*sin(x^2) on [-10, 10]", () => {
    const result = scan("x*sin(x^2)", -10, 10);
    const expected = [0, ...Array.from({ length: 31 }, (_, index) => Math.sqrt((index + 1) * Math.PI))
      .flatMap(value => [-value, value])].sort((a, b) => a - b);
    expect(zeros(result)).toHaveLength(expected.length);
    for (const [index, value] of expected.entries()) expect(zeros(result)[index]!.x).toBeCloseTo(value, 3);
    expect(result.evaluations).toBeLessThanOrEqual(12000);
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
