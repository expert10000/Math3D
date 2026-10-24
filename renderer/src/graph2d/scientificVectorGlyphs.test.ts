import { describe, expect, it } from "vitest";
import type { Graph2DScientificPlane, ScientificCoordinateSystem } from "@math3d/core";
import { buildScientificVectorGlyphs, SCIENTIFIC_VECTOR_GLYPH_LIMIT } from "./scientificVectorGlyphs";

const coordinate: ScientificCoordinateSystem = { id: "plane", kind: "cartesian",
  axes: [{ name: "east", unit: "km" }, { name: "north", unit: "km" }],
  origin: [10, 20], spacing: [-2, 3], periodic: [false, false] };

const planes = (shape: [number, number], vx: number, vy: number):
  [Graph2DScientificPlane, Graph2DScientificPlane] => {
  const common = { fingerprint: "a".repeat(64), datasetId: "field", sourceShape: shape,
    normalAxis: null, fixedIndex: null, planeAxes: [0, 1] as [number, number], shape,
    resourceSha256: "a".repeat(64), planeSha256: "b".repeat(64) };
  return [{ ...common, component: "east", values: Array(shape[0] * shape[1]).fill(vx) },
    { ...common, component: "north", values: Array(shape[0] * shape[1]).fill(vy) }];
};

describe("bounded scientific 2D vector glyphs", () => {
  it("covers the grid with no more than 512 arrows and computes magnitudes from both components", () => {
    const result = buildScientificVectorGlyphs(planes([256, 256], 3, 4), coordinate);
    expect(result.glyphs.length).toBeLessThanOrEqual(SCIENTIFIC_VECTOR_GLYPH_LIMIT);
    expect(result.glyphs.length).toBeGreaterThan(400);
    expect(result.minimum).toBe(5);
    expect(result.maximum).toBe(5);
    expect(result.xRange).toEqual([-500, 10]);
    expect(result.yRange).toEqual([20, 785]);
    expect(result.glyphs[0]).toMatchObject({ x: 1, y: 1, vx: 3, vy: 4 });
    expect(result.glyphs.at(-1)).toMatchObject({ x: 0, y: 0 });
  });

  it("marks stationary and single-axis samples without dividing by zero", () => {
    const result = buildScientificVectorGlyphs(planes([1, 4], 0, 0), coordinate);
    expect(result.glyphs).toHaveLength(4);
    expect(result.glyphs.every(glyph => glyph.x === 0.5 && glyph.magnitude === 0)).toBe(true);
    expect(result.minimum).toBe(0);
    expect(result.maximum).toBe(0);
  });
});
