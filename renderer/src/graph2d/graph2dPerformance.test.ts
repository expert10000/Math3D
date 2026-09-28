import { describe, expect, it } from "vitest";
import { analyzeGraph2DCriticalPoints, analyzeGraph2DIntegral, createGraph2DDocument,
  Graph2DSamplingJobController, parseGraph2DExpression, sampleGraph2DExplicit,
  sampleGraph2DImplicit, sampleGraph2DInequality, type Graph2DExplicitObject,
  type Graph2DImplicitObject, type Graph2DInequalityObject } from "@math3d/core";

export const GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS = Object.freeze({
  explicitSuite: 1500, contourAndFill: 2500, analysisSuite: 2500, lifecycle5000: 250,
});
const viewport = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, aspect: "equal" as const };
const domain = { min: -10, max: 10, includeMin: true, includeMax: true };
const policy = { maxSamples: 12000, maxDepth: 12, tolerancePx: 0.75 };
const ast = (source: string, variables = ["x"]) => {
  const result = parseGraph2DExpression(source, variables);
  if (!result.ok) throw new Error(result.errors.join(" "));
  return result.ast;
};
const explicit = (id: string, source: string): Graph2DExplicitObject => ({ id, kind: "explicit-cartesian", label: id,
  expression: { source, variable: "x", ast: ast(source) }, domain });

describe("Graph2D reviewed performance budgets", () => {
  it("bounds smooth, oscillatory, discontinuous, and multi-function sampling", () => {
    const started = performance.now();
    const sources = ["x^2", "sin(40*x)", "1/x", ...Array.from({ length: 8 }, (_, index) => `sin(${index + 1}*x)` )];
    const artifacts = sources.map((source) => sampleGraph2DExplicit({ ast: ast(source), domain, viewport,
      width: 1200, height: 800, policy }));
    expect(performance.now() - started).toBeLessThan(GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS.explicitSuite);
    expect(artifacts.every((artifact) => artifact.samplesEvaluated <= policy.maxSamples)).toBe(true);
    expect(artifacts[2]!.segments.length).toBeGreaterThan(1);
  });

  it("bounds implicit contour and inequality fill scenes", () => {
    const expression = { source: "x^2+y^2-25", variable: "xy" as const, ast: ast("x^2+y^2-25", ["x", "y"]) };
    const implicit: Graph2DImplicitObject = { id: "implicit_1", kind: "implicit", label: "circle", expression, domain, yDomain: domain };
    const inequality: Graph2DInequalityObject = { id: "inequality_1", kind: "inequality", label: "disk",
      clauses: [{ ...expression, comparator: "<=" }], operator: "all", domain, yDomain: domain };
    const started = performance.now();
    const contour = sampleGraph2DImplicit({ object: implicit, viewport, width: 1000, height: 700, policy });
    const fill = sampleGraph2DInequality({ object: inequality, viewport, width: 1000, height: 700, policy });
    expect(performance.now() - started).toBeLessThan(GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS.contourAndFill);
    expect(contour.segments.length).toBeGreaterThan(0); expect(fill.fills.length).toBeGreaterThan(0);
  });

  it("bounds critical-point, integral, and fill-artifact analysis", () => {
    const object = explicit("function_1", "x^3-x");
    const document = createGraph2DDocument({ stableKey: "graph2d-performance", source: { objects: [object], variables: [], assumptions: [] } });
    const started = performance.now();
    const critical = analyzeGraph2DCriticalPoints({ document, objectId: object.id, interval: { min: -3, max: 3 } });
    const integral = analyzeGraph2DIntegral({ document, objectId: object.id, interval: { min: -3, max: 3 }, mode: "absolute" });
    expect(performance.now() - started).toBeLessThan(GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS.analysisSuite);
    expect(critical.candidates.length).toBeGreaterThan(0); expect(integral.fillSegments.length).toBeGreaterThan(0);
  });

  it("rejects stale jobs, observes cancellation, and cleans every job record", () => {
    const controller = new Graph2DSamplingJobController(), started = performance.now();
    const staleOnly = controller.begin("stale", "generation-1");
    expect(controller.settle(staleOnly, "generation-2")).toBe("stale");
    let cancelled = 0, accepted = 0;
    for (let index = 0; index < 5000; index += 1) {
      const stale = controller.begin("function_1", `generation-${index}`);
      const current = controller.begin("function_1", `generation-${index + 1}`);
      if (controller.settle(stale, current.generationKey) === "cancelled") cancelled += 1;
      if (index % 2 === 0) controller.cancel(current.jobId);
      if (controller.settle(current, current.generationKey) === "accepted") accepted += 1;
    }
    expect(cancelled).toBe(5000); expect(accepted).toBe(2500);
    expect(controller.activeCount).toBe(0);
    expect(performance.now() - started).toBeLessThan(GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS.lifecycle5000);
  });
});
