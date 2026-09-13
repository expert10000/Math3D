import { describe, expect, it } from "vitest";

import { marchingCubesVolume } from "../math/marchingCubes";
import type { VolumeGrid } from "../scene/datasets";
import { analyzeVolumeIsosurface } from "./isosurface";
import {
  analyzeMeshForSignedDistance,
  applySdfOperation,
  createSdfMetadata,
  occupancyFromDistance,
  reinitializeSignedDistance,
} from "./sdf";

const cubePositions = new Float32Array([
  -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
  -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
]);
const cubeIndices = new Uint32Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
  0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
]);

const field = (fn: (x: number, y: number, z: number) => number, dims: [number, number, number] = [25, 25, 25]): VolumeGrid => {
  const origin: [number, number, number] = [-1.5, -1.5, -1.5];
  const spacing: [number, number, number] = dims.map((n) => 3 / (n - 1)) as [number, number, number];
  const scalars = new Float32Array(dims[0] * dims[1] * dims[2]);
  for (let z = 0; z < dims[2]; z += 1) for (let y = 0; y < dims[1]; y += 1) for (let x = 0; x < dims[0]; x += 1) {
    scalars[x + dims[0] * (y + dims[1] * z)] = fn(origin[0] + x * spacing[0], origin[1] + y * spacing[1], origin[2] + z * spacing[2]);
  }
  return { dims, origin, spacing, scalars, centering: "point" };
};

describe("Volume SDF workflow", () => {
  it("publishes closedness, orientation, and sign confidence before signed sampling", () => {
    const closed = analyzeMeshForSignedDistance(cubePositions, cubeIndices);
    expect(closed).toMatchObject({ reliable: true, confidence: "high", watertight: true, orientation: "outward", boundaryEdgeCount: 0 });
    expect(closed.signedVolume).toBeCloseTo(8, 6);

    const open = analyzeMeshForSignedDistance(cubePositions, cubeIndices.slice(0, cubeIndices.length - 6));
    expect(open.reliable).toBe(false);
    expect(open.boundaryEdgeCount).toBeGreaterThan(0);
    expect(open.message).toContain("not reliable");
  });

  it("implements deterministic occupancy and SDF boolean/offset operations", () => {
    const sphereA = field((x, y, z) => Math.hypot(x + 0.35, y, z) - 0.75, [9, 9, 9]);
    const sphereB = field((x, y, z) => Math.hypot(x - 0.35, y, z) - 0.75, [9, 9, 9]);
    const center = 4 + 9 * (4 + 9 * 4);
    expect(applySdfOperation(sphereA, "union", sphereB)[center]).toBeLessThan(0);
    expect(applySdfOperation(sphereA, "intersection", sphereB)[center]).toBeLessThan(0);
    expect(applySdfOperation(sphereA, "subtraction", sphereB)[center]).toBeGreaterThanOrEqual(0);
    expect(applySdfOperation(sphereA, "offset", null, { amount: 0.2 })[0]).toBeCloseTo(sphereA.scalars[0] - 0.2, 6);
    expect(applySdfOperation(sphereA, "shell", null, { amount: 0.2 })[center]).toBeGreaterThan(0);
    expect(applySdfOperation(sphereA, "smooth-union", sphereB, { smoothness: 0.25 })[center]).toBeLessThan(applySdfOperation(sphereA, "union", sphereB)[center]);
    expect(occupancyFromDistance(sphereA.scalars, true)[center]).toBe(1);
  });

  it("reinitializes signs and round-trips a sphere through iso zero", () => {
    const radius = 0.93;
    const sphere = field((x, y, z) => (Math.hypot(x, y, z) - radius) * 3);
    const reinitialized = reinitializeSignedDistance(sphere.scalars, sphere.dims, sphere.spacing!, 3);
    const center = 12 + 25 * (12 + 25 * 12);
    expect(reinitialized[center]).toBeLessThan(0);
    expect(reinitialized[0]).toBeGreaterThan(0);
    const mesh = marchingCubesVolume({ ...sphere, scalars: reinitialized }, 0);
    expect(mesh).not.toBeNull();
    const metrics = analyzeVolumeIsosurface(mesh!);
    expect(metrics.bounds?.min[0] ?? 0).toBeLessThan(-0.8);
    expect(metrics.bounds?.min[0] ?? -2).toBeGreaterThan(-1.05);
    expect(metrics.bounds?.max[0] ?? 0).toBeGreaterThan(0.8);
    expect(metrics.bounds?.max[0] ?? 2).toBeLessThan(1.05);
    expect(metrics.enclosedVolume ?? 0).toBeGreaterThan(2.6);
    expect(metrics.enclosedVolume ?? 0).toBeLessThan(4.2);
  });

  it("round-trips sampling and multi-source provenance exactly", () => {
    const grid = field((x, y, z) => Math.hypot(x, y, z) - 1, [5, 5, 5]);
    const metadata = createSdfMetadata({
      grid,
      output: "signed-distance",
      operation: "smooth-union",
      parameters: { smoothness: 0.2 },
      sources: [
        { module: "mesh", objectId: "mesh:a", revision: 3, label: "A", transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], positionUnits: "mm" },
        { module: "geometry", objectId: "geometry:b", revision: 7, label: "B", transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], positionUnits: "mm" },
      ],
      sign: analyzeMeshForSignedDistance(cubePositions, cubeIndices),
      backend: "math3d-native",
      now: 123,
    });
    expect(metadata.sampling).toEqual({ dimensions: [5, 5, 5], origin: [-1.5, -1.5, -1.5], spacing: [0.75, 0.75, 0.75], centering: "point" });
    expect(metadata.sources.map((source) => `${source.objectId}@${source.revision}`)).toEqual(["mesh:a@3", "geometry:b@7"]);
    expect(metadata.createdAt).toBe(123);
  });
});
