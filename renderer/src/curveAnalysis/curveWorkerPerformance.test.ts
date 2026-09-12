import { describe, expect, it } from "vitest";
import { CURVE_OUTPUT_LIMITS, CURVE_PERFORMANCE_BUDGETS, CurveDependencyCache, executeCurveWorkerRequest, type CurveComputationArtifact, type CurveWorkerRequest, type CurveWorkloadClass } from "./curveComputation";

const makeRequest = (workload: CurveWorkloadClass, targetCount: number, positions = new Float64Array([0, 0, 0, 0.5, 1, 0, 1, 0, 0])): CurveWorkerRequest => ({ requestId: `profile:${workload}`, operation: "sampling", curveId: "profile", curveRevision: 1, curveFingerprint: "profile-v1", dependencies: [], backendVersion: "curve-worker-v1", tolerance: 1e-5, targetCount, workload, positions, consumers: ["viewport", "plots", "curve-mesh"] });

describe("Curve worker performance budgets", () => {
  it("executes reviewed 1k, 10k, and 100k sampling workloads within their envelopes", async () => {
    for (const [workload, count] of [["1k", 1_000], ["10k", 10_000], ["100k", 100_000]] as const) {
      const progress: number[] = []; const result = await executeCurveWorkerRequest(makeRequest(workload, count), (entry) => progress.push(entry.fraction), () => false);
      expect(result.output).toHaveLength(count * 3); expect(result.runtimeMs).toBeLessThan(CURVE_PERFORMANCE_BUDGETS[workload].timeoutMs); expect(progress[0]).toBe(0.02); expect(progress.at(-1)).toBe(1);
    }
  }, 60_000);

  it("handles a high-curvature 10k fixture and a 25k-control-point fitting fixture", async () => {
    const highCurvature = new Float64Array(10_000 * 3); for (let index = 0; index < 10_000; index += 1) { highCurvature[index * 3] = index / 9_999; highCurvature[index * 3 + 1] = Math.sin(index * 0.2); }
    const differential = await executeCurveWorkerRequest({ ...makeRequest("high-curvature", 10_000, highCurvature), operation: "differential-field" }, () => undefined, () => false); expect(differential.output).toHaveLength(60_000);
    const controls = new Float64Array(25_000 * 3); for (let index = 0; index < 25_000; index += 1) { controls[index * 3] = index; controls[index * 3 + 1] = index % 7; }
    const fit = await executeCurveWorkerRequest({ ...makeRequest("many-control-points", 25_000, controls), operation: "spline-fit", parameters: { controlPoints: 25_000 } }, () => undefined, () => false); expect(fit.statistics).toMatchObject({ sampleCount: 25_000, controlPoints: 25_000, residualReported: true });
  }, 60_000);

  it("keeps repeated module/preset/edit artifacts inside the cache memory cap", () => {
    const cache = new CurveDependencyCache(1_000_000);
    for (let revision = 1; revision <= 120; revision += 1) {
      const output = new Float64Array(8_000); const artifact: CurveComputationArtifact = { artifactId: `switch:${revision}`, cacheKey: `switch:${revision}`, state: "ready", operation: revision % 4 === 0 ? "diagnostics" : "sampling", curveId: `preset:${revision % 12}`, curveRevision: revision, output, statistics: { revision }, warnings: revision % 15 === 0 ? ["backend failure fallback"] : [], runtimeMs: 1, consumers: ["viewport"], createdAt: revision };
      cache.set(artifact.cacheKey, artifact); expect(cache.byteLength).toBeLessThanOrEqual(cache.maximumBytes);
    }
    expect(cache.size).toBeLessThan(120); expect(cache.byteLength).toBeLessThanOrEqual(1_000_000); expect(CURVE_OUTPUT_LIMITS.cacheBytes).toBe(64_000_000);
  });
});
