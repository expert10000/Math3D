import { describe, expect, it } from "vitest";
import { analyzeGraph2DExponentialRegression, applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, createGraph2DExponentialRegressionJob, Graph2DPointTableStore,
  graph2DPointDomain, type Graph2DPointRow } from "@math3d/core";

const dataset = (ys: readonly number[], xs = ys.map((_, index) => index / 10)) => {
  const rows: Graph2DPointRow[] = ys.map((y, index) => ({ id: `row_${index + 1}`, x: xs[index]!, y }));
  const table = new Graph2DPointTableStore().publish(rows);
  const edit = applyGraph2DAuthoring(createEmptyGraph2DDocument("nonlinear-fit"), { type: "create-point-series",
    draft: { label: "Measurements", table, domain: graph2DPointDomain(rows), mode: "points",
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  const document = createGraph2DDocument({ ...edit, stableKey: "nonlinear-fit" });
  return { document, rows, objectId: document.source.objects[0]!.id };
};

describe("GRA-15 bounded exponential decay fit", () => {
  it("recovers an exact reference from user initial values and publishes residual diagnostics", () => {
    const xs = Array.from({ length: 41 }, (_, index) => index / 10);
    const input = dataset(xs.map(x => 3.5 * Math.exp(-.7 * x)), xs);
    const fit = analyzeGraph2DExponentialRegression({ ...input, initial: { amplitude: 2, rate: .3 } });
    expect(fit.parameters.amplitude).toBeCloseTo(3.5, 8);
    expect(fit.parameters.rate).toBeCloseTo(.7, 8);
    expect(fit.parameters.anchor).toBe(0);
    expect(fit.sse).toBeLessThan(1e-16);
    expect(fit.residuals).toHaveLength(xs.length);
    expect(fit.curve).toHaveLength(129);
    expect(fit.solver.status).toBe("converged");
    expect(fit.publication.summary.intervalSemantics).toBe("none");
    expect(fit.publication.warnings.join(" ")).toMatch(/no parameter uncertainty/i);
  });

  it("fits noisy observations without claiming exactness or uncertainty", () => {
    const xs = Array.from({ length: 81 }, (_, index) => index / 20);
    const input = dataset(xs.map((x, index) => 2.2 * Math.exp(-.45 * x) + .01 * Math.sin(index * 7)), xs);
    const fit = analyzeGraph2DExponentialRegression({ ...input, initial: { amplitude: 1.8, rate: .2 } });
    expect(fit.parameters.amplitude).toBeCloseTo(2.2, 1);
    expect(fit.parameters.rate).toBeCloseTo(.45, 1);
    expect(fit.sse).toBeGreaterThan(0);
    expect(fit.residualSD).toBeGreaterThan(0);
    expect(fit.rSquared).toBeGreaterThan(.99);
  });

  it("rejects singular, bounded and checksum-invalid cases", () => {
    const flat = dataset(Array.from({ length: 20 }, () => 0));
    expect(() => analyzeGraph2DExponentialRegression({ ...flat, initial: { amplitude: 0, rate: .5 } }))
      .toThrow(/not identifiable|singular/i);
    const exact = dataset(Array.from({ length: 20 }, (_, index) => Math.exp(-index / 10)));
    expect(() => analyzeGraph2DExponentialRegression({ ...exact, initial: { amplitude: 1, rate: -1 } }))
      .toThrow(/rate must be/i);
    expect(() => analyzeGraph2DExponentialRegression({ ...exact,
      rows: exact.rows.map((row, index) => index ? row : { ...row, y: 99 }), initial: { amplitude: 1, rate: .5 } }))
      .toThrow(/checksum/i);
    expect(() => analyzeGraph2DExponentialRegression({ ...exact, initial: { amplitude: 1, rate: 100 } }))
      .toThrow(/rate must be/i);
  });

  it("yields bounded iterations and cancellation prevents publishing", () => {
    const input = dataset(Array.from({ length: 120 }, (_, index) => 2 * Math.exp(-.8 * index / 20)));
    const request = { ...input, initial: { amplitude: 1, rate: .2 } };
    const job = createGraph2DExponentialRegressionJob(request);
    expect(job.advance(1)).toBe(false);
    expect(job.progress).toBeGreaterThan(0);
    while (!job.advance(1)) { /* one solver iteration per mobile batch */ }
    expect(job.result().solver.status).toBe("converged");
    const cancelled = createGraph2DExponentialRegressionJob(request);
    cancelled.advance(1); cancelled.cancel();
    expect(() => cancelled.advance(1)).toThrow(/cancelled/);
    expect(() => cancelled.result()).toThrow(/not completed/);
  });
});
