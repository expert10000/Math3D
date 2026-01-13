export type RidgeValleyParams = {
  positions: Float32Array;
  k1: Float32Array;
  k2: Float32Array;
  d1: Float32Array;
  d2: Float32Array;
  neighbors: number[][];
  minCos: number;
  epsK: number;
  kMagMin: number;
  segmentLength: number;
  stride: number;
  maxSegments: number;
  skipUmbilic?: boolean;
  umbilicEps?: number;
  allowedMask?: Uint8Array | null;
};

export type RidgeValleyResult = {
  ridgeSegments: Float32Array;
  valleySegments: Float32Array;
  ridgeCount: number;
  valleyCount: number;
};

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

type NeighborPair = { jPlus: number; jMinus: number } | null;

function pickNeighborsAlongDirection(
  positions: Float32Array,
  neighbors: number[][],
  i: number,
  dx: number,
  dy: number,
  dz: number,
  minCos: number
): NeighborPair {
  const base = i * 3;
  const bx = positions[base];
  const by = positions[base + 1];
  const bz = positions[base + 2];
  const nbrs = neighbors[i];
  if (!nbrs || !nbrs.length) return null;

  let bestPlus = -1;
  let bestMinus = -1;
  let bestPlusScore = -Infinity;
  let bestMinusScore = Infinity;

  for (let k = 0; k < nbrs.length; k++) {
    const j = nbrs[k];
    if (j === i) continue;
    const idx = j * 3;
    const vx = positions[idx] - bx;
    const vy = positions[idx + 1] - by;
    const vz = positions[idx + 2] - bz;
    const v2 = vx * vx + vy * vy + vz * vz;
    if (v2 < 1e-14) continue;
    const invLen = 1 / Math.sqrt(v2);
    const ex = vx * invLen;
    const ey = vy * invLen;
    const ez = vz * invLen;
    const score = ex * dx + ey * dy + ez * dz;
    if (score > bestPlusScore) {
      bestPlusScore = score;
      bestPlus = j;
    }
    if (score < bestMinusScore) {
      bestMinusScore = score;
      bestMinus = j;
    }
  }

  if (bestPlus < 0 || bestMinus < 0) return null;
  if (bestPlusScore <= minCos) return null;
  if (-bestMinusScore <= minCos) return null;

  return { jPlus: bestPlus, jMinus: bestMinus };
}

function isFiniteDir(x: number, y: number, z: number) {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}

export function detectRidgeValleySegments(params: RidgeValleyParams): RidgeValleyResult {
  const {
    positions,
    k1,
    k2,
    d1,
    d2,
    neighbors,
    minCos,
    epsK,
    kMagMin,
    segmentLength,
    stride,
    maxSegments,
    skipUmbilic = false,
    umbilicEps = 1e-3,
    allowedMask = null,
  } = params;

  const ridgePositions: number[] = [];
  const valleyPositions: number[] = [];
  const vertexCount = Math.floor(positions.length / 3);
  const safeStride = Math.max(1, Math.floor(stride));
  const maxPerType = Math.max(0, Math.floor(maxSegments));
  const halfLen = segmentLength * 0.5;
  const useLen = Number.isFinite(halfLen) && halfLen > 0;

  for (let i = 0; i < vertexCount; i += safeStride) {
    if (allowedMask && !allowedMask[i]) continue;

    const k1i = k1[i];
    const k2i = k2[i];
    if (!Number.isFinite(k1i) || !Number.isFinite(k2i)) continue;
    if (skipUmbilic && Math.abs(k1i - k2i) < umbilicEps) continue;

    const i3 = i * 3;
    const px = positions[i3];
    const py = positions[i3 + 1];
    const pz = positions[i3 + 2];

    const d1x = d1[i3];
    const d1y = d1[i3 + 1];
    const d1z = d1[i3 + 2];
    const d2x = d2[i3];
    const d2y = d2[i3 + 1];
    const d2z = d2[i3 + 2];
    if (!isFiniteDir(d1x, d1y, d1z) || !isFiniteDir(d2x, d2y, d2z)) continue;

    if (useLen && ridgePositions.length / 6 < maxPerType && Math.abs(k1i) >= kMagMin) {
      const d1len = Math.hypot(d1x, d1y, d1z);
      if (d1len > 1e-10) {
        const inv = 1 / d1len;
        const dx = d1x * inv;
        const dy = d1y * inv;
        const dz = d1z * inv;
        const pair = pickNeighborsAlongDirection(positions, neighbors, i, dx, dy, dz, minCos);
        if (pair) {
          const k1p = k1[pair.jPlus];
          const k1m = k1[pair.jMinus];
          if (
            Number.isFinite(k1p) &&
            Number.isFinite(k1m) &&
            k1i >= k1p + epsK &&
            k1i >= k1m + epsK
          ) {
            ridgePositions.push(
              px - dx * halfLen,
              py - dy * halfLen,
              pz - dz * halfLen,
              px + dx * halfLen,
              py + dy * halfLen,
              pz + dz * halfLen
            );
          }
        }
      }
    }

    if (useLen && valleyPositions.length / 6 < maxPerType && Math.abs(k2i) >= kMagMin) {
      const d2len = Math.hypot(d2x, d2y, d2z);
      if (d2len > 1e-10) {
        const inv = 1 / d2len;
        const dx = d2x * inv;
        const dy = d2y * inv;
        const dz = d2z * inv;
        const pair = pickNeighborsAlongDirection(positions, neighbors, i, dx, dy, dz, minCos);
        if (pair) {
          const k2p = k2[pair.jPlus];
          const k2m = k2[pair.jMinus];
          if (
            Number.isFinite(k2p) &&
            Number.isFinite(k2m) &&
            k2i <= k2p - epsK &&
            k2i <= k2m - epsK
          ) {
            valleyPositions.push(
              px - dx * halfLen,
              py - dy * halfLen,
              pz - dz * halfLen,
              px + dx * halfLen,
              py + dy * halfLen,
              pz + dz * halfLen
            );
          }
        }
      }
    }
  }

  return {
    ridgeSegments: new Float32Array(ridgePositions),
    valleySegments: new Float32Array(valleyPositions),
    ridgeCount: ridgePositions.length / 6,
    valleyCount: valleyPositions.length / 6,
  };
}
