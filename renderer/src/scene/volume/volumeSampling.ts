import type { VolumeGrid } from "../datasets";
import { volumeGridIndexToWorld, volumeWorldToGridIndex } from "../../volume/spatial";

export type VolumeSampling = {
  center: [number, number, number];
  extents: [number, number, number];
  dims: [number, number, number];
};

export type VolumeSamplingCentering = "point" | "cell";
export type VolumeInterpolation = "nearest" | "linear" | "cubic";
export type VolumeBoundaryMode = "clamp" | "zero" | "mirror";
export type VolumeSamplingScalarType = "float32" | "float64" | "int32" | "uint32" | "int16" | "uint16" | "int8" | "uint8";
export type VolumeAllocationWarning = "safe" | "caution" | "blocked";

export const VOLUME_SAMPLING_LIMITS = {
  minDimension: 1,
  maxDimension: 256,
  softCpuBytes: 128 * 1024 * 1024,
  hardCpuBytes: 512 * 1024 * 1024,
  softGpuBytes: 256 * 1024 * 1024,
  hardGpuBytes: 512 * 1024 * 1024,
} as const;

export type VolumeAllocationPlan = {
  dims: [number, number, number];
  sampleCount: number;
  elementCount: number;
  scalarType: VolumeSamplingScalarType;
  components: number;
  cpuBytes: number;
  gpuBytes: number;
  backend: "renderer-cpu" | "shared-worker";
  warning: VolumeAllocationWarning;
  message: string;
};

export type VolumeNonFiniteReport = {
  finiteCount: number;
  nonFiniteCount: number;
  nonFiniteIndexBounds: { min: [number, number, number]; max: [number, number, number] } | null;
};

type Bounds = { min: [number, number, number]; max: [number, number, number] };

export const clampVolumeDimension = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(VOLUME_SAMPLING_LIMITS.minDimension, Math.min(VOLUME_SAMPLING_LIMITS.maxDimension, Math.round(value)));
};

const clampExtent = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1e-6, Math.abs(value));
};

export function samplingFromBounds(bounds: Bounds, dims: [number, number, number]): VolumeSampling {
  const center: [number, number, number] = [
    0.5 * (bounds.min[0] + bounds.max[0]),
    0.5 * (bounds.min[1] + bounds.max[1]),
    0.5 * (bounds.min[2] + bounds.max[2]),
  ];
  const extents: [number, number, number] = [
    0.5 * Math.abs(bounds.max[0] - bounds.min[0]),
    0.5 * Math.abs(bounds.max[1] - bounds.min[1]),
    0.5 * Math.abs(bounds.max[2] - bounds.min[2]),
  ];
  return {
    center,
    extents,
    dims: [
      clampVolumeDimension(dims[0], dims[0]),
      clampVolumeDimension(dims[1], dims[1]),
      clampVolumeDimension(dims[2], dims[2]),
    ],
  };
}

export function samplingToBounds(sampling: VolumeSampling): Bounds {
  const c = sampling.center;
  const e = sampling.extents;
  return {
    min: [c[0] - e[0], c[1] - e[1], c[2] - e[2]],
    max: [c[0] + e[0], c[1] + e[1], c[2] + e[2]],
  };
}

export function samplingSpacing(sampling: VolumeSampling, centering: VolumeSamplingCentering = "point"): [number, number, number] {
  const dims = sampling.dims;
  const span: [number, number, number] = [sampling.extents[0] * 2, sampling.extents[1] * 2, sampling.extents[2] * 2];
  return [
    dims[0] > (centering === "point" ? 1 : 0) ? span[0] / Math.max(1, dims[0] - (centering === "point" ? 1 : 0)) : span[0],
    dims[1] > (centering === "point" ? 1 : 0) ? span[1] / Math.max(1, dims[1] - (centering === "point" ? 1 : 0)) : span[1],
    dims[2] > (centering === "point" ? 1 : 0) ? span[2] / Math.max(1, dims[2] - (centering === "point" ? 1 : 0)) : span[2],
  ];
}

export function clampSampling(sampling: VolumeSampling): VolumeSampling {
  return {
    center: sampling.center,
    extents: [
      clampExtent(sampling.extents[0], 1),
      clampExtent(sampling.extents[1], 1),
      clampExtent(sampling.extents[2], 1),
    ],
    dims: [
      clampVolumeDimension(sampling.dims[0], sampling.dims[0]),
      clampVolumeDimension(sampling.dims[1], sampling.dims[1]),
      clampVolumeDimension(sampling.dims[2], sampling.dims[2]),
    ],
  };
}

const bytesPerScalar: Record<VolumeSamplingScalarType, number> = {
  float64: 8,
  float32: 4,
  int32: 4,
  uint32: 4,
  int16: 2,
  uint16: 2,
  int8: 1,
  uint8: 1,
};

export function planVolumeAllocation(args: {
  dims: [number, number, number];
  scalarType?: VolumeSamplingScalarType;
  components?: number;
}): VolumeAllocationPlan {
  const dims = args.dims.map((value) => clampVolumeDimension(value, 1)) as [number, number, number];
  const scalarType = args.scalarType ?? "float32";
  const components = Math.max(1, Math.min(16, Math.round(args.components ?? 1)));
  const sampleCount = dims[0] * dims[1] * dims[2];
  const elementCount = sampleCount * components;
  const cpuBytes = elementCount * bytesPerScalar[scalarType];
  const gpuBytes = elementCount * Math.min(4, bytesPerScalar[scalarType]);
  const blocked = cpuBytes > VOLUME_SAMPLING_LIMITS.hardCpuBytes || gpuBytes > VOLUME_SAMPLING_LIMITS.hardGpuBytes;
  const caution = cpuBytes > VOLUME_SAMPLING_LIMITS.softCpuBytes || gpuBytes > VOLUME_SAMPLING_LIMITS.softGpuBytes;
  const warning: VolumeAllocationWarning = blocked ? "blocked" : caution ? "caution" : "safe";
  return {
    dims,
    sampleCount,
    elementCount,
    scalarType,
    components,
    cpuBytes,
    gpuBytes,
    backend: sampleCount >= 128 * 128 * 128 ? "shared-worker" : "renderer-cpu",
    warning,
    message: blocked
      ? "Allocation exceeds the hard Volume memory policy."
      : caution
        ? "Large allocation: review memory estimates before applying."
        : "Allocation is within the interactive memory policy.",
  };
}

export function dimensionsForSpacing(
  sampling: VolumeSampling,
  spacing: [number, number, number],
  centering: VolumeSamplingCentering
): [number, number, number] {
  return spacing.map((value, axis) => {
    const safeSpacing = Number.isFinite(value) && value > 0 ? value : samplingSpacing(sampling, centering)[axis];
    const span = sampling.extents[axis] * 2;
    return clampVolumeDimension(Math.round(span / safeSpacing) + (centering === "point" ? 1 : 0), sampling.dims[axis]);
  }) as [number, number, number];
}

export function lockSamplingToIsotropicSpacing(
  sampling: VolumeSampling,
  referenceAxis: 0 | 1 | 2,
  centering: VolumeSamplingCentering
): VolumeSampling {
  const target = samplingSpacing(sampling, centering)[referenceAxis];
  return { ...sampling, dims: dimensionsForSpacing(sampling, [target, target, target], centering) };
}

export function reportVolumeNonFinite(
  scalars: ArrayLike<number>,
  dims: [number, number, number]
): VolumeNonFiniteReport {
  let finiteCount = 0;
  let nonFiniteCount = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const expected = dims[0] * dims[1] * dims[2];
  for (let offset = 0; offset < Math.min(expected, scalars.length); offset += 1) {
    if (Number.isFinite(scalars[offset])) {
      finiteCount += 1;
      continue;
    }
    nonFiniteCount += 1;
    const i = offset % dims[0];
    const j = Math.floor(offset / dims[0]) % dims[1];
    const k = Math.floor(offset / (dims[0] * dims[1]));
    min[0] = Math.min(min[0], i); min[1] = Math.min(min[1], j); min[2] = Math.min(min[2], k);
    max[0] = Math.max(max[0], i); max[1] = Math.max(max[1], j); max[2] = Math.max(max[2], k);
  }
  if (scalars.length < expected) {
    for (let offset = Math.max(0, scalars.length); offset < expected; offset += 1) {
      nonFiniteCount += 1;
      const i = offset % dims[0];
      const j = Math.floor(offset / dims[0]) % dims[1];
      const k = Math.floor(offset / (dims[0] * dims[1]));
      min[0] = Math.min(min[0], i); min[1] = Math.min(min[1], j); min[2] = Math.min(min[2], k);
      max[0] = Math.max(max[0], i); max[1] = Math.max(max[1], j); max[2] = Math.max(max[2], k);
    }
  }
  return {
    finiteCount,
    nonFiniteCount,
    nonFiniteIndexBounds: nonFiniteCount ? { min, max } : null,
  };
}

const mirrorIndex = (value: number, max: number): number => {
  if (max <= 0) return 0;
  const period = max * 2;
  const wrapped = ((value % period) + period) % period;
  return wrapped <= max ? wrapped : period - wrapped;
};

const resolveIndex = (value: number, max: number, boundary: VolumeBoundaryMode): number | null => {
  if (boundary === "zero" && (value < 0 || value > max)) return null;
  if (boundary === "mirror") return Math.round(mirrorIndex(value, max));
  return Math.max(0, Math.min(max, Math.round(value)));
};

const gridValue = (grid: VolumeGrid, i: number, j: number, k: number, boundary: VolumeBoundaryMode): number => {
  const x = resolveIndex(i, grid.dims[0] - 1, boundary);
  const y = resolveIndex(j, grid.dims[1] - 1, boundary);
  const z = resolveIndex(k, grid.dims[2] - 1, boundary);
  if (x == null || y == null || z == null) return 0;
  return grid.scalars[x + grid.dims[0] * (y + grid.dims[1] * z)] ?? 0;
};

const cubic = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
  const c = -0.5 * p0 + 0.5 * p2;
  return ((a * t + b) * t + c) * t + p1;
};

export function sampleVolumeGridAtIndex(
  grid: VolumeGrid,
  index: [number, number, number],
  interpolation: VolumeInterpolation,
  boundary: VolumeBoundaryMode
): number {
  if (interpolation === "nearest") return gridValue(grid, Math.round(index[0]), Math.round(index[1]), Math.round(index[2]), boundary);
  const base = index.map(Math.floor) as [number, number, number];
  const fraction = [index[0] - base[0], index[1] - base[1], index[2] - base[2]] as [number, number, number];
  if (interpolation === "linear") {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const zValues: number[] = [];
    for (let z = 0; z < 2; z += 1) {
      const yValues: number[] = [];
      for (let y = 0; y < 2; y += 1) {
        yValues.push(lerp(
          gridValue(grid, base[0], base[1] + y, base[2] + z, boundary),
          gridValue(grid, base[0] + 1, base[1] + y, base[2] + z, boundary),
          fraction[0]
        ));
      }
      zValues.push(lerp(yValues[0], yValues[1], fraction[1]));
    }
    return lerp(zValues[0], zValues[1], fraction[2]);
  }
  const zValues: number[] = [];
  for (let z = -1; z <= 2; z += 1) {
    const yValues: number[] = [];
    for (let y = -1; y <= 2; y += 1) {
      const xValues = [-1, 0, 1, 2].map((x) => gridValue(grid, base[0] + x, base[1] + y, base[2] + z, boundary));
      yValues.push(cubic(xValues[0], xValues[1], xValues[2], xValues[3], fraction[0]));
    }
    zValues.push(cubic(yValues[0], yValues[1], yValues[2], yValues[3], fraction[1]));
  }
  return cubic(zValues[0], zValues[1], zValues[2], zValues[3], fraction[2]);
}

export function resampleVolumeGrid(
  source: VolumeGrid,
  sampling: VolumeSampling,
  options: {
    centering: VolumeSamplingCentering;
    interpolation: VolumeInterpolation;
    boundary: VolumeBoundaryMode;
  }
): VolumeGrid {
  const target = clampSampling(sampling);
  const bounds = samplingToBounds(target);
  const spacing = samplingSpacing(target, options.centering);
  const origin: [number, number, number] = options.centering === "cell"
    ? [bounds.min[0] + spacing[0] * 0.5, bounds.min[1] + spacing[1] * 0.5, bounds.min[2] + spacing[2] * 0.5]
    : [...bounds.min];
  const scalars = new Float32Array(target.dims[0] * target.dims[1] * target.dims[2]);
  const targetGrid: VolumeGrid = { dims: [...target.dims], scalars, origin, spacing, centering: options.centering };
  let offset = 0;
  for (let k = 0; k < target.dims[2]; k += 1) {
    for (let j = 0; j < target.dims[1]; j += 1) {
      for (let i = 0; i < target.dims[0]; i += 1) {
        const world = volumeGridIndexToWorld(targetGrid, [i, j, k]);
        const sourceIndex = volumeWorldToGridIndex(source, world);
        scalars[offset++] = sampleVolumeGridAtIndex(source, sourceIndex, options.interpolation, options.boundary);
      }
    }
  }
  return targetGrid;
}
