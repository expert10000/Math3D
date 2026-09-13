import { describe, expect, it } from "vitest";
import { computeVolumeStatistics } from "./analysis";
import { createCanonicalVolumeFixture, profileVolumeOperation } from "./regression";

describe("Volume v1 reviewed performance gates", () => {
  it("records fixture, hardware, backend, cache, median, p95 and peak working set", () => {
    const grid = createCanonicalVolumeFixture("stress-128", 48).grid!;
    const timings: number[] = [];
    for (let pass=0;pass<5;pass+=1) { const started=performance.now(); computeVolumeStatistics(grid.scalars, { histogramBins: 64 }); timings.push(performance.now()-started); }
    const profile = profileVolumeOperation("stress-128 (48³ CI proxy)", "math3d-native-cpu", timings, grid.scalars.byteLength * 3, 1000, "warm");
    expect(profile).toMatchObject({ hardwareClass: "reviewed-desktop", backend: "math3d-native-cpu", cache: "warm", passed: true });
    expect(profile.medianMs).toBeGreaterThanOrEqual(0);
    expect(profile.p95Ms).toBeLessThanOrEqual(profile.budgetMs);
    expect(profile.peakWorkingSetBytes).toBe(grid.scalars.byteLength * 3);
  });

  it("fails budgets from p95 rather than hiding tail latency", () => {
    const profile = profileVolumeOperation("synthetic", "cpu", [1,2,2,3,80], 1024, 20, "cold");
    expect(profile.medianMs).toBe(2);
    expect(profile.p95Ms).toBe(80);
    expect(profile.passed).toBe(false);
  });
});
