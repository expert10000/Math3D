import { describe, expect, it } from "vitest";
import { sliceVolumeData } from "../scene/volume/sliceVolume";
import { computeVolumeStatistics } from "./analysis";
import { connectedComponentsLabelMap, thresholdVolumeMask } from "./segmentation";
import { createCanonicalVolumeFixture, hashVolumeValues, VOLUME_REGRESSION_MATRIX } from "./regression";

describe("Volume v1 canonical regression matrix", () => {
  it("enumerates every frozen dataset class with stable unique IDs", () => {
    expect(new Set(VOLUME_REGRESSION_MATRIX.map((entry) => entry.id)).size).toBe(VOLUME_REGRESSION_MATRIX.length);
    for (const category of ["analytic","sdf","voxel","labels","pathological","stress"]) expect(VOLUME_REGRESSION_MATRIX.some((entry) => entry.category === category)).toBe(true);
  });

  it("freezes analytic samples, statistics, slice orientation and hashes", () => {
    const ramp = createCanonicalVolumeFixture("ramp").grid!;
    const stats = computeVolumeStatistics(ramp.scalars, { histogramBins: 8 });
    expect(stats.finiteCount).toBe(729);
    expect(stats.minimum).toBe(-6);
    expect(stats.maximum).toBe(6);
    expect(stats.mean).toBeCloseTo(0, 7);
    const slice = sliceVolumeData(ramp, "z", 4);
    expect(slice.plane.normal).toEqual([0,0,1]);
    expect(hashVolumeValues(slice.values)).toBe("fnv1a32:8d6af535");
    expect(hashVolumeValues(createCanonicalVolumeFixture("constant").grid!.scalars)).toBe("fnv1a32:28d9aa8d");
  });

  it("freezes categorical connectivity and sparse IDs", () => {
    const components = createCanonicalVolumeFixture("two-components").grid!;
    const labels = connectedComponentsLabelMap(thresholdVolumeMask(components, .5), 6);
    expect(labels.labels).toHaveLength(2);
    expect(createCanonicalVolumeFixture("sparse-label-ids").expected.uniqueLabels).toEqual([0,2,1000]);
  });

  it("keeps pathological diagnostics explicit", () => {
    expect(createCanonicalVolumeFixture("nan-inf").expected.finiteCount).toBe(727);
    expect(createCanonicalVolumeFixture("empty").expectedFailure).toMatch(/empty/);
    expect(createCanonicalVolumeFixture("invalid-spacing").expectedFailure).toMatch(/spacing/);
    expect(createCanonicalVolumeFixture("truncated-import").expectedFailure).toMatch(/truncated/);
    expect(createCanonicalVolumeFixture("one-by-n-by-n").grid?.dims).toEqual([1,9,9]);
  });

  it("builds stress fixtures lazily so aggregate tests choose their memory class", () => {
    expect(createCanonicalVolumeFixture("stress-128", 16).grid?.scalars).toHaveLength(4096);
    expect(createCanonicalVolumeFixture("stress-256", 8).grid?.dims).toEqual([8,8,8]);
    expect(createCanonicalVolumeFixture("stress-bricked", 12).grid?.scalars.byteLength).toBe(12**3*4);
  });
});
