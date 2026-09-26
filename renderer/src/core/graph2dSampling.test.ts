import { describe, expect, it } from "vitest";
import { parseGraph2DExpression, sampleGraph2DExplicit } from "@math3d/core";

const sample = (source: string, overrides: Record<string, unknown> = {}) => {
  const parsed = parseGraph2DExpression(source);
  if (!parsed.ok) throw new Error(parsed.diagnostics[0]?.message);
  return sampleGraph2DExplicit({
    ast: parsed.ast,
    domain: { min: -4, max: 4, includeMin: true, includeMax: true },
    viewport: { xMin: -4, xMax: 4, yMin: -4, yMax: 4, aspect: "equal" },
    width: 800, height: 600,
    policy: { maxSamples: 20000, maxDepth: 12, tolerancePx: 0.75 },
    ...overrides,
  });
};

describe("Graph2D explicit adaptive sampling", () => {
  it("is deterministic, refines smooth curves, and keeps domain endpoints", () => {
    const first = sample("x^2");
    expect(first).toEqual(sample("x^2"));
    expect(first.converged).toBe(true);
    expect(first.segments).toHaveLength(1);
    expect(first.segments[0]?.points[0]?.x).toBe(-4);
    expect(first.segments[0]?.points.at(-1)?.x).toBe(4);
    expect(first.samplesEvaluated).toBeGreaterThan(64);
    const oscillatory = sample("sin(20*x)");
    expect(oscillatory.samplesEvaluated).toBeGreaterThan(first.samplesEvaluated);
  });

  it("splits invalid samples, poles, and step jumps", () => {
    for (const source of ["1/x", "sin(x)/x"]) {
      const result = sample(source);
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
      expect(result.segments.every((segment) => segment.points[0]!.x * segment.points.at(-1)!.x >= 0)).toBe(true);
      expect(result.diagnostics.some((item) => item.code === "invalid-sample")).toBe(true);
    }
    const step = sample("floor(x)");
    expect(step.segments.length).toBeGreaterThan(1);
    expect(step.diagnostics.some((item) => item.code === "suspected-jump")).toBe(true);
  });

  it("reports empty visible domains and bounded exhaustion", () => {
    expect(sample("x", { domain: { min: 8, max: 10, includeMin: true, includeMax: true } }))
      .toMatchObject({ segments: [], samplesEvaluated: 0, converged: true, diagnostics: [{ code: "empty-domain" }] });
    const limited = sample("sin(20*x)", { policy: { maxSamples: 32, maxDepth: 12, tolerancePx: 0.75 } });
    expect(limited.samplesEvaluated).toBeLessThanOrEqual(32);
    expect(limited.converged).toBe(false);
    expect(limited.diagnostics.some((item) => item.code === "sample-limit")).toBe(true);
  });
});
