import { describe, expect, it } from "vitest";
import {
  dijkstraDistancesAndPrev,
  reconstructPath,
  reconstructPathToAnySeed,
} from "./geodesicGraph";

const lineGraph = {
  neighbors: [
    [1],
    [0, 2],
    [1, 3],
    [2],
  ],
  weights: [
    [1],
    [1, 1],
    [1, 1],
    [1],
  ],
};

describe("geodesicGraph dijkstra", () => {
  it("keeps single-source behavior intact", () => {
    const { dist, prev } = dijkstraDistancesAndPrev({
      seedIndex: 0,
      neighbors: lineGraph.neighbors,
      weights: lineGraph.weights,
      targetIndex: 3,
    });
    expect(dist[3]).toBe(3);
    expect(reconstructPath(prev, 0, 3)).toEqual([0, 1, 2, 3]);
  });

  it("supports multi-source shortest path to nearest seed", () => {
    const seeds = [0, 3];
    const { dist, prev } = dijkstraDistancesAndPrev({
      seedIndices: seeds,
      neighbors: lineGraph.neighbors,
      weights: lineGraph.weights,
      targetIndex: 2,
    });
    expect(dist[2]).toBe(1);
    expect(reconstructPathToAnySeed(prev, 2, seeds)).toEqual([3, 2]);
  });

  it("ignores disallowed sources in multi-source mode", () => {
    const seeds = [0, 3];
    const allowed = new Uint8Array([1, 1, 1, 0]);
    const { dist, prev } = dijkstraDistancesAndPrev({
      seedIndices: seeds,
      neighbors: lineGraph.neighbors,
      weights: lineGraph.weights,
      targetIndex: 2,
      allowed,
    });
    expect(dist[2]).toBe(2);
    expect(reconstructPathToAnySeed(prev, 2, seeds)).toEqual([0, 1, 2]);
  });
});
