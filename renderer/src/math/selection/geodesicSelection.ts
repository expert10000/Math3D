import {
  buildAdjacencyFromTriangles,
  dijkstraDistancesAndPrev,
  type AdjacencyList,
} from "./geodesicGraph";

export type { AdjacencyList };

export function buildMeshAdjacency(
  indices: ArrayLike<number> | null,
  positions: Float32Array
): AdjacencyList {
  return buildAdjacencyFromTriangles(indices, positions);
}

export type GeodesicParams = {
  seedIndex: number;
  neighbors: number[][];
  weights: number[][];
  maxDist: number;
};

export function computeGeodesicDistances(params: GeodesicParams): Float64Array {
  const { seedIndex, neighbors, weights, maxDist } = params;
  const { dist } = dijkstraDistancesAndPrev({
    seedIndex,
    neighbors,
    weights,
    maxDist,
  });
  return dist;
}
