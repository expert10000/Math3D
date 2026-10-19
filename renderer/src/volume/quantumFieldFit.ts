import type { QuantumFieldVolume } from "./quantumFieldVolumeAdapter";

export type VisibleFieldFit = {
  center: [number, number, number];
  extents: [number, number, number];
  gridBounds: [number, number, number, number];
  threshold: number;
};

/** Camera framing for one supplied plane. The grid and its scalar values are never cropped. */
export function fitVisibleQuantumField(volume: QuantumFieldVolume, axis: 0 | 1 | 2, index: number): VisibleFieldFit | null {
  if (volume.quantity === "phase" || !Number.isSafeInteger(index) || index < 0 || index >= volume.shape[axis]) return null;
  const plane = ([0, 1, 2] as const).filter(candidate => candidate !== axis);
  const [uAxis, vAxis] = plane;
  const [nx, ny] = volume.shape;
  const sample = (u: number, v: number): number => {
    const grid = [0, 0, 0]; grid[axis] = index; grid[uAxis] = u; grid[vAxis] = v;
    return volume.values[(grid[2] * ny + grid[1]) * nx + grid[0]];
  };
  const width = volume.shape[uAxis], height = volume.shape[vAxis];
  let maximum = 0;
  for (let v = 0; v < height; v++) for (let u = 0; u < width; u++)
    maximum = Math.max(maximum, Math.abs(sample(u, v)));
  if (!Number.isFinite(maximum) || maximum <= 0) return null;

  // A 1% density contour is equivalent to 10% of the peak component amplitude.
  const threshold = maximum * (volume.quantity === "density" ? 0.01 : 0.1);
  let minU = width, minV = height, maxU = -1, maxV = -1;
  for (let v = 0; v < height; v++) for (let u = 0; u < width; u++) {
    if (Math.abs(sample(u, v)) < threshold) continue;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  if (maxU < 0) return null;
  const padU = Math.max(1, Math.ceil((maxU - minU + 1) * 0.1));
  const padV = Math.max(1, Math.ceil((maxV - minV + 1) * 0.1));
  const gridBounds: VisibleFieldFit["gridBounds"] = [Math.max(0, minU - padU), Math.max(0, minV - padV),
    Math.min(width, maxU + padU + 1), Math.min(height, maxV + padV + 1)];
  const center: VisibleFieldFit["center"] = [0, 0, 0];
  const extents: VisibleFieldFit["extents"] = [0, 0, 0];
  for (let coordinate = 0; coordinate < 3; coordinate++) {
    const spacing = volume.spacing[coordinate];
    if (coordinate === axis) {
      center[coordinate] = volume.origin[coordinate] + index * spacing;
      extents[coordinate] = Math.abs(spacing) / 2;
      continue;
    }
    const [low, high] = coordinate === uAxis ? [gridBounds[0], gridBounds[2]] : [gridBounds[1], gridBounds[3]];
    const first = volume.origin[coordinate] + (low - 0.5) * spacing;
    const last = volume.origin[coordinate] + (high - 0.5) * spacing;
    center[coordinate] = (first + last) / 2;
    extents[coordinate] = Math.abs(last - first) / 2;
  }
  return { center, extents, gridBounds, threshold };
}
