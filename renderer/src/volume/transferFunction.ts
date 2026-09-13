export type VolumeRenderMode = "slice" | "isosurface" | "mip" | "minip" | "average" | "dvr";
export type VolumeRenderQuality = "interactive" | "balanced" | "full";
export type VolumeTextureSampling = "nearest" | "linear";

export type VolumeColorPoint = { value: number; color: [number, number, number] };
export type VolumeOpacityPoint = { value: number; opacity: number };
export type VolumeTransferFunction = {
  version: 1;
  id: string;
  label: string;
  colorPoints: readonly VolumeColorPoint[];
  opacityPoints: readonly VolumeOpacityPoint[];
};

export type VolumeGpuCapabilities = {
  webgl2: boolean;
  max3dTextureSize: number;
  budgetBytes: number;
};

export type VolumeRenderPlan = {
  path: "gpu-3d-texture" | "gpu-bricked" | "cpu-2d-fallback" | "unsupported";
  dimensions: [number, number, number];
  textureBytes: number;
  brickDimensions: [number, number, number] | null;
  message: string;
};

export type VolumeDirectRenderStatus = {
  state: "idle" | "ready" | "fallback" | "unsupported" | "context-lost";
  plan: VolumeRenderPlan;
  mode: VolumeRenderMode;
  message: string;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const normalizeColorPoints = (points: readonly VolumeColorPoint[]): VolumeColorPoint[] => {
  const normalized = points.map((point) => ({ value: clamp01(point.value), color: point.color.map(clamp01) as [number, number, number] }))
    .sort((left, right) => left.value - right.value);
  if (!normalized.length) return [{ value: 0, color: [0, 0, 0] }, { value: 1, color: [1, 1, 1] }];
  if (normalized[0].value > 0) normalized.unshift({ value: 0, color: [...normalized[0].color] });
  if (normalized[normalized.length - 1].value < 1) normalized.push({ value: 1, color: [...normalized[normalized.length - 1].color] });
  return normalized;
};

const normalizeOpacityPoints = (points: readonly VolumeOpacityPoint[]): VolumeOpacityPoint[] => {
  const normalized = points.map((point) => ({ value: clamp01(point.value), opacity: clamp01(point.opacity) }))
    .sort((left, right) => left.value - right.value);
  if (!normalized.length) return [{ value: 0, opacity: 0 }, { value: 1, opacity: 1 }];
  if (normalized[0].value > 0) normalized.unshift({ value: 0, opacity: normalized[0].opacity });
  if (normalized[normalized.length - 1].value < 1) normalized.push({ value: 1, opacity: normalized[normalized.length - 1].opacity });
  return normalized;
};

export const normalizeVolumeTransferFunction = (transfer: VolumeTransferFunction): VolumeTransferFunction => ({
  version: 1,
  id: transfer.id.trim() || "custom",
  label: transfer.label.trim() || "Custom",
  colorPoints: normalizeColorPoints(transfer.colorPoints),
  opacityPoints: normalizeOpacityPoints(transfer.opacityPoints),
});

const interpolate = (left: number, right: number, amount: number): number => left + (right - left) * amount;

export const sampleVolumeTransferFunction = (transfer: VolumeTransferFunction, value: number): [number, number, number, number] => {
  const normalized = normalizeVolumeTransferFunction(transfer);
  const x = clamp01(value);
  const colorRight = normalized.colorPoints.findIndex((point) => point.value >= x);
  const c1 = normalized.colorPoints[Math.max(0, colorRight)];
  const c0 = normalized.colorPoints[Math.max(0, colorRight - 1)] ?? c1;
  const ct = c1.value > c0.value ? (x - c0.value) / (c1.value - c0.value) : 0;
  const opacityRight = normalized.opacityPoints.findIndex((point) => point.value >= x);
  const a1 = normalized.opacityPoints[Math.max(0, opacityRight)];
  const a0 = normalized.opacityPoints[Math.max(0, opacityRight - 1)] ?? a1;
  const at = a1.value > a0.value ? (x - a0.value) / (a1.value - a0.value) : 0;
  return [
    interpolate(c0.color[0], c1.color[0], ct),
    interpolate(c0.color[1], c1.color[1], ct),
    interpolate(c0.color[2], c1.color[2], ct),
    interpolate(a0.opacity, a1.opacity, at),
  ];
};

export const createVolumeTransferTextureData = (transfer: VolumeTransferFunction, width = 256): Uint8Array => {
  const size = Math.max(2, Math.min(4096, Math.round(width)));
  const output = new Uint8Array(size * 4);
  for (let index = 0; index < size; index += 1) {
    const sample = sampleVolumeTransferFunction(transfer, index / (size - 1));
    for (let channel = 0; channel < 4; channel += 1) output[index * 4 + channel] = Math.round(clamp01(sample[channel]) * 255);
  }
  return output;
};

export const VOLUME_TRANSFER_PRESETS: readonly VolumeTransferFunction[] = [
  { version: 1, id: "grayscale", label: "Grayscale", colorPoints: [{ value: 0, color: [0, 0, 0] }, { value: 1, color: [1, 1, 1] }], opacityPoints: [{ value: 0, opacity: 0 }, { value: 0.3, opacity: 0.05 }, { value: 1, opacity: 0.9 }] },
  { version: 1, id: "fire", label: "Fire", colorPoints: [{ value: 0, color: [0.02, 0.01, 0.08] }, { value: 0.35, color: [0.65, 0.02, 0.02] }, { value: 0.7, color: [1, 0.55, 0] }, { value: 1, color: [1, 1, 0.8] }], opacityPoints: [{ value: 0, opacity: 0 }, { value: 0.25, opacity: 0.03 }, { value: 0.65, opacity: 0.3 }, { value: 1, opacity: 0.95 }] },
  { version: 1, id: "cool-warm", label: "Cool to warm", colorPoints: [{ value: 0, color: [0.12, 0.3, 0.85] }, { value: 0.5, color: [0.92, 0.94, 0.98] }, { value: 1, color: [0.8, 0.08, 0.05] }], opacityPoints: [{ value: 0, opacity: 0.02 }, { value: 0.5, opacity: 0.08 }, { value: 1, opacity: 0.75 }] },
  { version: 1, id: "sdf", label: "Signed distance", colorPoints: [{ value: 0, color: [0.1, 0.35, 0.95] }, { value: 0.48, color: [0.3, 0.8, 1] }, { value: 0.5, color: [1, 1, 1] }, { value: 0.52, color: [1, 0.55, 0.25] }, { value: 1, color: [0.85, 0.08, 0.04] }], opacityPoints: [{ value: 0, opacity: 0 }, { value: 0.46, opacity: 0.03 }, { value: 0.5, opacity: 0.85 }, { value: 0.54, opacity: 0.03 }, { value: 1, opacity: 0 }] },
] as const;

export const getVolumeTransferPreset = (id: string): VolumeTransferFunction =>
  normalizeVolumeTransferFunction(VOLUME_TRANSFER_PRESETS.find((preset) => preset.id === id) ?? VOLUME_TRANSFER_PRESETS[0]);

export const serializeVolumeTransferFunction = (transfer: VolumeTransferFunction): string => JSON.stringify(normalizeVolumeTransferFunction(transfer));

export const restoreVolumeTransferFunction = (serialized: string): VolumeTransferFunction => {
  const value = JSON.parse(serialized) as Partial<VolumeTransferFunction>;
  if (value.version !== 1 || !Array.isArray(value.colorPoints) || !Array.isArray(value.opacityPoints)) throw new Error("Unsupported Volume transfer-function payload.");
  return normalizeVolumeTransferFunction(value as VolumeTransferFunction);
};

export const volumeRenderStepCount = (quality: VolumeRenderQuality): number => quality === "interactive" ? 80 : quality === "balanced" ? 180 : 360;

export const renderVolumeProjectionCpu = (args: {
  scalars: Float32Array;
  dimensions: readonly [number, number, number];
  mode: Extract<VolumeRenderMode, "mip" | "minip" | "average" | "dvr">;
  transferFunction: VolumeTransferFunction;
  window?: readonly [number, number];
}): { width: number; height: number; rgba: Uint8Array } => {
  const [nx, ny, nz] = args.dimensions;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of args.scalars) if (Number.isFinite(value)) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) { minimum = 0; maximum = 1; }
  const span = Math.max(1e-12, maximum - minimum);
  const low = Math.min(0.999999, clamp01(Math.min(args.window?.[0] ?? 0, args.window?.[1] ?? 1)));
  const high = Math.max(low + 1e-6, clamp01(Math.max(args.window?.[0] ?? 0, args.window?.[1] ?? 1)));
  const normalizedAt = (index: number) => clamp01(((args.scalars[index] - minimum) / span - low) / (high - low));
  const rgba = new Uint8Array(nx * ny * 4);
  for (let y = 0; y < ny; y += 1) for (let x = 0; x < nx; x += 1) {
    let projected = args.mode === "minip" ? 1 : 0;
    let accumulated: [number, number, number, number] = [0, 0, 0, 0];
    for (let z = 0; z < nz; z += 1) {
      const value = normalizedAt(x + nx * (y + ny * z));
      if (args.mode === "mip") projected = Math.max(projected, value);
      else if (args.mode === "minip") projected = Math.min(projected, value);
      else if (args.mode === "average") projected += value / Math.max(1, nz);
      else {
        const sample = sampleVolumeTransferFunction(args.transferFunction, value);
        const alpha = 1 - Math.pow(1 - sample[3], 180 / Math.max(1, nz));
        accumulated[0] += (1 - accumulated[3]) * alpha * sample[0];
        accumulated[1] += (1 - accumulated[3]) * alpha * sample[1];
        accumulated[2] += (1 - accumulated[3]) * alpha * sample[2];
        accumulated[3] += (1 - accumulated[3]) * alpha;
        if (accumulated[3] >= 0.985) break;
      }
    }
    const result = args.mode === "dvr" ? accumulated : sampleVolumeTransferFunction(args.transferFunction, projected);
    const output = (x + nx * (ny - y - 1)) * 4;
    for (let channel = 0; channel < 4; channel += 1) rgba[output + channel] = Math.round(clamp01(result[channel]) * 255);
  }
  return { width: nx, height: ny, rgba };
};

export const planVolumeRendering = (
  dimensions: readonly [number, number, number],
  capabilities: VolumeGpuCapabilities,
): VolumeRenderPlan => {
  const dims = [...dimensions] as [number, number, number];
  const textureBytes = dims[0] * dims[1] * dims[2];
  if (!capabilities.webgl2) return { path: "cpu-2d-fallback", dimensions: dims, textureBytes, brickDimensions: null, message: "WebGL2 3-D textures are unavailable; orthogonal CPU slices remain active." };
  if (dims.some((dimension) => dimension > capabilities.max3dTextureSize)) return { path: "unsupported", dimensions: dims, textureBytes, brickDimensions: null, message: `A dimension exceeds the GPU 3-D texture limit (${capabilities.max3dTextureSize}).` };
  if (textureBytes <= capabilities.budgetBytes) return { path: "gpu-3d-texture", dimensions: dims, textureBytes, brickDimensions: null, message: "Single 3-D texture fits the reviewed GPU budget." };
  const brickEdge = Math.max(16, Math.min(128, capabilities.max3dTextureSize));
  return { path: "gpu-bricked", dimensions: dims, textureBytes, brickDimensions: [brickEdge, brickEdge, brickEdge], message: "The full texture exceeds the reviewed GPU budget; bricked upload is required." };
};
