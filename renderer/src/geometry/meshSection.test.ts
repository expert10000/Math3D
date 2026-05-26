import { describe, expect, it } from "vitest";
import { computeMeshSection, sectionPlaneNormalFromPreset } from "./meshSection";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

const mkMesh = (positions: number[], indices: number[]): Pick<SurfaceMeshData, "positions" | "indices"> => ({
  positions: new Float32Array(positions),
  indices: new Uint32Array(indices),
});

describe("meshSection", () => {
  it("builds a circular section for an octahedron sphere proxy", () => {
    const mesh = mkMesh(
      [
        1, 0, 0, // 0
        -1, 0, 0, // 1
        0, 1, 0, // 2
        0, -1, 0, // 3
        0, 0, 1, // 4
        0, 0, -1, // 5
      ],
      [
        0, 2, 4,
        2, 1, 4,
        1, 3, 4,
        3, 0, 4,
        2, 0, 5,
        1, 2, 5,
        3, 1, 5,
        0, 3, 5,
      ]
    );
    const section = computeMeshSection(
      mesh,
      {
        origin: { x: 0, y: 0, z: 0.2 },
        normal: { x: 0, y: 0, z: 1 },
      },
      1e-6
    );
    expect(section.segmentCount).toBeGreaterThan(0);
    expect(section.curveLength).toBeGreaterThan(0);
    expect(section.area).toBeGreaterThan(0);
    expect(section.closedPolygons.length).toBeGreaterThan(0);
  });

  it("returns zero result when plane misses mesh", () => {
    const mesh = mkMesh(
      [
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ],
      [0, 1, 2]
    );
    const section = computeMeshSection(
      mesh,
      {
        origin: { x: 0, y: 0, z: 3 },
        normal: { x: 0, y: 0, z: 1 },
      },
      1e-6
    );
    expect(section.segmentCount).toBe(0);
    expect(section.polylines.length).toBe(0);
    expect(section.area).toBe(0);
  });

  it("maps plane presets and normalizes custom", () => {
    expect(sectionPlaneNormalFromPreset("xy", { x: 9, y: 9, z: 9 })).toEqual({ x: 0, y: 0, z: 1 });
    expect(sectionPlaneNormalFromPreset("yz", { x: 9, y: 9, z: 9 })).toEqual({ x: 1, y: 0, z: 0 });
    expect(sectionPlaneNormalFromPreset("xz", { x: 9, y: 9, z: 9 })).toEqual({ x: 0, y: 1, z: 0 });
    const custom = sectionPlaneNormalFromPreset("custom", { x: 0, y: 4, z: 0 });
    expect(custom.x).toBe(0);
    expect(custom.y).toBe(1);
    expect(custom.z).toBe(0);
  });
});
