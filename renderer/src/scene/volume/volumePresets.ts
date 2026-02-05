import type { VolumeGrid } from "../datasets";

export type VolumePresetId =
  | "sphere"
  | "torus"
  | "gyroid"
  | "metaballs"
  | "noise"
  | "mandelbulb"
  | "custom";

export type VolumeParamDef = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
};

export type VolumePresetParams = Record<string, number>;

export type VolumePreset = {
  id: VolumePresetId;
  label: string;
  formula: string;
  note?: string;
  defaultDims: [number, number, number];
  params?: VolumeParamDef[];
  bounds?: { min: [number, number, number]; max: [number, number, number] };
  getBounds?: (params: VolumePresetParams) => { min: [number, number, number]; max: [number, number, number] };
  sample: (x: number, y: number, z: number, params: VolumePresetParams) => number;
};

type VolumePresetBuildOptions = {
  dims?: [number, number, number];
  params?: VolumePresetParams;
  customFn?: (x: number, y: number, z: number) => number;
};

const DEFAULT_DIMS: [number, number, number] = [64, 64, 64];
const DEFAULT_BOUNDS = { min: [-1.5, -1.5, -1.5] as [number, number, number], max: [1.5, 1.5, 1.5] as [number, number, number] };

const GYROID_SPAN = Math.PI;

const METABALLS = [
  { x: -0.6, y: 0.0, z: 0.0, w: 1.0 },
  { x: 0.6, y: 0.0, z: 0.0, w: 1.0 },
  { x: 0.0, y: 0.7, z: 0.4, w: 0.85 },
];

const clampValue = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fade = (t: number) => t * t * (3 - 2 * t);

const hash3 = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return h - Math.floor(h);
};

const valueNoise3 = (x: number, y: number, z: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const v000 = hash3(xi, yi, zi);
  const v100 = hash3(xi + 1, yi, zi);
  const v010 = hash3(xi, yi + 1, zi);
  const v110 = hash3(xi + 1, yi + 1, zi);
  const v001 = hash3(xi, yi, zi + 1);
  const v101 = hash3(xi + 1, yi, zi + 1);
  const v011 = hash3(xi, yi + 1, zi + 1);
  const v111 = hash3(xi + 1, yi + 1, zi + 1);

  const x00 = lerp(v000, v100, u);
  const x10 = lerp(v010, v110, u);
  const x01 = lerp(v001, v101, u);
  const x11 = lerp(v011, v111, u);

  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);

  return lerp(y0, y1, w);
};

const fbm3 = (x: number, y: number, z: number, octaves: number, lacunarity: number, gain: number) => {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq);
    freq *= lacunarity;
    amp *= gain;
  }
  return sum;
};

const mandelbulbDE = (x: number, y: number, z: number, power: number, iterations: number, bailout: number) => {
  let zx = x;
  let zy = y;
  let zz = z;
  let dr = 1;
  let r = 0;

  for (let i = 0; i < iterations; i++) {
    r = Math.sqrt(zx * zx + zy * zy + zz * zz);
    if (r > bailout) break;

    const theta = r === 0 ? 0 : Math.acos(zz / r);
    const phi = Math.atan2(zy, zx);
    const zr = Math.pow(r, power);

    dr = Math.pow(r, power - 1) * power * dr + 1;

    const sinT = Math.sin(theta * power);
    const cosT = Math.cos(theta * power);
    const cosP = Math.cos(phi * power);
    const sinP = Math.sin(phi * power);

    zx = zr * sinT * cosP + x;
    zy = zr * sinT * sinP + y;
    zz = zr * cosT + z;
  }

  if (r === 0) return 0;
  return 0.5 * Math.log(r) * r / dr;
};

export const VOLUME_PRESETS: VolumePreset[] = [
  {
    id: "sphere",
    label: "Sphere",
    formula: "F = x^2 + y^2 + z^2 - R^2",
    note: "Implicit sphere centered at the origin.",
    defaultDims: DEFAULT_DIMS,
    params: [{ id: "R", label: "Radius R", min: 0.3, max: 2.5, step: 0.05, defaultValue: 1.1 }],
    getBounds: (params) => {
      const r = params.R ?? 1.1;
      const span = r * 1.35;
      return { min: [-span, -span, -span], max: [span, span, span] };
    },
    sample: (x, y, z, params) => {
      const r = params.R ?? 1.1;
      return x * x + y * y + z * z - r * r;
    },
  },
  {
    id: "torus",
    label: "Torus",
    formula: "F = (x^2 + y^2 - R)^2 + z^2 - r^2",
    note: "Implicit torus centered at the origin.",
    defaultDims: DEFAULT_DIMS,
    params: [
      { id: "R", label: "Major R", min: 0.4, max: 2.0, step: 0.05, defaultValue: 1.0 },
      { id: "r", label: "Minor r", min: 0.1, max: 1.0, step: 0.05, defaultValue: 0.35 },
    ],
    getBounds: (params) => {
      const R = params.R ?? 1.0;
      const r = params.r ?? 0.35;
      const span = (R + r) * 1.2;
      return { min: [-span, -span, -r * 1.2], max: [span, span, r * 1.2] };
    },
    sample: (x, y, z, params) => {
      const R = params.R ?? 1.0;
      const r = params.r ?? 0.35;
      const q = x * x + y * y - R;
      return q * q + z * z - r * r;
    },
  },
  {
    id: "gyroid",
    label: "Gyroid (TPMS)",
    formula: "F = sin(kx) cos(ky) + sin(ky) cos(kz) + sin(kz) cos(kx) - t",
    note: "Triply periodic minimal surface over one period.",
    defaultDims: DEFAULT_DIMS,
    params: [
      { id: "k", label: "Frequency k", min: 0.5, max: 2.5, step: 0.05, defaultValue: 1.0 },
      { id: "t", label: "Iso offset t", min: -1, max: 1, step: 0.05, defaultValue: 0 },
    ],
    bounds: { min: [-GYROID_SPAN, -GYROID_SPAN, -GYROID_SPAN], max: [GYROID_SPAN, GYROID_SPAN, GYROID_SPAN] },
    sample: (x, y, z, params) => {
      const k = params.k ?? 1.0;
      const t = params.t ?? 0;
      return Math.sin(k * x) * Math.cos(k * y) + Math.sin(k * y) * Math.cos(k * z) + Math.sin(k * z) * Math.cos(k * x) - t;
    },
  },
  {
    id: "metaballs",
    label: "Metaballs",
    formula: "F = sum_i w_i exp(-k ||x - c_i||^2) - t",
    note: "Smooth blobs from a few Gaussian kernels.",
    defaultDims: DEFAULT_DIMS,
    params: [
      { id: "k", label: "Falloff k", min: 1.5, max: 8.0, step: 0.1, defaultValue: 4.2 },
      { id: "t", label: "Threshold t", min: 0.1, max: 1.2, step: 0.02, defaultValue: 0.7 },
    ],
    bounds: { min: [-1.6, -1.6, -1.6], max: [1.6, 1.6, 1.6] },
    sample: (x, y, z, params) => {
      const k = params.k ?? 4.2;
      const t = params.t ?? 0.7;
      let sum = 0;
      for (const b of METABALLS) {
        const dx = x - b.x;
        const dy = y - b.y;
        const dz = z - b.z;
        const r2 = dx * dx + dy * dy + dz * dz;
        sum += b.w * Math.exp(-k * r2);
      }
      return sum - t;
    },
  },
  {
    id: "noise",
    label: "Noise field",
    formula: "F = fbm(x, y, z) - t",
    note: "Value-noise fBm with adjustable frequency and threshold.",
    defaultDims: DEFAULT_DIMS,
    params: [
      { id: "freq", label: "Frequency", min: 0.5, max: 4.0, step: 0.1, defaultValue: 1.4 },
      { id: "t", label: "Threshold t", min: 0, max: 1, step: 0.02, defaultValue: 0.55 },
    ],
    bounds: DEFAULT_BOUNDS,
    sample: (x, y, z, params) => {
      const freq = params.freq ?? 1.4;
      const t = params.t ?? 0.55;
      const n = fbm3(x * freq, y * freq, z * freq, 4, 2.0, 0.5);
      return n - t;
    },
  },
  {
    id: "mandelbulb",
    label: "Mandelbulb (DE)",
    formula: "F = DE(x,y,z) - t",
    note: "Distance estimator for the Mandelbulb fractal.",
    defaultDims: DEFAULT_DIMS,
    params: [
      { id: "power", label: "Power", min: 2, max: 10, step: 1, defaultValue: 8 },
      { id: "iter", label: "Iterations", min: 2, max: 12, step: 1, defaultValue: 8 },
      { id: "bailout", label: "Bailout", min: 1.5, max: 4.0, step: 0.1, defaultValue: 2.5 },
      { id: "t", label: "Iso t", min: 0, max: 0.2, step: 0.01, defaultValue: 0.02 },
      { id: "span", label: "Bounds span", min: 1.0, max: 2.5, step: 0.05, defaultValue: 1.6 },
    ],
    getBounds: (params) => {
      const span = params.span ?? 1.6;
      return { min: [-span, -span, -span], max: [span, span, span] };
    },
    sample: (x, y, z, params) => {
      const power = params.power ?? 8;
      const iter = params.iter ?? 8;
      const bailout = params.bailout ?? 2.5;
      const t = params.t ?? 0.02;
      const de = mandelbulbDE(x, y, z, power, iter, bailout);
      return de - t;
    },
  },
  {
    id: "custom",
    label: "Custom F(x,y,z)",
    formula: "F = f(x, y, z)",
    note: "User-defined scalar field.",
    defaultDims: DEFAULT_DIMS,
    bounds: DEFAULT_BOUNDS,
    sample: (x, y, z, params) => {
      void params;
      return x * 0 + y * 0 + z * 0;
    },
  },
];

export function getVolumePreset(id: VolumePresetId | null | undefined): VolumePreset {
  const preset = VOLUME_PRESETS.find((p) => p.id === id);
  return preset ?? VOLUME_PRESETS[0];
}

export function resolveVolumePresetParams(preset: VolumePreset, input?: VolumePresetParams): VolumePresetParams {
  const params: VolumePresetParams = {};
  const defs = preset.params ?? [];
  for (const def of defs) {
    const raw = input?.[def.id] ?? def.defaultValue;
    params[def.id] = clampValue(raw, def.min, def.max, def.defaultValue);
  }
  return params;
}

export function getVolumePresetDefaultParams(id: VolumePresetId): VolumePresetParams {
  return resolveVolumePresetParams(getVolumePreset(id));
}

export function getVolumePresetBounds(preset: VolumePreset, params: VolumePresetParams) {
  if (preset.getBounds) return preset.getBounds(params);
  if (preset.bounds) return preset.bounds;
  return DEFAULT_BOUNDS;
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

  const params = resolveVolumePresetParams(preset, options.params);
  const { min, max } = getVolumePresetBounds(preset, params);
  const spacing: [number, number, number] = [
    nx > 1 ? (max[0] - min[0]) / (nx - 1) : 1,
    ny > 1 ? (max[1] - min[1]) / (ny - 1) : 1,
    nz > 1 ? (max[2] - min[2]) / (nz - 1) : 1,
  ];
  const origin: [number, number, number] = [min[0], min[1], min[2]];

  const sampler =
    presetId === "custom" && options.customFn
      ? (x: number, y: number, z: number) => options.customFn?.(x, y, z) ?? 0
      : (x: number, y: number, z: number) => preset.sample(x, y, z, params);

  let idx = 0;
  for (let z = 0; z < nz; z++) {
    const zPos = origin[2] + z * spacing[2];
    for (let y = 0; y < ny; y++) {
      const yPos = origin[1] + y * spacing[1];
      for (let x = 0; x < nx; x++) {
        const xPos = origin[0] + x * spacing[0];
        scalars[idx++] = sampler(xPos, yPos, zPos);
      }
    }
  }

  return { dims: [nx, ny, nz], scalars, spacing, origin };
}
