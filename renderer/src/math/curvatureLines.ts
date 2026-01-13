export type TraceStreamlineParams = {
  seedIndex: number;
  positions: Float32Array;
  normals: Float32Array;
  dirField: Float32Array;
  neighbors: number[][];
  maxSteps: number;
  stepSize: number;
  minCos?: number;
  loopWindow?: number;
  maxStepScale?: number;
};

type TraceOneParams = TraceStreamlineParams & { dirSign: 1 | -1 };

function traceStreamlineOne(params: TraceOneParams): number[] {
  const {
    seedIndex,
    positions,
    normals,
    dirField,
    neighbors,
    maxSteps,
    stepSize,
    minCos = 0.2,
    loopWindow = 14,
    maxStepScale = 2.5,
    dirSign,
  } = params;

  const nVerts = positions.length / 3;
  if (seedIndex < 0 || seedIndex >= nVerts) return [];

  const path: number[] = [seedIndex];
  const recent: number[] = [seedIndex];
  const recentLimit = Math.max(3, loopWindow);
  const maxStep = stepSize > 0 ? stepSize * maxStepScale : Infinity;

  let current = seedIndex;
  for (let step = 0; step < maxSteps; step++) {
    const nIdx = current * 3;
    const nx = normals[nIdx];
    const ny = normals[nIdx + 1];
    const nz = normals[nIdx + 2];
    if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) break;

    let dx = dirField[nIdx];
    let dy = dirField[nIdx + 1];
    let dz = dirField[nIdx + 2];
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) break;

    const ndot = dx * nx + dy * ny + dz * nz;
    dx -= ndot * nx;
    dy -= ndot * ny;
    dz -= ndot * nz;

    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1e-12) break;
    const invLen = 1 / Math.sqrt(d2);
    dx *= invLen * dirSign;
    dy *= invLen * dirSign;
    dz *= invLen * dirSign;

    const nbrs = neighbors[current];
    if (!nbrs || !nbrs.length) break;

    let bestJ = -1;
    let bestDot = minCos;
    for (let k = 0; k < nbrs.length; k++) {
      const j = nbrs[k];
      if (j === current) continue;
      const jIdx = j * 3;
      const vx = positions[jIdx] - positions[nIdx];
      const vy = positions[jIdx + 1] - positions[nIdx + 1];
      const vz = positions[jIdx + 2] - positions[nIdx + 2];
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 < 1e-12) continue;
      const vLen = Math.sqrt(v2);
      if (vLen > maxStep) continue;
      const invV = 1 / vLen;
      const dot = (vx * invV) * dx + (vy * invV) * dy + (vz * invV) * dz;
      if (dot > bestDot) {
        bestDot = dot;
        bestJ = j;
      }
    }

    if (bestJ < 0) break;
    if (recent.includes(bestJ)) break;

    path.push(bestJ);
    recent.push(bestJ);
    if (recent.length > recentLimit) recent.shift();
    current = bestJ;
  }

  return path;
}

export function traceStreamlineBidirectional(params: TraceStreamlineParams): number[] {
  const back = traceStreamlineOne({ ...params, dirSign: -1 });
  const fwd = traceStreamlineOne({ ...params, dirSign: 1 });
  if (!back.length) return fwd;
  if (!fwd.length) return back;
  const backRev = back.slice().reverse();
  backRev.pop();
  return [...backRev, ...fwd];
}

export function buildVertexAdjacency(index: ArrayLike<number> | null, vertexCount: number): number[][] {
  const neighbors: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    if (a < 0 || b < 0 || a >= vertexCount || b >= vertexCount) return;
    neighbors[a].add(b);
    neighbors[b].add(a);
  };

  if (index && index.length >= 3) {
    for (let i = 0; i + 2 < index.length; i += 3) {
      const a = index[i];
      const b = index[i + 1];
      const c = index[i + 2];
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }
  } else {
    const triCount = Math.floor(vertexCount / 3);
    for (let t = 0; t < triCount; t++) {
      const a = t * 3;
      const b = t * 3 + 1;
      const c = t * 3 + 2;
      addEdge(a, b);
      addEdge(b, c);
      addEdge(c, a);
    }
  }

  return neighbors.map((set) => Array.from(set));
}

export function buildStreamlineSegments(paths: number[][], positions: Float32Array): Float32Array {
  let segmentCount = 0;
  for (const path of paths) {
    if (path.length >= 2) segmentCount += path.length - 1;
  }
  const out = new Float32Array(segmentCount * 6);
  let ptr = 0;
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i] * 3;
      const b = path[i + 1] * 3;
      out[ptr++] = positions[a];
      out[ptr++] = positions[a + 1];
      out[ptr++] = positions[a + 2];
      out[ptr++] = positions[b];
      out[ptr++] = positions[b + 1];
      out[ptr++] = positions[b + 2];
    }
  }
  return out;
}
