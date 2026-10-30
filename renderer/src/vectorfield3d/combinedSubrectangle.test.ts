import { describe, expect, it } from "vitest";
import type { VectorField3DOverlayRegion } from "@math3d/core";
import { summarizeCombinedSubrectangle } from "./combinedSubrectangle";

describe("combined selected-cell statistics", () => {
  it("keeps six counts and circular phase independent on the same physical cells", () => {
    const region: VectorField3DOverlayRegion = { normalAxis: 2, fixedCoordinate: 0,
      bounds: [[-4, 4], [-4, 4]], vectorChannel: "speed", visible: true };
    const cells = Array<number | null>(289).fill(null);
    const indices = [162, 163, 179, 180];
    const field = (values: readonly (number | null)[]) => {
      const result = [...cells];
      indices.forEach((index, position) => { result[index] = values[position]!; });
      return result;
    };
    const summary = summarizeCombinedSubrectangle(region,
      [[0.25, 1.25], [0.25, 1.25]], {
        vector: field([1, 2, 3, 4]), scalar: field([10, null, 30, 40]),
        complexMagnitude: field([2, 2, 2, 2]),
        complexPhase: field([3.1, -3.1, null, null]),
        divergence: field([0, 1, 2, 3]),
        curlMagnitude: field([4, 5, null, 7]) }, {
        vectorUnit: "m/s", scalarUnit: "V", complexUnit: "1",
        divergenceUnit: "1/s", curlMagnitudeUnit: "1/s" });
    expect(summary.sampleCount).toBe(4);
    expect(summary.vector).toEqual({ count: 4, gaps: 0, mean: 2.5,
      min: 1, max: 4 });
    expect(summary.scalar).toEqual({ count: 3, gaps: 1, mean: 80 / 3,
      min: 10, max: 40 });
    expect(summary.complexPhase.count).toBe(2);
    expect(summary.complexPhase.gaps).toBe(2);
    expect(Math.abs(summary.complexPhase.mean!)).toBeCloseTo(Math.PI, 5);
    expect(summary.curlMagnitude).toEqual({ count: 3, gaps: 1,
      mean: 16 / 3, min: 4, max: 7 });
    expect(summary.scalarUnit).toBe("V");
    expect(summary.divergenceUnit).toBe("1/s");
  });
});
