import { describe, expect, it } from "vitest";
import { analyzeGraph2DExponentialRegression, analyzeGraph2DLogisticRegression,
  applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DLogisticRegressionJob,
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

describe("GRA-15 bounded logistic growth fit", () => {
  const logistic = (x: number, capacity = 5, rate = 1.4, midpoint = 2) =>
    capacity / (1 + Math.exp(-rate * (x - midpoint)));
  const xs = Array.from({ length: 41 }, (_, index) => index / 10);

  it("recovers exact capacity, rate and midpoint with finite residuals and no intervals", () => {
    const input = dataset(xs.map(x => logistic(x)), xs);
    const fit = analyzeGraph2DLogisticRegression({ ...input, initial: { capacity: 4, rate: 1, midpoint: 1.5 } });
    expect(fit.parameters.capacity).toBeCloseTo(5, 7);
    expect(fit.parameters.rate).toBeCloseTo(1.4, 7);
    expect(fit.parameters.midpoint).toBeCloseTo(2, 7);
    expect(fit.sse).toBeLessThan(1e-14);
    expect(fit.curve).toHaveLength(129);
    expect(fit.residuals).toHaveLength(xs.length);
    expect(fit.publication.summary.intervalSemantics).toBe("none");
    expect(fit.publication.warnings.join(" ")).toMatch(/no parameter uncertainty/i);
  });

  it("fits noisy data and reports a local numerical result", () => {
    const input = dataset(xs.map((x, i) => logistic(x) + .015 * Math.sin(i * 7)), xs);
    const fit = analyzeGraph2DLogisticRegression({ ...input, initial: { capacity: 4.5, rate: 1.1, midpoint: 1.8 } });
    expect(fit.parameters.capacity).toBeCloseTo(5, 1);
    expect(fit.parameters.rate).toBeCloseTo(1.4, 1);
    expect(fit.parameters.midpoint).toBeCloseTo(2, 1);
    expect(fit.sse).toBeGreaterThan(0);
    expect(fit.residualSD).toBeGreaterThan(0);
    expect(fit.rSquared).toBeGreaterThan(.99);
  });

  it("rejects degenerate, invalid-bound and changed sidecar inputs", () => {
    const flat = dataset(Array.from({ length: 20 }, () => 0));
    expect(() => analyzeGraph2DLogisticRegression({ ...flat, initial: { capacity: 1, rate: 1, midpoint: 1 } }))
      .toThrow(/not identifiable/i);
    const exact = dataset(xs.map(x => logistic(x)), xs);
    expect(() => analyzeGraph2DLogisticRegression({ ...exact, initial: { capacity: -1, rate: 1, midpoint: 2 } }))
      .toThrow(/capacity must be positive/i);
    expect(() => analyzeGraph2DLogisticRegression({ ...exact, initial: { capacity: 4, rate: 0, midpoint: 2 } }))
      .toThrow(/rate×span/i);
    expect(() => analyzeGraph2DLogisticRegression({ ...exact, initial: { capacity: 4, rate: 1, midpoint: 8 } }))
      .toThrow(/midpoint must be/i);
    expect(() => analyzeGraph2DLogisticRegression({ ...exact,
      rows: exact.rows.map((row, i) => i ? row : { ...row, y: 99 }),
      initial: { capacity: 4, rate: 1, midpoint: 2 } })).toThrow(/checksum/i);
    const constant = dataset(Array.from({ length: 41 }, () => 3));
    expect(() => analyzeGraph2DLogisticRegression({ ...constant, initial: { capacity: 4, rate: 1, midpoint: 2 } }))
      .toThrow(/not identifiable|stalled|without convergence/i);
  });

  it("supports one-iteration mobile batches and cancellation", () => {
    const input = dataset(xs.map(x => logistic(x)), xs);
    const request = { ...input, initial: { capacity: 4, rate: 1, midpoint: 1.5 } };
    const job = createGraph2DLogisticRegressionJob(request);
    expect(job.advance(1)).toBe(false);
    while (!job.advance(1)) { /* explicit bounded UI batches */ }
    expect(job.result().solver.status).toBe("converged");
    const cancelled = createGraph2DLogisticRegressionJob(request);
    cancelled.advance(1); cancelled.cancel();
    expect(() => cancelled.advance(1)).toThrow(/cancelled/);
    expect(() => cancelled.result()).toThrow(/not completed/);
  });
});
