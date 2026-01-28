import type { VolumeGrid } from "../datasets";
import type { Image2D } from "../renderPrimitives";

export type SliceAxis = "x" | "y" | "z";

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

export function sliceVolume(grid: VolumeGrid, axis: SliceAxis, index: number): Image2D {
  const { dims, scalars } = grid;
  const [nx, ny, nz] = dims;
  const spacing = grid.spacing ?? [1, 1, 1];
  const origin = grid.origin ?? [0, 0, 0];
  const map = axisMaps[axis];
  const axisDims = [nx, ny, nz];
  const sliceIndex = clampIndex(index, Math.max(0, axisDims[map.axisIndex] - 1));

  const width = axisDims[map.widthIndex];
  const height = axisDims[map.heightIndex];
  const sliceCount = Math.max(0, width * height);
  const data = new Uint8ClampedArray(sliceCount * 4);

  let min = Infinity;
  let max = -Infinity;

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
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
  }

  const range = max - min;
  const inv = range > 1e-8 ? 1 / range : 0;

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
      const t = inv ? Math.max(0, Math.min(1, (val - min) * inv)) : 0;
      const g = Math.round(t * 255);
      const offset = (h * width + w) * 4;
      data[offset] = g;
      data[offset + 1] = g;
      data[offset + 2] = g;
      data[offset + 3] = 255;
    }
  }

  const widthSpacing = spacing[map.widthIndex];
  const heightSpacing = spacing[map.heightIndex];
  const widthWorld = Math.max(0, (width - 1) * widthSpacing);
  const heightWorld = Math.max(0, (height - 1) * heightSpacing);

  const center = [
    origin[0] + (nx - 1) * spacing[0] * 0.5,
    origin[1] + (ny - 1) * spacing[1] * 0.5,
    origin[2] + (nz - 1) * spacing[2] * 0.5,
  ] as [number, number, number];
  center[map.axisIndex] = origin[map.axisIndex] + sliceIndex * spacing[map.axisIndex];

  return {
    width,
    height,
    format: "rgba8",
    data,
    worldPlane: {
      center,
      normal: map.normal,
      u: map.widthAxis,
      v: map.heightAxis,
      width: widthWorld,
      height: heightWorld,
    },
  };
}
