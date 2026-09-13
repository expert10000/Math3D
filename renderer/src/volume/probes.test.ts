import { describe, expect, it } from "vitest";

import type { VolumeDataset } from "../scene/datasets";
import {
  adaptAnalyticVolume,
  adaptDenseGridVolume,
  comparePinnedVolumeProbes,
  createPinnedVolumeProbe,
  readVolumeProbe,
  restorePinnedVolumeProbes,
  type VolumeRevisionTracker,
  volumeGridIndexToWorld,
  volumeProbesToCsv,
  volumeWorldToGridIndex,
} from ".";

const direction: [number, number, number, number, number, number, number, number, number] = [
  0, -1, 0,
  1, 0, 0,
  0, 0, 1,
];

const orientedLinearDataset = (): VolumeDataset => {
  const grid: VolumeDataset["grid"] = {
    dims: [4, 3, 5],
    origin: [10, -2, 5],
    spacing: [2, 3, 4],
    direction,
    scalars: new Float32Array(4 * 3 * 5),
  };
  for (let k = 0; k < grid.dims[2]; k += 1) {
    for (let j = 0; j < grid.dims[1]; j += 1) {
      for (let i = 0; i < grid.dims[0]; i += 1) {
        const world = volumeGridIndexToWorld(grid, [i, j, k]);
        grid.scalars[i + grid.dims[0] * (j + grid.dims[1] * k)] = 2 * world[0] + 3 * world[1] + 4 * world[2];
      }
    }
  }
  return { kind: "volume", grid };
};

describe("Volume navigation and probes", () => {
  it("round-trips anisotropic, translated, directed grids", () => {
    const dataset = orientedLinearDataset();
    const index: [number, number, number] = [1.25, 0.5, 3.75];
    const world = volumeGridIndexToWorld(dataset.grid, index);
    expect(world).toEqual([8.5, 0.5, 20]);
    expect(volumeWorldToGridIndex(dataset.grid, world)).toEqual(index);
  });

  it("reports direction-aware numerical values and world gradients", () => {
    const dataset = orientedLinearDataset();
    const tracker: VolumeRevisionTracker = new Map();
    const volume = adaptDenseGridVolume({
      id: "oriented-linear",
      label: "Oriented linear field",
      sourceLabel: "fixture",
      dataset,
      grid: dataset.grid,
      tracker,
      direction,
    });
    const world = volumeGridIndexToWorld(dataset.grid, [2, 1, 2]);
    const reading = readVolumeProbe(dataset, volume, world, true);
    expect(reading.insideDomain).toBe(true);
    expect(reading.voxelIndex).toEqual([2, 1, 2]);
    expect(reading.components[0]).toBeCloseTo(2 * world[0] + 3 * world[1] + 4 * world[2], 5);
    expect(reading.gradientMethod).toBe("central-difference");
    expect(reading.gradient[0]).toBeCloseTo(2, 5);
    expect(reading.gradient[1]).toBeCloseTo(3, 5);
    expect(reading.gradient[2]).toBeCloseTo(4, 5);
  });

  it("labels analytic gradients and preserves probe revision records", () => {
    const dataset: VolumeDataset = {
      kind: "volume",
      grid: {
        dims: [3, 3, 3],
        origin: [-1, -1, -1],
        spacing: [1, 1, 1],
        scalars: new Float32Array(27),
      },
    };
    for (let k = 0; k < 3; k += 1) for (let j = 0; j < 3; j += 1) for (let i = 0; i < 3; i += 1) {
      const x = i - 1;
      const y = j - 1;
      const z = k - 1;
      dataset.grid.scalars[i + 3 * (j + 3 * k)] = x * x + y * y + z * z - 1;
    }
    const volume = adaptAnalyticVolume({
      id: "sphere",
      label: "Sphere",
      presetId: "sphere",
      expression: "x*x+y*y+z*z-1",
      parameters: { R: 1 },
      dataset,
      grid: dataset.grid,
      tracker: new Map(),
    });
    const firstReading = readVolumeProbe(dataset, volume, [1, 0, 0], true);
    const secondReading = readVolumeProbe(dataset, volume, [0, 1, 0], true);
    expect(firstReading.gradientMethod).toBe("analytic");
    expect(firstReading.gradient).toEqual([2, 0, 0]);

    const first = createPinnedVolumeProbe({ id: "p1", name: "Right", reading: firstReading, volume, now: 10 });
    const second = createPinnedVolumeProbe({ id: "p2", name: "Top", reading: secondReading, volume, now: 20 });
    const restored = restorePinnedVolumeProbes(JSON.parse(JSON.stringify([first, second])));
    expect(restored).toEqual([first, second]);
    expect(comparePinnedVolumeProbes(first, second).worldDistance).toBeCloseTo(Math.SQRT2);
    expect(volumeProbesToCsv(restored)).toContain('"gradientMethod"');
    expect(volumeProbesToCsv(restored)).toContain('"analytic"');
  });
});
