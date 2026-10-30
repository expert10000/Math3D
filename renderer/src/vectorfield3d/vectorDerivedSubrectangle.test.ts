import { describe, expect, it } from "vitest";
import type { VectorField3DOverlayRegion } from "@math3d/core";
import { verifiedCombinedDerivedRegionProfiles, verifiedVectorRegionProfile } from
  "./derivedCombinedRegionProfile";
import { summarizeVectorDerivedSubrectangle } from "./vectorDerivedSubrectangle";

describe("vector-only selected-cell statistics", () => {
  it("uses the snapped physical intersection and preserves per-field gaps", () => {
    const region: VectorField3DOverlayRegion = { normalAxis: 2, fixedCoordinate: 0,
      bounds: [[-4, 4], [-4, 4]], vectorChannel: "speed", visible: true };
    const cells = Array.from({ length: 289 }, (_, index) => index);
    const speed = { cells, unit: "m/s" } as unknown as Awaited<ReturnType<
      typeof verifiedVectorRegionProfile>>;
    const derived = { divergence: { cells: cells.map((value, index) =>
      index === 9 * 17 + 10 ? null : value * 2), unit: "1/s" },
      curlMagnitude: { cells: cells.map(value => value + 1), unit: "1/s" } } as
      unknown as Awaited<ReturnType<typeof verifiedCombinedDerivedRegionProfiles>>;
    const selected = summarizeVectorDerivedSubrectangle(region,
      [[0.25, 1.25], [0.25, 1.25]], speed, derived);
    expect(selected.sampleCount).toBe(4);
    expect(selected.vector).toEqual({ count: 4, gaps: 0, mean: 171,
      min: 162, max: 180 });
    expect(selected.divergence).toEqual({ count: 3, gaps: 1,
      mean: (324 + 358 + 360) / 3, min: 324, max: 360 });
    expect(selected.curlMagnitude).toEqual({ count: 4, gaps: 0,
      mean: 172, min: 163, max: 181 });
    expect(selected.vectorUnit).toBe("m/s");
    expect(selected.divergenceUnit).toBe("1/s");
  });
});
