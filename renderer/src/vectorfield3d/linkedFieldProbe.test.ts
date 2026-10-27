import { describe, expect, it } from "vitest";
import type { Graph2DScientificVolume } from "@math3d/core";
import { linkedFieldPointStatus, sampleLinkedFieldVolume } from "./linkedFieldProbe";

const cases = [
  { name: "small vector scene", shape: [21, 21, 17], origin: [-4, -4, -3],
    spacing: [0.4, 0.4, 0.375] },
  { name: "small scalar scene", shape: [17, 17, 17], origin: [-4, -4, -4],
    spacing: [0.5, 0.5, 0.5] },
  { name: "small complex scene", shape: [41, 41, 17], origin: [-4, -4, -2],
    spacing: [0.2, 0.2, 0.25] },
  { name: "80 cubed vortex", shape: [80, 80, 80], origin: [-4, -4, -4],
    spacing: [8 / 79, 8 / 79, 8 / 79] },
] as const;

describe("cross-layer physical probe", () => {
  for (const scene of cases) it(`interpolates verified ${scene.name} sample coordinates`, () => {
    const sampleShape = scene.shape.map(size => Math.min(32, size)) as [number, number, number];
    const axes = scene.shape.map((count, index) => ({ name: ["x", "y", "z"][index]!,
      unit: "m", origin: scene.origin[index]!, spacing: scene.spacing[index]!, count }));
    const sourcePosition = (axis: number, sample: number) =>
      Math.round(sample * (scene.shape[axis]! - 1) / (sampleShape[axis]! - 1));
    const values: number[] = [];
    for (let i = 0; i < sampleShape[0]; i++) for (let j = 0; j < sampleShape[1]; j++)
      for (let k = 0; k < sampleShape[2]; k++) {
        const [x, y, z] = [i, j, k].map((sample, axis) =>
          scene.origin[axis]! + sourcePosition(axis, sample) * scene.spacing[axis]!);
        values.push(1.5 * x! - 2 * y! + 0.25 * z!);
      }
    const volume = { sourceShape: scene.shape, sampleShape, values } as
      unknown as Graph2DScientificVolume;
    const point: [number, number, number] = [0.37, -0.63, 0.41];
    expect(linkedFieldPointStatus(point, axes, ["m", "m", "m"])).toBe("inside");
    expect(sampleLinkedFieldVolume(volume, axes, point)).toBeCloseTo(
      1.5 * point[0] - 2 * point[1] + 0.25 * point[2], 10);
  });

  it("withholds values outside a domain or with different physical units", () => {
    const axes = ["x", "y", "z"].map(name => ({ name, unit: "m", origin: -2,
      spacing: 0.5, count: 9 }));
    expect(linkedFieldPointStatus([0, 0, 3], axes, ["m", "m", "m"])).toBe("outside");
    expect(linkedFieldPointStatus([0, 0, 0], axes, ["mm", "mm", "mm"]))
      .toBe("incompatible-units");
  });
});
