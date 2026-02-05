import type { VectorGrid } from "../datasets";

export type VectorPresetId = "vortex" | "source" | "sink" | "curl_noise";

export type VectorPreset = {
  id: VectorPresetId;
  label: string;
  note?: string;
  sample: (x: number, y: number, z: number) => [number, number, number];
};

type Bounds = { min: [number, number, number]; max: [number, number, number] };

const DEFAULT_BOUNDS: Bounds = {
  min: [-1.5, -1.5, -1.5],
  max: [1.5, 1.5, 1.5],
};

const clampDim = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(256, Math.round(value)));
};

const safeInv = (v: number, eps = 1e-6) => 1 / Math.max(eps, v);

const vortexSample = (x: number, y: number, z: number): [number, number, number] => {
  const r = Math.sqrt(x * x + y * y) + 1e-6;
  const inv = safeInv(r);
  const swirl = 0.9;
  const lift = 0.15 * Math.sin(z * 1.4);
  return [-y * inv * swirl, x * inv * swirl, lift];
};

const sourceSample = (x: number, y: number, z: number, sign = 1): [number, number, number] => {
  const r = Math.sqrt(x * x + y * y + z * z) + 1e-6;
  const inv = safeInv(r);
  const s = 0.85 * sign * inv;
  return [x * s, y * s, z * s];
};

const curlNoiseSample = (x: number, y: number, z: number): [number, number, number] => {
  const k = 1.2;
  const s1 = Math.sin(k * y) - Math.cos(k * z);
  const s2 = Math.sin(k * z) - Math.cos(k * x);
  const s3 = Math.sin(k * x) - Math.cos(k * y);
  return [s1, s2, s3];
};

export const VECTOR_PRESETS: VectorPreset[] = [
  {
    id: "vortex",
    label: "Vortex",
    note: "Swirl around the z-axis with a slight vertical lift.",
    sample: vortexSample,
  },
  {
    id: "source",
    label: "Source",
    note: "Radial outflow from the origin.",
    sample: (x, y, z) => sourceSample(x, y, z, 1),
  },
  {
    id: "sink",
    label: "Sink",
    note: "Radial inflow toward the origin.",
    sample: (x, y, z) => sourceSample(x, y, z, -1),
  },
  {
    id: "curl_noise",
    label: "Curl noise",
    note: "Periodic curl-like field (sin/cos mix).",
    sample: curlNoiseSample,
  },
];

export function getVectorPreset(id: VectorPresetId): VectorPreset {
  return VECTOR_PRESETS.find((p) => p.id === id) ?? VECTOR_PRESETS[0];
}

export function buildVectorGridFromPreset(
  presetId: VectorPresetId,
  options: { dims: [number, number, number]; bounds?: Bounds }
): VectorGrid {
  const preset = getVectorPreset(presetId);
  const baseDims = options.dims;
  const nx = clampDim(baseDims[0], 32);
  const ny = clampDim(baseDims[1], 32);
  const nz = clampDim(baseDims[2], 32);
  const total = nx * ny * nz;

  const { min, max } = options.bounds ?? DEFAULT_BOUNDS;
  const spacing: [number, number, number] = [
    nx > 1 ? (max[0] - min[0]) / (nx - 1) : 1,
    ny > 1 ? (max[1] - min[1]) / (ny - 1) : 1,
    nz > 1 ? (max[2] - min[2]) / (nz - 1) : 1,
  ];
  const origin: [number, number, number] = [min[0], min[1], min[2]];

  const vectors = new Float32Array(total * 3);
  let idx = 0;
  for (let z = 0; z < nz; z++) {
    const zPos = origin[2] + z * spacing[2];
    for (let y = 0; y < ny; y++) {
      const yPos = origin[1] + y * spacing[1];
      for (let x = 0; x < nx; x++) {
        const xPos = origin[0] + x * spacing[0];
        const [vx, vy, vz] = preset.sample(xPos, yPos, zPos);
        vectors[idx++] = Number.isFinite(vx) ? vx : 0;
        vectors[idx++] = Number.isFinite(vy) ? vy : 0;
        vectors[idx++] = Number.isFinite(vz) ? vz : 0;
      }
    }
  }

  return { dims: [nx, ny, nz], vectors, spacing, origin };
}
