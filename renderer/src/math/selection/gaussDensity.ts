export type GaussDensityGrid = {
  nTheta: number;
  nPhi: number;
  values: Float32Array;
  maxCount: number;
  total: number;
};

export type GaussDensityOptions = {
  nTheta: number;
  nPhi: number;
  smooth?: boolean;
  indices?: number[];
  maxSamples?: number;
  sampleStride?: number;
};

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

const normalizePhi = (phi: number) => {
  const twoPi = Math.PI * 2;
  let out = phi;
  if (out < 0) out += twoPi;
  if (out >= twoPi) out -= twoPi;
  return out;
};

const smoothCounts = (counts: Float32Array, nTheta: number, nPhi: number) => {
  const next = new Float32Array(counts.length);
  for (let t = 0; t < nTheta; t++) {
    for (let p = 0; p < nPhi; p++) {
      let sum = 0;
      let hits = 0;
      for (let dt = -1; dt <= 1; dt++) {
        const tt = clamp(t + dt, 0, nTheta - 1);
        for (let dp = -1; dp <= 1; dp++) {
          const pp = (p + dp + nPhi) % nPhi;
          sum += counts[tt * nPhi + pp];
          hits++;
        }
      }
      next[t * nPhi + p] = hits > 0 ? sum / hits : 0;
    }
  }
  return next;
};

export function computeGaussDensityGrid(
  normals: Float32Array,
  options: GaussDensityOptions
): GaussDensityGrid {
  const nTheta = Math.max(1, Math.floor(options.nTheta));
  const nPhi = Math.max(1, Math.floor(options.nPhi));
  const counts = new Float32Array(nTheta * nPhi);
  const normalCount = Math.floor(normals.length / 3);
  const indices = options.indices;
  const maxSamples = options.maxSamples ?? 0;

  let total = 0;

  if (indices && indices.length) {
    const step = maxSamples > 0 ? Math.max(1, Math.ceil(indices.length / maxSamples)) : 1;
    for (let i = 0; i < indices.length; i += step) {
      const idx = indices[i];
      const base = idx * 3;
      if (base + 2 >= normals.length) continue;
      const nx = normals[base];
      const ny = normals[base + 1];
      const nz = normals[base + 2];
      const len = Math.hypot(nx, ny, nz);
      if (!Number.isFinite(len) || len <= 1e-8) continue;
      const inv = 1 / len;
      const nnx = nx * inv;
      const nny = ny * inv;
      const nnz = nz * inv;
      const theta = Math.acos(clamp(nnz, -1, 1));
      const phi = normalizePhi(Math.atan2(nny, nnx));
      const tBin = Math.min(nTheta - 1, Math.floor((theta / Math.PI) * nTheta));
      const pBin = Math.min(nPhi - 1, Math.floor((phi / (Math.PI * 2)) * nPhi));
      counts[tBin * nPhi + pBin] += 1;
      total++;
    }
  } else {
    let stride = Math.max(1, Math.floor(options.sampleStride ?? 1));
    if (maxSamples > 0 && normalCount / stride > maxSamples) {
      stride = Math.max(1, Math.ceil(normalCount / maxSamples));
    }
    for (let i = 0; i < normalCount; i += stride) {
      const base = i * 3;
      const nx = normals[base];
      const ny = normals[base + 1];
      const nz = normals[base + 2];
      const len = Math.hypot(nx, ny, nz);
      if (!Number.isFinite(len) || len <= 1e-8) continue;
      const inv = 1 / len;
      const nnx = nx * inv;
      const nny = ny * inv;
      const nnz = nz * inv;
      const theta = Math.acos(clamp(nnz, -1, 1));
      const phi = normalizePhi(Math.atan2(nny, nnx));
      const tBin = Math.min(nTheta - 1, Math.floor((theta / Math.PI) * nTheta));
      const pBin = Math.min(nPhi - 1, Math.floor((phi / (Math.PI * 2)) * nPhi));
      counts[tBin * nPhi + pBin] += 1;
      total++;
    }
  }

  const blurred = options.smooth ? smoothCounts(counts, nTheta, nPhi) : counts;

  let maxCount = 0;
  for (let i = 0; i < blurred.length; i++) {
    if (blurred[i] > maxCount) maxCount = blurred[i];
  }

  const values = new Float32Array(blurred.length);
  if (maxCount > 0) {
    const inv = 1 / maxCount;
    for (let i = 0; i < blurred.length; i++) {
      values[i] = blurred[i] * inv;
    }
  }

  return {
    nTheta,
    nPhi,
    values,
    maxCount,
    total,
  };
}
