import { describe, expect, it } from "vitest";

import { buildVolumeGridFromPreset } from "../scene/volume/volumePresets";
import {
  dimensionsForSpacing,
  planVolumeAllocation,
  reportVolumeNonFinite,
  resampleVolumeGrid,
  samplingFromBounds,
  samplingSpacing,
  type VolumeSamplingScalarType,
} from "../scene/volume/volumeSampling";

describe("Volume sampling and allocation planning", () => {
  it("estimates allocated bytes for every scalar type and component count", () => {
    const bytes: Record<VolumeSamplingScalarType, number> = {
      uint8: 1,
      int8: 1,
      int16: 2,
      uint16: 2,
      int32: 4,
      uint32: 4,
      float32: 4,
      float64: 8,
    };
    for (const [scalarType, bytesPerValue] of Object.entries(bytes) as Array<[VolumeSamplingScalarType, number]>) {
      for (const components of [1, 2, 3, 4]) {
        const plan = planVolumeAllocation({ dims: [17, 13, 9], scalarType, components });
        expect(plan.sampleCount).toBe(17 * 13 * 9);
        expect(plan.cpuBytes).toBe(17 * 13 * 9 * components * bytesPerValue);
        expect(plan.gpuBytes).toBe(17 * 13 * 9 * components * Math.min(4, bytesPerValue));
      }
    }
    expect(planVolumeAllocation({ dims: [256, 256, 256], scalarType: "float64", components: 16 }).warning).toBe("blocked");
  });

  it("freezes point/cell spacing and target-dimension conventions", () => {
    const sampling = samplingFromBounds({ min: [-2, -3, -4], max: [2, 3, 4] }, [5, 4, 3]);
    expect(samplingSpacing(sampling, "point")).toEqual([1, 2, 4]);
    expect(samplingSpacing(sampling, "cell")).toEqual([0.8, 1.5, 8 / 3]);
    expect(dimensionsForSpacing(sampling, [0.5, 1, 2], "point")).toEqual([9, 7, 5]);
    expect(dimensionsForSpacing(sampling, [0.5, 1, 2], "cell")).toEqual([8, 6, 4]);
  });

  it("samples analytic sphere and ellipsoid truth values at their centers", () => {
    const sphere = buildVolumeGridFromPreset("sphere", { dims: [3, 3, 3], params: { R: 2 } });
    expect(sphere.scalars[13]).toBeCloseTo(-4, 6);
    const ellipsoid = buildVolumeGridFromPreset("ellipsoid", {
      dims: [3, 3, 3],
      params: { a: 2, b: 1, c: 0.5 },
    });
    expect(ellipsoid.scalars[13]).toBeCloseTo(-1, 6);
  });

  it("resamples a physical linear field without changing requested bounds", () => {
    const source = {
      dims: [3, 3, 3] as [number, number, number],
      origin: [-1, -1, -1] as [number, number, number],
      spacing: [1, 1, 1] as [number, number, number],
      scalars: new Float32Array(27),
    };
    for (let k = 0; k < 3; k += 1) {
      for (let j = 0; j < 3; j += 1) {
        for (let i = 0; i < 3; i += 1) {
          source.scalars[i + 3 * (j + 3 * k)] = 2 * (i - 1) + 3 * (j - 1) - (k - 1);
        }
      }
    }
    const target = resampleVolumeGrid(source, { center: [0, 0, 0], extents: [1, 1, 1], dims: [5, 5, 5] }, {
      centering: "point",
      interpolation: "linear",
      boundary: "clamp",
    });
    expect(target.origin).toEqual([-1, -1, -1]);
    expect(target.spacing).toEqual([0.5, 0.5, 0.5]);
    expect(target.scalars[2 + 5 * (2 + 5 * 2)]).toBeCloseTo(0, 6);
    expect(target.scalars[4 + 5 * (4 + 5 * 0)]).toBeCloseTo(2 * 1 + 3 * 1 - -1, 6);
  });

  it("reports explicit non-finite and missing sample bounds", () => {
    const report = reportVolumeNonFinite(new Float32Array([0, Number.NaN, 2, Number.POSITIVE_INFINITY, 4]), [3, 2, 1]);
    expect(report.finiteCount).toBe(3);
    expect(report.nonFiniteCount).toBe(3);
    expect(report.nonFiniteIndexBounds).toEqual({ min: [0, 0, 0], max: [2, 1, 0] });
  });
});
