import {
  buildArcLengthTableFromSamples,
  invertArcLengthTable,
  parameterToArcLength,
  sampleCurveRobust,
  sampleUniformArcLength,
  type Curve2D,
  type Curve3D,
} from "@math3d/core";
import { describe, expect, it } from "vitest";

const line: Curve2D = {
  id: "line",
  name: "Line",
  kind: "parametric",
  dimension: 2,
  domain: { tMin: 0, tMax: 1 },
  eval: (t) => ({ x: t, y: 2 * t }),
  derivative: () => ({ x: 1, y: 2 }),
};

const circle: Curve2D = {
  id: "circle",
  name: "Circle",
  kind: "parametric",
  dimension: 2,
  domain: { tMin: 0, tMax: Math.PI * 2, closed: true, periodic: true },
  eval: (t) => ({ x: Math.cos(t), y: Math.sin(t) }),
  derivative: (t) => ({ x: -Math.sin(t), y: Math.cos(t) }),
};

describe("robust Curve sampling", () => {
  it("is deterministic and leaves straight intervals at the requested minimum", () => {
    const options = { mode: "hybrid" as const, tolerance: 1e-5, minimumSamples: 5, maximumSamples: 100, maxDepth: 10 };
    const first = sampleCurveRobust(line, options);
    const second = sampleCurveRobust(line, options);
    expect(first.samples.map((sample) => sample.t)).toEqual(second.samples.map((sample) => sample.t));
    expect(first.samples).toHaveLength(5);
    expect(first.arcLengthTable.totalLength).toBeCloseTo(Math.sqrt(5), 10);
    expect(first.statistics.subdivisionCount).toBe(0);
    expect(first.diagnostics).toEqual([]);
  });

  it("detects oscillation that endpoint and midpoint-only sampling would miss", () => {
    const oscillation: Curve2D = {
      ...line,
      id: "oscillation",
      name: "Oscillation",
      eval: (t) => ({ x: t, y: Math.sin(8 * Math.PI * t) }),
    };
    const result = sampleCurveRobust(oscillation, {
      mode: "geometric",
      tolerance: 0.02,
      minimumSamples: 2,
      maximumSamples: 512,
      maxDepth: 12,
    });
    expect(result.samples.length).toBeGreaterThan(16);
    expect(result.statistics.maxObservedGeometricError).toBeGreaterThan(0.5);
    expect(result.statistics.subdivisionReasonCounts["geometric-error"]).toBeGreaterThan(0);
    expect(result.samples.some((sample) => (sample.geometricError ?? 0) > 0)).toBe(true);
    expect(result.samples.some((sample) => Math.abs(sample.point.y) > 0.8)).toBe(true);
  });

  it("honors declared breakpoints and reports invalid evaluations without throwing", () => {
    const singular: Curve2D = {
      ...line,
      id: "singular",
      name: "Singular",
      domain: { tMin: 0, tMax: 1, breakpoints: [0.3, 0.5, 0.7] },
      eval: (t) => t === 0.5 ? { x: NaN, y: NaN } : { x: t, y: Math.abs(t - 0.5) },
    };
    const result = sampleCurveRobust(singular, { tolerance: 1e-3, minimumSamples: 4, maximumSamples: 96, maxDepth: 7 });
    expect(result.samples.map((sample) => sample.t)).toEqual(expect.arrayContaining([0.3, 0.5, 0.7]));
    expect(result.samples.find((sample) => sample.t === 0.5)?.valid).toBe(false);
    expect(result.diagnostics.some((entry) => entry.code === "invalid-evaluation")).toBe(true);
    expect(result.diagnostics.some((entry) => entry.code === "maximum-depth" || entry.code === "maximum-samples")).toBe(true);
  });

  it("keeps an analysis endpoint while removing a coincident closed seam from render samples", () => {
    const result = sampleCurveRobust(circle, { tolerance: 2e-3, angularTolerance: 0.15, minimumSamples: 8, maximumSamples: 1024 });
    expect(result.samples.at(-1)?.t).toBeCloseTo(Math.PI * 2, 12);
    expect(result.renderSamples).toHaveLength(result.samples.length - 1);
    expect(result.statistics.seamDuplicateRemoved).toBe(true);
    expect(result.arcLengthTable.totalLength).toBeCloseTo(Math.PI * 2, 2);
    expect(result.diagnostics.some((entry) => entry.code === "closed-seam-mismatch")).toBe(false);
  });

  it("predictably reduces the sample count when geometric tolerance is relaxed", () => {
    const strict = sampleCurveRobust(circle, { mode: "geometric", tolerance: 1e-4, minimumSamples: 8, maximumSamples: 2048 });
    const relaxed = sampleCurveRobust(circle, { mode: "geometric", tolerance: 5e-2, minimumSamples: 8, maximumSamples: 2048 });
    expect(strict.samples.length).toBeGreaterThan(relaxed.samples.length);
    expect(relaxed.samples.length).toBeGreaterThanOrEqual(8);
  });

  it("reports a false closed declaration instead of fabricating closure", () => {
    const result = sampleCurveRobust({ ...line, domain: { ...line.domain, closed: true } }, { tolerance: 1e-4 });
    expect(result.statistics.seamDuplicateRemoved).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "closed-seam-mismatch", severity: "warning" })]));
  });

  it("enforces the sample budget and exposes under-resolution provenance", () => {
    const tight: Curve2D = {
      ...line,
      id: "tight-budget",
      eval: (t) => ({ x: t, y: Math.sin(40 * Math.PI * t) }),
    };
    const result = sampleCurveRobust(tight, { tolerance: 1e-8, minimumSamples: 4, maximumSamples: 12, maxDepth: 20 });
    expect(result.samples.length).toBeLessThanOrEqual(12);
    expect(result.diagnostics.some((entry) => entry.code === "maximum-samples")).toBe(true);
  });

  it("enforces an explicit evaluation budget", () => {
    const result = sampleCurveRobust(circle, {
      tolerance: 1e-12,
      minimumSamples: 4,
      maximumSamples: 4096,
      maximumEvaluations: 30,
      maxDepth: 20,
    });
    expect(result.statistics.evaluationCount).toBeLessThanOrEqual(30);
    expect(result.statistics.evaluationBudget).toBe(30);
    expect(result.diagnostics.some((entry) => entry.code === "maximum-evaluations")).toBe(true);
  });

  it("builds a monotone table with stable t-to-s-to-t inversion", () => {
    const sampled = sampleCurveRobust(circle, { tolerance: 5e-4, minimumSamples: 12, maximumSamples: 2048 });
    const table = sampled.arcLengthTable;
    expect(table.lengths.every((value, index) => index === 0 || value >= table.lengths[index - 1])).toBe(true);
    for (const t of [0, 0.2, 1.5, 3.7, Math.PI * 2]) {
      const s = parameterToArcLength(table, t);
      expect(invertArcLengthTable(table, s)).toBeCloseTo(t, 10);
    }
  });

  it("supports arc-length tables containing invalid gaps", () => {
    const table = buildArcLengthTableFromSamples([
      { t: 0, point: { x: 0, y: 0 }, valid: true },
      { t: 0.5, point: { x: NaN, y: NaN }, valid: false },
      { t: 1, point: { x: 1, y: 0 }, valid: true },
    ]);
    expect(table.totalLength).toBe(0);
    expect(table.validMask).toEqual([1, 0, 1]);
    expect(table.lengths).toEqual([0, 0, 0]);
  });

  it("produces approximately uniform spatial spacing in arc-length mode", () => {
    const parabola: Curve3D = {
      id: "parabola",
      name: "Parabola",
      kind: "parametric",
      dimension: 3,
      domain: { tMin: -2, tMax: 2 },
      eval: (t) => ({ x: t, y: t * t, z: 0 }),
      derivative: (t) => ({ x: 1, y: 2 * t, z: 0 }),
    };
    const samples = sampleUniformArcLength(parabola, 33, { tolerance: 1e-4, maximumSamples: 4096 });
    const distances = samples.slice(1).map((sample, index) => Math.hypot(
      sample.point.x - samples[index].point.x,
      sample.point.y - samples[index].point.y,
      ("z" in sample.point ? sample.point.z : 0) - ("z" in samples[index].point ? samples[index].point.z : 0),
    ));
    const minimum = Math.min(...distances);
    const maximum = Math.max(...distances);
    expect(samples).toHaveLength(33);
    expect(maximum / minimum).toBeLessThan(1.12);
    expect(samples.map((sample) => sample.normalizedArcLength)).toEqual(samples.map((_, index) => index / 32));
  });
});
