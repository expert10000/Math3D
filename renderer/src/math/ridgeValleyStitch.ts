export type RidgeValleyStitchParams = {
  featureMask: Uint8Array | boolean[];
  positions: Float32Array;
  normals?: Float32Array | null;
  dirField: Float32Array;
  neighbors: number[][];
  minCosLink?: number;
  confidence?: Float32Array | null;
  minConf?: number;
  maxChainLen?: number;
  maxCurves?: number;
  maxTotalPoints?: number;
  decimateEps?: number;
  smoothIterations?: number;
};

export type RidgeValleyStitchResult = {
  polylines: Float32Array[];
  totalPoints: number;
};

function isFiniteVec(x: number, y: number, z: number) {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}

function buildPointsFromIndices(indices: number[], positions: Float32Array): number[] {
  const out = new Array(indices.length * 3);
  let ptr = 0;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i] * 3;
    out[ptr++] = positions[idx];
    out[ptr++] = positions[idx + 1];
    out[ptr++] = positions[idx + 2];
  }
  return out;
}

function decimatePoints(points: number[], eps: number): number[] {
  if (!Number.isFinite(eps) || eps <= 0) return points;
  const n = Math.floor(points.length / 3);
  if (n <= 1) return points;
  const eps2 = eps * eps;
  const out: number[] = [];
  let lastX = points[0];
  let lastY = points[1];
  let lastZ = points[2];
  out.push(lastX, lastY, lastZ);
  for (let i = 1; i < n; i++) {
    const idx = i * 3;
    const x = points[idx];
    const y = points[idx + 1];
    const z = points[idx + 2];
    const dx = x - lastX;
    const dy = y - lastY;
    const dz = z - lastZ;
    if (dx * dx + dy * dy + dz * dz >= eps2) {
      out.push(x, y, z);
      lastX = x;
      lastY = y;
      lastZ = z;
    }
  }
  return out;
}

function smoothPoints(points: number[], iterations: number, closed: boolean): number[] {
  let src = points.slice();
  const n = Math.floor(src.length / 3);
  if (n < 3 || iterations <= 0) return src;
  for (let iter = 0; iter < iterations; iter++) {
    const dst = src.slice();
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      const i0 = (i - 1 + n) % n;
      const i1 = i;
      const i2 = (i + 1) % n;
      dst[i * 3] = (src[i0 * 3] + src[i1 * 3] + src[i2 * 3]) / 3;
      dst[i * 3 + 1] = (src[i0 * 3 + 1] + src[i1 * 3 + 1] + src[i2 * 3 + 1]) / 3;
      dst[i * 3 + 2] = (src[i0 * 3 + 2] + src[i1 * 3 + 2] + src[i2 * 3 + 2]) / 3;
    }
    src = dst;
  }
  return src;
}

function closePoints(points: number[]): number[] {
  const n = Math.floor(points.length / 3);
  if (n < 2) return points;
  const x0 = points[0];
  const y0 = points[1];
  const z0 = points[2];
  const xl = points[points.length - 3];
  const yl = points[points.length - 2];
  const zl = points[points.length - 1];
  if (x0 !== xl || y0 !== yl || z0 !== zl) {
    return [...points, x0, y0, z0];
  }
  return points;
}

export function stitchRidgeValleyCurves(params: RidgeValleyStitchParams): RidgeValleyStitchResult {
  const {
    featureMask,
    positions,
    normals = null,
    dirField,
    neighbors,
    confidence = null,
  } = params;
  const n = Math.floor(positions.length / 3);
  if (n <= 0) return { polylines: [], totalPoints: 0 };
  const minCosLink = Number.isFinite(params.minCosLink) ? (params.minCosLink as number) : 0.3;
  const minConf = Math.max(0, params.minConf ?? 0);
  const maxChainLen = Math.max(2, Math.floor(params.maxChainLen ?? 2000));
  const maxCurves = Math.max(0, Math.floor(params.maxCurves ?? 200));
  const maxTotalPoints = Math.max(0, Math.floor(params.maxTotalPoints ?? 200000));
  const decimateEps = Math.max(0, params.decimateEps ?? 0);
  const smoothIterations = Math.max(0, Math.floor(params.smoothIterations ?? 0));

  const hasNormals = normals && normals.length >= positions.length;
  const hasConf = confidence && confidence.length >= n;

  const eligible = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const isFeature = !!(featureMask as any)[i];
    if (!isFeature) continue;
    if (hasConf && (confidence as Float32Array)[i] < minConf) continue;
    eligible[i] = 1;
  }

  const plus = new Int32Array(n);
  const minus = new Int32Array(n);
  plus.fill(-1);
  minus.fill(-1);

  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    const i3 = i * 3;
    let dx = dirField[i3];
    let dy = dirField[i3 + 1];
    let dz = dirField[i3 + 2];
    if (!isFiniteVec(dx, dy, dz)) continue;

    if (hasNormals) {
      const nx = (normals as Float32Array)[i3];
      const ny = (normals as Float32Array)[i3 + 1];
      const nz = (normals as Float32Array)[i3 + 2];
      if (isFiniteVec(nx, ny, nz)) {
        const ndot = dx * nx + dy * ny + dz * nz;
        dx -= ndot * nx;
        dy -= ndot * ny;
        dz -= ndot * nz;
      }
    }

    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1e-12) continue;
    const invD = 1 / Math.sqrt(d2);
    dx *= invD;
    dy *= invD;
    dz *= invD;

    const nbrs = neighbors[i];
    if (!nbrs || !nbrs.length) continue;

    let bestPlus = -1;
    let bestMinus = -1;
    let bestPlusScore = minCosLink;
    let bestMinusScore = minCosLink;

    const bx = positions[i3];
    const by = positions[i3 + 1];
    const bz = positions[i3 + 2];

    for (let k = 0; k < nbrs.length; k++) {
      const j = nbrs[k];
      if (j === i) continue;
      if (!eligible[j]) continue;
      const j3 = j * 3;
      const vx = positions[j3] - bx;
      const vy = positions[j3 + 1] - by;
      const vz = positions[j3 + 2] - bz;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 < 1e-14) continue;
      const invV = 1 / Math.sqrt(v2);
      const ex = vx * invV;
      const ey = vy * invV;
      const ez = vz * invV;
      const score = ex * dx + ey * dy + ez * dz;
      if (score > bestPlusScore) {
        bestPlusScore = score;
        bestPlus = j;
      }
      const negScore = -score;
      if (negScore > bestMinusScore) {
        bestMinusScore = negScore;
        bestMinus = j;
      }
    }

    if (bestPlus >= 0) plus[i] = bestPlus;
    if (bestMinus >= 0) minus[i] = bestMinus;
  }

  const nextPlus = new Int32Array(n);
  const nextMinus = new Int32Array(n);
  nextPlus.fill(-1);
  nextMinus.fill(-1);

  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    const p = plus[i];
    if (p >= 0 && minus[p] === i) nextPlus[i] = p;
    const m = minus[i];
    if (m >= 0 && plus[m] === i) nextMinus[i] = m;
  }

  const degree = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    let d = 0;
    if (nextPlus[i] >= 0) d++;
    if (nextMinus[i] >= 0) d++;
    degree[i] = d;
  }

  const visited = new Uint8Array(n);
  const polylines: Float32Array[] = [];
  let totalPoints = 0;

  const addPolyline = (indices: number[], closed: boolean) => {
    if (indices.length < 2) return;
    if (polylines.length >= maxCurves) return;
    let pts = buildPointsFromIndices(indices, positions);
    pts = decimatePoints(pts, decimateEps);
    pts = smoothPoints(pts, smoothIterations, closed);
    if (closed) pts = closePoints(pts);
    const ptCount = Math.floor(pts.length / 3);
    if (ptCount < 2) return;
    if (totalPoints + ptCount > maxTotalPoints) return;
    polylines.push(new Float32Array(pts));
    totalPoints += ptCount;
    for (let i = 0; i < indices.length; i++) {
      visited[indices[i]] = 1;
    }
  };

  const walk = (start: number, dir: 1 | -1, limit: number) => {
    const out: number[] = [start];
    const local = new Set<number>([start]);
    let current = start;
    while (out.length < limit) {
      const next = dir === 1 ? nextPlus[current] : nextMinus[current];
      if (next < 0) break;
      if (visited[next]) break;
      if (local.has(next)) break;
      out.push(next);
      local.add(next);
      current = next;
    }
    return out;
  };

  const walkLoop = (start: number, limit: number) => {
    const out: number[] = [start];
    const local = new Set<number>([start]);
    let current = start;
    let closed = false;
    for (let step = 0; step < limit - 1; step++) {
      let next = nextPlus[current];
      if (next < 0) next = nextMinus[current];
      if (next < 0) break;
      if (next === start) {
        closed = true;
        break;
      }
      if (visited[next]) break;
      if (local.has(next)) break;
      out.push(next);
      local.add(next);
      current = next;
    }
    return { path: out, closed };
  };

  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    if (visited[i]) continue;
    if (degree[i] !== 1) continue;
    const back = walk(i, -1, maxChainLen);
    const fwd = walk(i, 1, maxChainLen);
    const chain = back.slice().reverse();
    chain.pop();
    chain.push(...fwd);
    if (chain.length > maxChainLen) {
      chain.length = maxChainLen;
    }
    addPolyline(chain, false);
    if (polylines.length >= maxCurves || totalPoints >= maxTotalPoints) break;
  }

  for (let i = 0; i < n; i++) {
    if (!eligible[i]) continue;
    if (visited[i]) continue;
    if (degree[i] !== 2) continue;
    const loop = walkLoop(i, maxChainLen);
    addPolyline(loop.path, loop.closed);
    if (polylines.length >= maxCurves || totalPoints >= maxTotalPoints) break;
  }

  return { polylines, totalPoints };
}
