import { describe, expect, it } from "vitest";
import type { VolumeGrid } from "../datasets";
import { viewerSliceData, viewerSliceImage } from "./viewerSliceCache";

describe("Volume viewer slice reuse", () => {
  it("reuses an unchanged source and refreshes an in-place scientific edit", () => {
    const grid: VolumeGrid = {
      dims: [2, 2, 2],
      scalars: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]),
      spacing: [1, 1, 1],
    };
    const first = viewerSliceData(grid, "z", 0);
    const firstImage = viewerSliceImage(first);
    expect(viewerSliceData(grid, "z", 0)).toBe(first);
    expect(viewerSliceImage(first)).toBe(firstImage);

    grid.scalars[0] = 9;
    const edited = viewerSliceData(grid, "z", 0);
    expect(edited).not.toBe(first);
    expect(edited.values[0]).toBe(9);
    expect(viewerSliceImage(edited).data).not.toEqual(firstImage.data);

    grid.spacing = [2, 1, 1];
    const moved = viewerSliceData(grid, "z", 0);
    expect(moved).not.toBe(edited);
    expect(moved.plane.width).toBe(2);
  });

  it("evicts old slices so many distinct sources do not stay cached", () => {
    const grid: VolumeGrid = { dims: [2, 2, 2], scalars: new Float32Array(8) };
    const oldest = viewerSliceData(grid, "x", 0);
    for (let i = 0; i < 30; i++) {
      const next: VolumeGrid = { dims: [2, 2, 2], scalars: new Float32Array(8).fill(i) };
      viewerSliceImage(viewerSliceData(next, "x", 0));
    }
    expect(viewerSliceData(grid, "x", 0)).not.toBe(oldest);
  });
});
