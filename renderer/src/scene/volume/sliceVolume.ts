import type { VolumeGrid } from "../datasets";
import type { Image2D, PolylineSet } from "../renderPrimitives";
import { marchingSquares } from "../../math/marchingSquares";

export type SliceAxis = "x" | "y" | "z";

export type SlicePlane = {
  center: [number, number, number];
  normal: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  width: number;
  height: number;
};

export type SliceInfo = {
  axis: SliceAxis;
  sliceIndex: number;
  width: number;
  height: number;
  plane: SlicePlane;
};

export type VolumeSliceStats = {
  min: number;
  max: number;
  mean: number;
  std: number;
  finiteCount: number;
  histogram: Uint32Array;
  histMin: number;
  histMax: number;
  p02: number;
  p98: number;
};

export type VolumeSliceData = {
  axis: SliceAxis;
  sliceIndex: number;
  width: number;
  height: number;
  values: Float32Array;
  stats: VolumeSliceStats;
  plane: SlicePlane;
};

export type VolumeSliceWindow = {
  low: number;
  high: number;
  mode: "auto" | "minmax";
};

export type VolumeSliceReport = VolumeSliceStats & {
  width: number;
  height: number;
  window: VolumeSliceWindow;
};

export type VolumeSliceHover = {
  world: [number, number, number];
  value: number;
  gradMag?: number;
};

type AxisMap = {
  axis: SliceAxis;
  axisIndex: number;
  widthIndex: number;
  heightIndex: number;
  widthAxis: [number, number, number];
  heightAxis: [number, number, number];
  normal: [number, number, number];
};

const axisMaps: Record<SliceAxis, AxisMap> = {
  x: {
    axis: "x",
    axisIndex: 0,
    widthIndex: 1,
    heightIndex: 2,
    widthAxis: [0, 1, 0],
    heightAxis: [0, 0, 1],
    normal: [1, 0, 0],
  },
  y: {
    axis: "y",
    axisIndex: 1,
    widthIndex: 0,
    heightIndex: 2,
    widthAxis: [1, 0, 0],
    heightAxis: [0, 0, 1],
    normal: [0, 1, 0],
  },
  z: {
    axis: "z",
    axisIndex: 2,
    widthIndex: 0,
    heightIndex: 1,
    widthAxis: [1, 0, 0],
    heightAxis: [0, 1, 0],
    normal: [0, 0, 1],
  },
};

const clampIndex = (value: number, max: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
};

export function getSliceInfo(grid: VolumeGrid, axis: SliceAxis, index: number): SliceInfo {
  const { dims } = grid;
  const spacing = grid.spacing ?? [1, 1, 1];
  const origin = grid.origin ?? [0, 0, 0];
  const map = axisMaps[axis];
  const [nx, ny, nz] = dims;
  const axisDims = [nx, ny, nz];
  const sliceIndex = clampIndex(index, Math.max(0, axisDims[map.axisIndex] - 1));

  const width = axisDims[map.widthIndex];
  const height = axisDims[map.heightIndex];

  const widthSpacing = spacing[map.widthIndex];
  const heightSpacing = spacing[map.heightIndex];
  const widthWorld = Math.max(0, (width - 1) * widthSpacing);
  const heightWorld = Math.max(0, (height - 1) * heightSpacing);

  const center: [number, number, number] = [
    origin[0] + (nx - 1) * spacing[0] * 0.5,
    origin[1] + (ny - 1) * spacing[1] * 0.5,
    origin[2] + (nz - 1) * spacing[2] * 0.5,
  ];
  center[map.axisIndex] = origin[map.axisIndex] + sliceIndex * spacing[map.axisIndex];

  return {
    axis,
    sliceIndex,
    width,
    height,
    plane: {
      center,
      normal: map.normal,
      u: map.widthAxis,
      v: map.heightAxis,
      width: widthWorld,
      height: heightWorld,
    },
  };
}

const HIST_BINS = 128;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function percentileFromHist(hist: Uint32Array, min: number, max: number, pct: number): number {
  const total = hist.reduce((sum, v) => sum + v, 0);
  if (!total || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return min;
  const target = Math.max(0, Math.min(1, pct)) * total;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) {
      const t = hist.length > 1 ? i / (hist.length - 1) : 0;
      return lerp(min, max, t);
    }
  }
  return max;
}

export function sliceVolumeData(grid: VolumeGrid, axis: SliceAxis, index: number): VolumeSliceData {
  const { dims, scalars } = grid;
  const [nx, ny, nz] = dims;
  const info = getSliceInfo(grid, axis, index);
  const { width, height, sliceIndex, plane } = info;
  const sliceCount = Math.max(0, width * height);
  const values = new Float32Array(sliceCount);

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sum2 = 0;
  let finiteCount = 0;

  if (sliceCount > 0 && scalars.length >= nx * ny * nz) {
    for (let h = 0; h < height; h++) {
      for (let w = 0; w < width; w++) {
        let x = sliceIndex;
        let y = w;
        let z = h;
        if (axis === "y") {
          x = w;
          y = sliceIndex;
          z = h;
        } else if (axis === "z") {
          x = w;
          y = h;
          z = sliceIndex;
        }
        const idx = x + nx * (y + ny * z);
        const val = scalars[idx] ?? 0;
        const offset = h * width + w;
        values[offset] = val;
        if (Number.isFinite(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
          sum += val;
          sum2 += val * val;
          finiteCount += 1;
        }
      }
    }
  }

  if (!finiteCount) {
    min = 0;
    max = 0;
  }

  const mean = finiteCount ? sum / finiteCount : 0;
  const variance = finiteCount ? Math.max(0, sum2 / finiteCount - mean * mean) : 0;
  const std = variance > 0 ? Math.sqrt(variance) : 0;

  const hist = new Uint32Array(HIST_BINS);
  if (finiteCount && max > min) {
    const inv = 1 / (max - min);
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (!Number.isFinite(val)) continue;
      const t = clamp01((val - min) * inv);
      const bin = Math.max(0, Math.min(HIST_BINS - 1, Math.floor(t * (HIST_BINS - 1))));
      hist[bin] += 1;
    }
  }

  const p02 = percentileFromHist(hist, min, max, 0.02);
  const p98 = percentileFromHist(hist, min, max, 0.98);

  return {
    axis,
    sliceIndex,
    width,
    height,
    values,
    stats: {
      min,
      max,
      mean,
      std,
      finiteCount,
      histogram: hist,
      histMin: min,
      histMax: max,
      p02,
      p98,
    },
    plane,
  };
}

export function buildSliceImage(data: VolumeSliceData, window?: { low: number; high: number }): Image2D {
  const { width, height, values, plane } = data;
  const sliceCount = Math.max(0, width * height);
  const out = new Uint8Array(sliceCount * 4);
  const low = window?.low ?? data.stats.min;
  const high = window?.high ?? data.stats.max;
  const range = high - low;
  const inv = range > 1e-8 ? 1 / range : 0;

  for (let i = 0; i < sliceCount; i++) {
    const val = values[i];
    const t = Number.isFinite(val) && inv ? clamp01((val - low) * inv) : 0;
    const g = Math.round(t * 255);
    const offset = i * 4;
    out[offset] = g;
    out[offset + 1] = g;
    out[offset + 2] = g;
    out[offset + 3] = 255;
  }

  return {
    width,
    height,
    format: "rgba8",
    data: out,
    worldPlane: plane,
  };
}

export function sliceVolumeCpu(
  grid: VolumeGrid,
  axis: SliceAxis,
  index: number,
  window?: { low: number; high: number }
): Image2D {
  const data = sliceVolumeData(grid, axis, index);
  return buildSliceImage(data, window);
}

export function sliceVolume(grid: VolumeGrid, axis: SliceAxis, index: number): Image2D {
  return sliceVolumeCpu(grid, axis, index);
}

export function volumeSliceContours(data: VolumeSliceData, isoValues: number[]): PolylineSet {
  if (!isoValues.length) return [];
  const { width, height, values, plane } = data;
  if (width < 2 || height < 2) return [];

  const xMin = -plane.width * 0.5;
  const xMax = plane.width * 0.5;
  const yMin = -plane.height * 0.5;
  const yMax = plane.height * 0.5;

  const u = plane.u;
  const v = plane.v;
  const c = plane.center;

  const polylines: PolylineSet = [];

  for (const iso of isoValues) {
    const lines = marchingSquares({
      nx: width,
      ny: height,
      xMin,
      xMax,
      yMin,
      yMax,
      level: iso,
      sample: (i, j) => values[j * width + i] ?? 0,
    });

    for (const line of lines) {
      if (line.length < 2) continue;
      const outLine = line.map((pt) => ({
        x: c[0] + u[0] * pt.x + v[0] * pt.y,
        y: c[1] + u[1] * pt.x + v[1] * pt.y,
        z: c[2] + u[2] * pt.x + v[2] * pt.y,
      }));
      if (outLine.length >= 2) polylines.push(outLine);
    }
  }

  return polylines;
}

function gridIndex(grid: VolumeGrid, ix: number, iy: number, iz: number): number {
  const [nx, ny, nz] = grid.dims;
  const x = Math.max(0, Math.min(nx - 1, ix));
  const y = Math.max(0, Math.min(ny - 1, iy));
  const z = Math.max(0, Math.min(nz - 1, iz));
  return x + nx * (y + ny * z);
}

export function worldToGridIndex(
  grid: VolumeGrid,
  world: [number, number, number]
): [number, number, number] {
  const spacing = grid.spacing ?? [1, 1, 1];
  const origin = grid.origin ?? [0, 0, 0];
  return [
    spacing[0] ? (world[0] - origin[0]) / spacing[0] : 0,
    spacing[1] ? (world[1] - origin[1]) / spacing[1] : 0,
    spacing[2] ? (world[2] - origin[2]) / spacing[2] : 0,
  ];
}

export function sampleGridTrilinear(grid: VolumeGrid, world: [number, number, number]): number {
  const [fx, fy, fz] = worldToGridIndex(grid, world);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;

  const scalars = grid.scalars;
  const c000 = scalars[gridIndex(grid, x0, y0, z0)] ?? 0;
  const c100 = scalars[gridIndex(grid, x1, y0, z0)] ?? 0;
  const c010 = scalars[gridIndex(grid, x0, y1, z0)] ?? 0;
  const c110 = scalars[gridIndex(grid, x1, y1, z0)] ?? 0;
  const c001 = scalars[gridIndex(grid, x0, y0, z1)] ?? 0;
  const c101 = scalars[gridIndex(grid, x1, y0, z1)] ?? 0;
  const c011 = scalars[gridIndex(grid, x0, y1, z1)] ?? 0;
  const c111 = scalars[gridIndex(grid, x1, y1, z1)] ?? 0;

  const c00 = lerp(c000, c100, tx);
  const c10 = lerp(c010, c110, tx);
  const c01 = lerp(c001, c101, tx);
  const c11 = lerp(c011, c111, tx);
  const c0 = lerp(c00, c10, ty);
  const c1 = lerp(c01, c11, ty);
  return lerp(c0, c1, tz);
}

export function gradientMagnitudeAt(grid: VolumeGrid, world: [number, number, number]): number {
  const spacing = grid.spacing ?? [1, 1, 1];
  const [fx, fy, fz] = worldToGridIndex(grid, world);
  const ix = clampIndex(fx, grid.dims[0] - 1);
  const iy = clampIndex(fy, grid.dims[1] - 1);
  const iz = clampIndex(fz, grid.dims[2] - 1);

  const xm = gridIndex(grid, ix - 1, iy, iz);
  const xp = gridIndex(grid, ix + 1, iy, iz);
  const ym = gridIndex(grid, ix, iy - 1, iz);
  const yp = gridIndex(grid, ix, iy + 1, iz);
  const zm = gridIndex(grid, ix, iy, iz - 1);
  const zp = gridIndex(grid, ix, iy, iz + 1);

  const scalars = grid.scalars;
  const fxm = scalars[xm] ?? 0;
  const fxp = scalars[xp] ?? 0;
  const fym = scalars[ym] ?? 0;
  const fyp = scalars[yp] ?? 0;
  const fzm = scalars[zm] ?? 0;
  const fzp = scalars[zp] ?? 0;

  const dx = spacing[0] || 1;
  const dy = spacing[1] || 1;
  const dz = spacing[2] || 1;

  const gx = (fxp - fxm) / (2 * dx);
  const gy = (fyp - fym) / (2 * dy);
  const gz = (fzp - fzm) / (2 * dz);

  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(gz)) return 0;
  return Math.sqrt(gx * gx + gy * gy + gz * gz);
}
