import { describe, expect, it } from "vitest";
import { analyzeGraph2DCriticalPoints, analyzeGraph2DIntegral, analyzeGraph2DRegression, createGraph2DSplineRegressionJob, createGraph2DPolynomialRegressionJob, createEmptyGraph2DDocument,
  applyGraph2DAuthoring, Graph2DPointTableStore, graph2DPointDomain, createGraph2DDocument, createGraph2DRegressionPresetRows,
  Graph2DSamplingJobController, parseGraph2DExpression, sampleGraph2DExplicit,
  sampleGraph2DImplicit, sampleGraph2DInequality, type Graph2DExplicitObject,
  type Graph2DImplicitObject, type Graph2DInequalityObject } from "@math3d/core";

export const GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS = Object.freeze({
  explicitSuite: 1500, contourAndFill: 2500, analysisSuite: 2500, lifecycle5000: 250, regression10000: 5000,
  spline10000: 5000,
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

  it("bounds checked linear through quartic fits at 10,000 rows", () => {
    const rows = createGraph2DRegressionPresetRows();
    const table = new Graph2DPointTableStore().publish(rows);
    const base = createEmptyGraph2DDocument("regression-performance", "Regression performance");
    const document = createGraph2DDocument({ ...applyGraph2DAuthoring(base, { type: "create-point-series", draft: { label: "Data", table,
      domain: graph2DPointDomain(rows), mode: "points", style: { color: "#2255cc", lineStyle: "solid", lineWidth: 2, visible: true } } }),
      stableKey: "regression-performance" });
    const objectId = document.source.objects[0].id, timings: Record<string, number> = {};
    for (const model of ["linear", "quadratic", "cubic", "quartic"] as const) {
      const started = performance.now(), fit = analyzeGraph2DRegression({ document, objectId, rows, model });
      timings[model] = performance.now() - started;
      expect(fit.n).toBe(10000); expect(fit.curve).toHaveLength(129);
      expect(fit.residuals).toHaveLength(10000);
    }
    const total = Object.values(timings).reduce((sum, time) => sum + time, 0);
    console.info(`GRA-12.2 regression 10k ms: ${JSON.stringify(timings)} total=${total.toFixed(1)}`);
    expect(total).toBeLessThan(GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS.regression10000);
  });
  it("bounds mobile-sized quartic batches at 10,000 rows", () => {
    const rows = createGraph2DRegressionPresetRows(), table = new Graph2DPointTableStore().publish(rows);
    const base = createEmptyGraph2DDocument("quartic-batch-performance", "Quartic batch performance");
    const document = createGraph2DDocument({ ...applyGraph2DAuthoring(base, { type: "create-point-series", draft: { label: "Data", table,
      domain: graph2DPointDomain(rows), mode: "points", style: { color: "#2255cc", lineStyle: "solid", lineWidth: 2, visible: true } } }),
      stableKey: "quartic-batch-performance" });
    const job = createGraph2DPolynomialRegressionJob({ document, objectId: document.source.objects[0]!.id, rows, model: "quartic" });
    const started = performance.now(); let steps = 0;
    do { steps++; } while (!job.advance(2048));
    const elapsed = performance.now() - started;
    expect(job.result().n).toBe(10000); expect(steps).toBeGreaterThan(100);
    console.info(`GRA-12.7 quartic 10k batched ms=${elapsed.toFixed(1)} steps=${steps}`);
    expect(elapsed).toBeLessThan(GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS.regression10000);
  });
  it("bounds synchronous and mobile-sized spline batches at 10,000 rows", () => {
    const rows = createGraph2DRegressionPresetRows();
    const table = new Graph2DPointTableStore().publish(rows);
    const base = createEmptyGraph2DDocument("spline-performance", "Spline performance");
    const document = createGraph2DDocument({ ...applyGraph2DAuthoring(base, { type: "create-point-series", draft: { label: "Data", table,
      domain: graph2DPointDomain(rows), mode: "points", style: { color: "#2255cc", lineStyle: "solid", lineWidth: 2, visible: true } } }),
      stableKey: "spline-performance" });
    const input = { document, objectId: document.source.objects[0]!.id, rows, smoothing: .001 };
    const start = performance.now();
    const direct = analyzeGraph2DRegression({ ...input, model: "spline" });
    const directMs = performance.now() - start;
    const job = createGraph2DSplineRegressionJob(input);
    const batchStart = performance.now(); let steps = 0;
    do { steps++; } while (!job.advance(128));
    const batchMs = performance.now() - batchStart;
    expect(job.result().coefficients).toEqual(direct.coefficients);
    expect(job.result().residuals).toEqual(direct.residuals);
    expect(job.result().n).toBe(10000); expect(steps).toBeGreaterThan(100);
    console.info(`GRA-12.6 spline 10k ms: direct=${directMs.toFixed(1)} batched=${batchMs.toFixed(1)} steps=${steps}`);
    expect(directMs + batchMs).toBeLessThan(GRAPH2D_REVIEWED_PERFORMANCE_BUDGETS_MS.spline10000);
  });
});
