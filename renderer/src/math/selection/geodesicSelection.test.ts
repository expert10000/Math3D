import { describe, expect, it, vi } from "vitest";
import { createMeshAdjacencyLookup, type CachedMeshAdjacency } from "./geodesicSelection";

describe("on-demand geodesic adjacency", () => {
  it("builds only requested meshes, reuses qualified buffers and invalidates replacements", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices = new Uint32Array([0, 1, 2]);
    const cache = new Map<string, CachedMeshAdjacency>();
    const build = vi.fn(() => ({ neighbors: [[1]], weights: [[1]] }));
    const lookup = createMeshAdjacencyLookup([{ key: "mesh", positions, indices }], cache, build);
    expect(build).not.toHaveBeenCalled();
    expect(lookup.get("unavailable")).toBeUndefined();
    expect(build).not.toHaveBeenCalled();
    lookup.get("mesh"); lookup.get("mesh");
    createMeshAdjacencyLookup([{ key: "mesh", positions, indices }], cache, build).get("mesh");
    expect(build).toHaveBeenCalledTimes(1);
    createMeshAdjacencyLookup([{ key: "mesh", positions: new Float32Array(positions), indices }], cache, build).get("mesh");
    expect(build).toHaveBeenCalledTimes(2);
  });
});
