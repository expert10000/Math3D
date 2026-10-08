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

export type CachedMeshAdjacency = AdjacencyList & { positions: Float32Array; indices: ArrayLike<number> | null };

/** Navigation does not need adjacency; prepare only the mesh a tool requests. */
export function createMeshAdjacencyLookup(
  meshes: readonly { key: string; positions: Float32Array; indices: ArrayLike<number> | null }[],
  cache: Map<string, CachedMeshAdjacency>,
  build = buildMeshAdjacency
) {
  const available = new Map(meshes.map(mesh => [mesh.key, mesh]));
  return { get(key: string): AdjacencyList | undefined {
    const mesh = available.get(key);
    if (!mesh) return undefined;
    const cached = cache.get(key);
    if (cached?.positions === mesh.positions && cached.indices === mesh.indices) return cached;
    const adjacency = build(mesh.indices, mesh.positions);
    cache.delete(key);
    cache.set(key, { ...adjacency, positions: mesh.positions, indices: mesh.indices });
    while (cache.size > 64) cache.delete(cache.keys().next().value!);
    return adjacency;
  } };
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
