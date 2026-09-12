import { describe, expect, it } from "vitest";
import { createSurfaceCurvatureField } from "./surfaceCurvature";
import { SURFACE_ANALYSIS_PERFORMANCE_BUDGETS_MS, createSurfacePerformanceReport } from "./scheduler";

const profileCurvature = (sampleCount: number) => {
  const K = new Float64Array(sampleCount); const H = new Float64Array(sampleCount); const k1 = new Float64Array(sampleCount); const k2 = new Float64Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) { const value = Math.sin(index * 0.001); k1[index] = value + 1; k2[index] = value - 1; K[index] = k1[index] * k2[index]; H[index] = value; }
  const started = performance.now();
  const result = createSurfaceCurvatureField({ sampleCount, K, H, k1, k2 });
  return { durationMs: performance.now() - started, result, memoryBytes: K.byteLength + H.byteLength + k1.byteLength + k2.byteLength + result.gaussianCurvature.byteLength + result.meanCurvature.byteLength + result.principalCurvatures.byteLength };
};

describe("Surface Analysis current-build performance profile", () => {
  it("profiles 10k and 100k canonical fields against reviewed budgets", () => {
    const tenK = profileCurvature(10_000); const hundredK = profileCurvature(100_000);
    const report = createSurfacePerformanceReport([
      { scenario: "samples10k", durationMs: tenK.durationMs, sampleCount: 10_000, memoryBytes: tenK.memoryBytes },
      { scenario: "samples100k", durationMs: hundredK.durationMs, sampleCount: 100_000, memoryBytes: hundredK.memoryBytes },
    ]);
    expect(tenK.result.validDomainCount).toBe(10_000);
    expect(hundredK.result.validDomainCount).toBe(100_000);
    expect(report.measurements.every((measurement) => measurement.withinBudget)).toBe(true);
    expect(tenK.durationMs).toBeLessThan(SURFACE_ANALYSIS_PERFORMANCE_BUDGETS_MS.samples10k);
    expect(hundredK.durationMs).toBeLessThan(SURFACE_ANALYSIS_PERFORMANCE_BUDGETS_MS.samples100k);
  });
});
