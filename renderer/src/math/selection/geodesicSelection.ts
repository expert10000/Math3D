export type AdjacencyList = {
  neighbors: number[][];
  weights: number[][];
};

export function buildMeshAdjacency(
  indices: ArrayLike<number> | null,
  positions: Float32Array
): AdjacencyList {
  const vertexCount = Math.floor(positions.length / 3);
  const neighbors: Map<number, number>[] = Array.from({ length: vertexCount }, () => new Map());
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    if (a < 0 || b < 0 || a >= vertexCount || b >= vertexCount) return;
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const w = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!Number.isFinite(w)) return;
    const existing = neighbors[a].get(b);
    if (existing == null || w < existing) {
      neighbors[a].set(b, w);
    }
  };

  if (indices && indices.length >= 3) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];
      addEdge(a, b);
      addEdge(b, a);
      addEdge(b, c);
      addEdge(c, b);
      addEdge(c, a);
      addEdge(a, c);
    }
  } else {
    const triCount = Math.floor(vertexCount / 3);
    for (let t = 0; t < triCount; t++) {
      const a = t * 3;
      const b = t * 3 + 1;
      const c = t * 3 + 2;
      addEdge(a, b);
      addEdge(b, a);
      addEdge(b, c);
      addEdge(c, b);
      addEdge(c, a);
      addEdge(a, c);
    }
  }

  const outNeighbors: number[][] = new Array(vertexCount);
  const outWeights: number[][] = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    outNeighbors[i] = Array.from(neighbors[i].keys());
    outWeights[i] = Array.from(neighbors[i].values());
  }

  return { neighbors: outNeighbors, weights: outWeights };
}

type HeapNode = { node: number; dist: number };

class MinHeap {
  private data: HeapNode[] = [];

  push(node: HeapNode) {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapNode | null {
    if (!this.data.length) return null;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length) {
      this.data[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  get size() {
    return this.data.length;
  }

  private bubbleUp(idx: number) {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.data[parent].dist <= this.data[idx].dist) break;
      [this.data[parent], this.data[idx]] = [this.data[idx], this.data[parent]];
      idx = parent;
    }
  }

  private bubbleDown(idx: number) {
    const len = this.data.length;
    while (true) {
      let best = idx;
      const left = idx * 2 + 1;
      const right = left + 1;
      if (left < len && this.data[left].dist < this.data[best].dist) best = left;
      if (right < len && this.data[right].dist < this.data[best].dist) best = right;
      if (best === idx) break;
      [this.data[best], this.data[idx]] = [this.data[idx], this.data[best]];
      idx = best;
    }
  }
}

export type GeodesicParams = {
  seedIndex: number;
  neighbors: number[][];
  weights: number[][];
  maxDist: number;
};

export function computeGeodesicDistances(params: GeodesicParams): Float32Array {
  const { seedIndex, neighbors, weights, maxDist } = params;
  const count = neighbors.length;
  const dist = new Float32Array(count);
  dist.fill(Number.POSITIVE_INFINITY);
  if (seedIndex < 0 || seedIndex >= count) return dist;
  dist[seedIndex] = 0;

  const heap = new MinHeap();
  heap.push({ node: seedIndex, dist: 0 });

  while (heap.size) {
    const current = heap.pop();
    if (!current) break;
    const { node, dist: d } = current;
    if (d !== dist[node]) continue;
    if (d > maxDist) continue;

    const nbrs = neighbors[node];
    const ws = weights[node];
    for (let i = 0; i < nbrs.length; i++) {
      const next = nbrs[i];
      const nd = d + ws[i];
      if (nd >= dist[next] || nd > maxDist) continue;
      dist[next] = nd;
      heap.push({ node: next, dist: nd });
    }
  }

  return dist;
}
