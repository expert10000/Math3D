import { describe, expect, it } from "vitest";
import { createGraph2DDocument, parseGraph2DExpression, sampleGraph2DScene, sampleGraph2DPath,
  sampleGraph2DPiecewise, type Graph2DPiecewiseObject } from "@math3d/core";
const domain = { min: -1, max: 1, includeMin: true, includeMax: true };
const ast = parseGraph2DExpression("sin(10000*x)", ["x"]); if (!ast.ok) throw new Error("parse");
const expression = { source: "sin(10000*x)", variable: "x" as const, ast: ast.ast };
describe("bounded scene sampling", () => {
  it("enforces a whole-scene budget and marks skipped work unresolved", () => {
    const graph = createGraph2DDocument({ stableKey: "budget", source: { objects: Array.from({ length: 12 }, (_, index) => ({
      id: `f${index}`, kind: "explicit-cartesian" as const, label: `f${index}`, expression, domain })), variables: [], assumptions: [] } });
    const document = { ...graph, display: { ...graph.display, sampling: { ...graph.display.sampling, maxSamples: 64 } } };
    const series = sampleGraph2DScene({ document, viewport: graph.display.viewport, width: 600, height: 400, interaction: true });
    expect(series.reduce((total, item) => total + item.artifact.samplesEvaluated, 0)).toBeLessThanOrEqual(64);
    expect(series.some((item) => !item.artifact.converged)).toBe(true);
  });
  it("bounds all piecewise branches including endpoint evaluations", () => {
    const object: Graph2DPiecewiseObject = { id: "p", kind: "piecewise", label: "p", pieces: [
      { expression, domain: { ...domain, min: -1, max: 0, includeMax: false } },
      { expression, domain: { ...domain, min: 0, max: 1 } }] };
    const artifact = sampleGraph2DPiecewise({ object, viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, aspect: "free" },
      width: 600, height: 400, policy: { maxSamples: 32, maxDepth: 8, tolerancePx: 1 } });
    expect(artifact.samplesEvaluated).toBeLessThanOrEqual(32); expect(artifact.converged).toBe(false);
  });
  it("checks the shared deadline in parametric/polar path evaluation", () => {
    const artifact = sampleGraph2DPath({ domain, viewport: { xMin: -1, xMax: 1, yMin: -1, yMax: 1, aspect: "free" },
      width: 600, height: 400, policy: { maxSamples: 1024, maxDepth: 8, tolerancePx: 1 }, deadlineMs: Date.now() - 1,
      evaluate: (parameter) => ({ x: parameter, y: parameter, parameter }) });
    expect(artifact.samplesEvaluated).toBe(0); expect(artifact.converged).toBe(false);
    expect(artifact.diagnostics.some((item) => item.code === "deadline")).toBe(true);
  });
});
