import { describe, expect, it } from "vitest";
import { analyzeGraph2DCriticalPoints, applyGraph2DAuthoring, createEmptyGraph2DDocument,
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
    expect(near(result.candidates.filter((entry) => entry.kind === "zero"), 0)).toBe(true);
    expect(near(result.candidates.filter((entry) => entry.kind === "minimum"), 0)).toBe(true);
    expect(result.candidates.some((entry) => entry.kind === "inflection")).toBe(false);
    expect(result.candidates.every((entry) => entry.source.structuralHash === result.publication.provenance.source.structuralHash)).toBe(true);
    expect(result.candidates.every((entry) => isGraph2DCriticalPointCurrent(entry, document))).toBe(true);
    expect(isGraph2DCriticalPointCurrent(result.candidates[0]!, { ...document,
      identity: { ...document.identity, revision: document.identity.revision + 1 } })).toBe(false);
    expect(result.candidates.every((entry) => Number.isFinite(entry.residual) && entry.residual <= 1e-7)).toBe(true);
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
    expect(result.candidates.length).toBeLessThanOrEqual(64);
  });

  it("rejects poles rather than reporting them as zeros or inflections", () => {
    const reciprocal = analyze("1/x", -2, 2);
    expect(reciprocal.candidates).toHaveLength(0);
    expect(reciprocal.diagnostics.some((entry) => entry.code === "invalid-samples")).toBe(true);
    const tangent = analyze("tan(x)", -2, 2);
    expect(near(tangent.candidates.filter((entry) => entry.kind === "zero"), 0)).toBe(true);
    expect(tangent.candidates.some((entry) => Math.abs(Math.abs(entry.x) - Math.PI / 2) < 1e-3)).toBe(false);
  });
});
