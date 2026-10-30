import type { VectorField3DSliceArtifact, VectorField3DOverlayRegion } from "@math3d/core";

export const slicePlot = { left: 58, top: 16, width: 560, height: 480 } as const;

const coordinateAt = (coordinates: readonly number[], cell: number): number => {
  const index = Math.max(0, Math.min(coordinates.length - 1, cell));
  const low = Math.floor(index), high = Math.min(coordinates.length - 1, low + 1);
  return coordinates[low]! + (coordinates[high]! - coordinates[low]!) * (index - low);
};

const cellAt = (coordinates: readonly number[], coordinate: number): number => {
  if (coordinate <= coordinates[0]!) return 0;
  for (let index = 0; index < coordinates.length - 1; index++) {
    const low = coordinates[index]!, high = coordinates[index + 1]!;
    if (coordinate <= high) return index + (coordinate - low) / (high - low);
  }
  return coordinates.length - 1;
};

/** The source coordinates are located at displayed cell centers, with the second axis upward. */
export function sliceSeedPointAtSvgPosition(slice: VectorField3DSliceArtifact,
  x: number, y: number): readonly [number, number, number] | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) ||
      x < slicePlot.left || x > slicePlot.left + slicePlot.width ||
      y < slicePlot.top || y > slicePlot.top + slicePlot.height ||
      slice.coordinates.some((values, axis) => values.length !== slice.shape[axis] ||
        !values.length || values.some(value => !Number.isFinite(value)))) return null;
  const firstCell = (x - slicePlot.left) / slicePlot.width * slice.shape[0] - .5;
  const secondCell = (1 - (y - slicePlot.top) / slicePlot.height) * slice.shape[1] - .5;
  const point = [0, 0, 0] as [number, number, number];
  point[slice.normalAxis] = slice.fixedCoordinate;
  point[slice.planeAxes[0]] = coordinateAt(slice.coordinates[0], firstCell);
  point[slice.planeAxes[1]] = coordinateAt(slice.coordinates[1], secondCell);
  return point.every(Number.isFinite) ? point : null;
}

export function sliceSeedMarkerAtPoint(slice: VectorField3DSliceArtifact,
  point: readonly [number, number, number]): readonly [number, number] | null {
  if (point.some(value => !Number.isFinite(value)) ||
      Math.abs(point[slice.normalAxis] - slice.fixedCoordinate) > 1e-9) return null;
  const first = slice.coordinates[0], second = slice.coordinates[1];
  if (!first.length || !second.length || point[slice.planeAxes[0]] < first[0]! ||
      point[slice.planeAxes[0]] > first.at(-1)! || point[slice.planeAxes[1]] < second[0]! ||
      point[slice.planeAxes[1]] > second.at(-1)!) return null;
  return [slicePlot.left + (cellAt(first, point[slice.planeAxes[0]]) + .5) /
    slice.shape[0] * slicePlot.width,
  slicePlot.top + (1 - (cellAt(second, point[slice.planeAxes[1]]) + .5) /
    slice.shape[1]) * slicePlot.height];
}

/** Keep the slice's displayed axis order, including the upward second axis. */
export function sliceSubrectangleBounds(slice: VectorField3DSliceArtifact,
  region: VectorField3DOverlayRegion,
  first: readonly [number, number, number], second: readonly [number, number, number]):
  VectorField3DOverlayRegion["bounds"] | null {
  if (region.normalAxis !== slice.normalAxis ||
      Math.abs(region.fixedCoordinate - slice.fixedCoordinate) > 1e-9 ||
      ![...first, ...second].every(Number.isFinite) ||
      Math.abs(first[slice.normalAxis] - slice.fixedCoordinate) > 1e-9 ||
      Math.abs(second[slice.normalAxis] - slice.fixedCoordinate) > 1e-9) return null;
  const bounds = slice.planeAxes.map((axis, index) => {
    const low = Math.min(first[axis], second[axis]);
    const high = Math.max(first[axis], second[axis]);
    const source = slice.coordinates[index];
    if (!source.length || low < region.bounds[index][0] - 1e-9 ||
        high > region.bounds[index][1] + 1e-9 ||
        low < source[0]! - 1e-9 || high > source.at(-1)! + 1e-9 ||
        high - low < 1e-10) return null;
    return [low, high] as [number, number];
  });
  return bounds.every((pair): pair is [number, number] => pair !== null) ?
    bounds as [[number, number], [number, number]] : null;
}
