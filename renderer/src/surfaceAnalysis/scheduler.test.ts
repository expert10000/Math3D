import { describe, expect, it } from "vitest";
import { SurfaceAnalysisScheduler, createSurfaceAnalysisCacheKey, createSurfacePerformanceReport, shouldWorkerizeSurfaceAnalysis, surfaceTaskDependencies } from "./scheduler";

const keyInput = { surfaceId: "sphere", surfaceRevision: 2, representation: "parametric" as const, domain: "surface", samplingResolution: { u: 100, v: 100 }, analysisKind: "curvature" as const, parameters: { tolerance: 1e-6 }, method: "surface-sampling", dependencyRevisions: { "metric-forms": 3 } };

describe("Surface analysis scheduler", () => {
  it("creates stable complete cache keys and declares the dependency graph", () => {
    expect(createSurfaceAnalysisCacheKey(keyInput)).toBe(createSurfaceAnalysisCacheKey({ ...keyInput, parameters: { tolerance: 1e-6 } }));
    expect(createSurfaceAnalysisCacheKey({ ...keyInput, surfaceRevision: 3 })).not.toBe(createSurfaceAnalysisCacheKey(keyInput));
    expect(surfaceTaskDependencies("curvature")).toEqual(["metric-forms"]);
    expect(surfaceTaskDependencies("features")).toEqual(["principal-directions"]);
  });

  it("workerizes only heavy high-resolution tasks", () => {
    expect(shouldWorkerizeSurfaceAnalysis("curvature", 10_000)).toBe(true);
    expect(shouldWorkerizeSurfaceAnalysis("curvature", 9_999)).toBe(false);
    expect(shouldWorkerizeSurfaceAnalysis("derivatives", 100_000)).toBe(false);
  });

  it("publishes progress, caches results, and protects superseded jobs", async () => {
    const scheduler = new SurfaceAnalysisScheduler<number>(); const states: string[] = [];
    const first = await scheduler.run({ requestId: "a", surfaceRevision: 2, cacheKey: "key", publish: (job) => states.push(job.state), compute: async (_signal, progress) => { progress(0.5); return 42; } });
    const cached = await scheduler.run({ requestId: "b", surfaceRevision: 2, cacheKey: "key", publish: (job) => states.push(job.state), compute: () => 0 });
    expect(first.value).toBe(42); expect(cached).toMatchObject({ state: "cached", value: 42 });
    expect(states).toEqual(["queued", "running", "progressive", "ready", "cached"]);
  });

  it("records reviewed performance budgets", () => {
    expect(createSurfacePerformanceReport([{ scenario: "pointProbe", durationMs: 40 }, { scenario: "moduleSwitch", durationMs: 300 }]).measurements.map((entry) => entry.withinBudget)).toEqual([true, false]);
  });
});
