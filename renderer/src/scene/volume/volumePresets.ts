import type { VolumeGrid } from "../datasets";

export type VolumePresetId = "sphere" | "torus" | "gyroid" | "metaballs";

export type VolumePreset = {
  id: VolumePresetId;
  label: string;
  formula: string;
  note?: string;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  defaultDims: [number, number, number];
  sample: (x: number, y: number, z: number) => number;
};

type VolumePresetBuildOptions = {
  dims?: [number, number, number];
};

const DEFAULT_DIMS: [number, number, number] = [64, 64, 64];

const SPHERE_R = 1.1;
const TORUS_R = 1.0;
const TORUS_r = 0.35;
const GYROID_SPAN = Math.PI;

const METABALLS = [
  { x: -0.6, y: 0.0, z: 0.0, w: 1.0 },
  { x: 0.6, y: 0.0, z: 0.0, w: 1.0 },
  { x: 0.0, y: 0.7, z: 0.4, w: 0.85 },
];

export const VOLUME_PRESETS: VolumePreset[] = [
  {
    id: "sphere",
    label: "Sphere",
    formula: `F = x^2 + y^2 + z^2 - R^2  (R=${SPHERE_R})`,
    note: "Implicit sphere centered at the origin.",
    bounds: { min: [-1.6, -1.6, -1.6], max: [1.6, 1.6, 1.6] },
    defaultDims: DEFAULT_DIMS,
    sample: (x, y, z) => x * x + y * y + z * z - SPHERE_R * SPHERE_R,
  },
  {
    id: "torus",
    label: "Torus",
    formula: `F = (x^2 + y^2 - R)^2 + z^2 - r^2  (R=${TORUS_R}, r=${TORUS_r})`,
    note: "Implicit torus centered at the origin.",
    bounds: { min: [-1.7, -1.7, -1.0], max: [1.7, 1.7, 1.0] },
    defaultDims: DEFAULT_DIMS,
    sample: (x, y, z) => {
      const q = x * x + y * y - TORUS_R;
      return q * q + z * z - TORUS_r * TORUS_r;
    },
  },
  {
    id: "gyroid",
    label: "Gyroid (TPMS)",
    formula: "F = sin x cos y + sin y cos z + sin z cos x",
    note: "Triply periodic minimal surface over one period.",
    bounds: { min: [-GYROID_SPAN, -GYROID_SPAN, -GYROID_SPAN], max: [GYROID_SPAN, GYROID_SPAN, GYROID_SPAN] },
    defaultDims: DEFAULT_DIMS,
    sample: (x, y, z) => Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x),
  },
  {
    id: "metaballs",
    label: "Metaballs",
    formula: "F = sum_i w_i exp(-k ||x - c_i||^2) - t",
    note: "Smooth blobs from a few Gaussian kernels.",
    bounds: { min: [-1.6, -1.6, -1.6], max: [1.6, 1.6, 1.6] },
    defaultDims: DEFAULT_DIMS,
    sample: (x, y, z) => {
      let sum = 0;
      for (const b of METABALLS) {
        const dx = x - b.x;
        const dy = y - b.y;
        const dz = z - b.z;
        const r2 = dx * dx + dy * dy + dz * dz;
        sum += b.w * Math.exp(-4.2 * r2);
      }
      return sum - 0.7;
    },
  },
];

export function getVolumePreset(id: VolumePresetId | null | undefined): VolumePreset {
  const preset = VOLUME_PRESETS.find((p) => p.id === id);
  return preset ?? VOLUME_PRESETS[0];
}

const clampDim = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(256, Math.round(value)));
};

export function buildVolumeGridFromPreset(
  presetId: VolumePresetId,
  options: VolumePresetBuildOptions = {}
): VolumeGrid {
  const preset = getVolumePreset(presetId);
  const baseDims = preset.defaultDims ?? DEFAULT_DIMS;
  const dims = options.dims ?? baseDims;
  const nx = clampDim(dims[0], baseDims[0]);
  const ny = clampDim(dims[1], baseDims[1]);
  const nz = clampDim(dims[2], baseDims[2]);
  const total = nx * ny * nz;
  const scalars = new Float32Array(total);

  const { min, max } = preset.bounds;
  const spacing: [number, number, number] = [
    nx > 1 ? (max[0] - min[0]) / (nx - 1) : 1,
    ny > 1 ? (max[1] - min[1]) / (ny - 1) : 1,
    nz > 1 ? (max[2] - min[2]) / (nz - 1) : 1,
  ];
  const origin: [number, number, number] = [min[0], min[1], min[2]];

  let idx = 0;
  for (let z = 0; z < nz; z++) {
    const zPos = origin[2] + z * spacing[2];
    for (let y = 0; y < ny; y++) {
      const yPos = origin[1] + y * spacing[1];
      for (let x = 0; x < nx; x++) {
        const xPos = origin[0] + x * spacing[0];
        scalars[idx++] = preset.sample(xPos, yPos, zPos);
      }
    }
  }

  return { dims: [nx, ny, nz], scalars, spacing, origin };
}
