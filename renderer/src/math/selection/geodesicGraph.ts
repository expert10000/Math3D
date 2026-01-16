export type AdjacencyList = {
  neighbors: number[][];
  weights: number[][];
  vertexToMerged?: Int32Array;
  mergedToVertex?: Int32Array;
  edgeSources?: number[][];
  edgeTargets?: number[][];
};

type MergeResult = {
  vertexToMerged: Int32Array;
  mergedToVertex: Int32Array;
};

function mergeVerticesByPosition(positions: Float32Array, eps: number): MergeResult {
  const vertexCount = Math.floor(positions.length / 3);
  const vertexToMerged = new Int32Array(vertexCount);
  vertexToMerged.fill(-1);
  const mergedToVertex: number[] = [];
  if (!Number.isFinite(eps) || eps <= 0) {
    for (let i = 0; i < vertexCount; i++) {
      vertexToMerged[i] = i;
      mergedToVertex.push(i);
    }
    return { vertexToMerged, mergedToVertex: Int32Array.from(mergedToVertex) };
  }

  const eps2 = eps * eps;
  const buckets = new Map<string, number[]>();
  const keyFor = (qx: number, qy: number, qz: number) => `${qx}|${qy}|${qz}`;

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const qx = Math.round(x / eps);
    const qy = Math.round(y / eps);
    const qz = Math.round(z / eps);

    let merged = -1;
    search: for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = buckets.get(keyFor(qx + dx, qy + dy, qz + dz));
          if (!list) continue;
          for (let j = 0; j < list.length; j++) {
            const rep = list[j];
            const rx = positions[rep * 3];
            const ry = positions[rep * 3 + 1];
            const rz = positions[rep * 3 + 2];
            const dxp = x - rx;
            const dyp = y - ry;
            const dzp = z - rz;
            if (dxp * dxp + dyp * dyp + dzp * dzp <= eps2) {
              merged = vertexToMerged[rep];
              break search;
            }
          }
        }
      }
    }

    if (merged < 0) {
      merged = mergedToVertex.length;
      mergedToVertex.push(i);
      vertexToMerged[i] = merged;
      const key = keyFor(qx, qy, qz);
      const list = buckets.get(key);
      if (list) list.push(i);
      else buckets.set(key, [i]);
    } else {
      vertexToMerged[i] = merged;
    }
  }

  return { vertexToMerged, mergedToVertex: Int32Array.from(mergedToVertex) };
}

type NeighborEdge = {
  w: number;
  a: number;
  b: number;
};

export function buildAdjacencyFromTriangles(
  indices: ArrayLike<number> | null,
  positions: Float32Array
): AdjacencyList {
  const vertexCount = Math.floor(positions.length / 3);
  const hasIndices = !!(indices && indices.length >= 3);
  const triCount = hasIndices ? Math.floor(indices!.length / 3) : Math.floor(vertexCount / 3);
  const triSamples = Math.max(1, Math.floor(triCount / 2000));
  let edgeSum = 0;
  let edgeCount = 0;
  for (let t = 0; t < triCount; t += triSamples) {
    const base = t * 3;
    const a = hasIndices ? (indices as ArrayLike<number>)[base] : base;
    const b = hasIndices ? (indices as ArrayLike<number>)[base + 1] : base + 1;
    const c = hasIndices ? (indices as ArrayLike<number>)[base + 2] : base + 2;
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    const cx = positions[c * 3];
    const cy = positions[c * 3 + 1];
    const cz = positions[c * 3 + 2];
    const ab = Math.hypot(bx - ax, by - ay, bz - az);
    const bc = Math.hypot(cx - bx, cy - by, cz - bz);
    const ca = Math.hypot(ax - cx, ay - cy, az - cz);
    if (Number.isFinite(ab)) {
      edgeSum += ab;
      edgeCount++;
    }
    if (Number.isFinite(bc)) {
      edgeSum += bc;
      edgeCount++;
    }
    if (Number.isFinite(ca)) {
      edgeSum += ca;
      edgeCount++;
    }
  }
  const avgEdge = edgeCount ? edgeSum / edgeCount : 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  const baseEps = Math.max(1e-6, avgEdge * 1e-2, diag * 1e-4);
  const maxEps = Math.max(baseEps, avgEdge * 0.5, diag * 2e-3);

  const buildMergedAdjacency = (eps: number) => {
    const { vertexToMerged, mergedToVertex } = mergeVerticesByPosition(positions, eps);
    const mergedCount = mergedToVertex.length;
    const neighbors: Map<number, NeighborEdge>[] = Array.from({ length: mergedCount }, () => new Map());
    const addEdge = (a: number, b: number) => {
      const ma = vertexToMerged[a];
      const mb = vertexToMerged[b];
      if (ma === mb) return;
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
      const existing = neighbors[ma].get(mb);
      if (!existing || w < existing.w) {
        neighbors[ma].set(mb, { w, a, b });
      }
    };

    for (let t = 0; t < triCount; t++) {
      const base = t * 3;
      const a = hasIndices ? (indices as ArrayLike<number>)[base] : base;
      const b = hasIndices ? (indices as ArrayLike<number>)[base + 1] : base + 1;
      const c = hasIndices ? (indices as ArrayLike<number>)[base + 2] : base + 2;
      addEdge(a, b);
      addEdge(b, a);
      addEdge(b, c);
      addEdge(c, b);
      addEdge(c, a);
      addEdge(a, c);
    }

    const outNeighbors: number[][] = new Array(mergedCount);
    const outWeights: number[][] = new Array(mergedCount);
    const outEdgeSources: number[][] = new Array(mergedCount);
    const outEdgeTargets: number[][] = new Array(mergedCount);
    for (let i = 0; i < mergedCount; i++) {
      const entries = Array.from(neighbors[i].entries());
      outNeighbors[i] = entries.map((entry) => entry[0]);
      outWeights[i] = entries.map((entry) => entry[1].w);
      outEdgeSources[i] = entries.map((entry) => entry[1].a);
      outEdgeTargets[i] = entries.map((entry) => entry[1].b);
    }
    return {
      neighbors: outNeighbors,
      weights: outWeights,
      vertexToMerged,
      mergedToVertex,
      edgeSources: outEdgeSources,
      edgeTargets: outEdgeTargets,
    };
  };

  const countLowDegree = (neighbors: number[][]) => {
    let low = 0;
    for (let i = 0; i < neighbors.length; i++) {
      if (neighbors[i].length <= 2) low++;
    }
    return low;
  };

  const epsSteps = [baseEps, baseEps * 5, baseEps * 20];
  let best = buildMergedAdjacency(baseEps);
  let bestLow = best.neighbors.length ? countLowDegree(best.neighbors) / best.neighbors.length : 1;
  let lastEps = baseEps;
  for (let i = 1; i < epsSteps.length && bestLow > 0.4; i++) {
    const eps = Math.min(epsSteps[i], maxEps);
    if (eps <= lastEps) continue;
    const candidate = buildMergedAdjacency(eps);
    const low = candidate.neighbors.length ? countLowDegree(candidate.neighbors) / candidate.neighbors.length : 1;
    if (low < bestLow) {
      best = candidate;
      bestLow = low;
    }
    lastEps = eps;
  }

  return best;
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

export type DijkstraResult = {
  dist: Float64Array;
  prev: Int32Array;
};

export function dijkstraDistancesAndPrev(params: {
  seedIndex: number;
  neighbors: number[][];
  weights: number[][];
  maxDist?: number;
  allowed?: Uint8Array | boolean[] | null;
  targetIndex?: number;
}): DijkstraResult {
  const { seedIndex, neighbors, weights, maxDist = Number.POSITIVE_INFINITY, allowed, targetIndex } = params;
  const count = neighbors.length;
  const dist = new Float64Array(count);
  const prev = new Int32Array(count);
  dist.fill(Number.POSITIVE_INFINITY);
  prev.fill(-1);

  if (seedIndex < 0 || seedIndex >= count) return { dist, prev };
  if (allowed && !allowed[seedIndex]) return { dist, prev };

  dist[seedIndex] = 0;

  const heap = new MinHeap();
  heap.push({ node: seedIndex, dist: 0 });

  while (heap.size) {
    const current = heap.pop();
    if (!current) break;
    const { node, dist: d } = current;
    if (d > dist[node]) continue;
    if (d > maxDist) continue;
    if (targetIndex != null && node === targetIndex) break;

    const nbrs = neighbors[node];
    const ws = weights[node];
    for (let i = 0; i < nbrs.length; i++) {
      const next = nbrs[i];
      if (allowed && !allowed[next]) continue;
      const w = ws[i];
      if (!Number.isFinite(w)) continue;
      const nd = d + w;
      if (nd >= dist[next] || nd > maxDist) continue;
      dist[next] = nd;
      prev[next] = node;
      heap.push({ node: next, dist: nd });
    }
  }

  return { dist, prev };
}

export function reconstructPath(prev: Int32Array, start: number, end: number): number[] {
  if (start < 0 || end < 0 || start >= prev.length || end >= prev.length) return [];
  if (start === end) return [start];
  if (prev[end] === -1) return [];

  const path: number[] = [];
  let current = end;
  let guard = 0;
  while (current !== -1 && guard <= prev.length) {
    path.push(current);
    if (current === start) break;
    current = prev[current];
    guard++;
  }
  if (!path.length || path[path.length - 1] !== start) return [];
  return path.reverse();
}
