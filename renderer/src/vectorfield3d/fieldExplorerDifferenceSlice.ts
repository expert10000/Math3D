import type { FieldExplorerDifferenceSettings, VectorField3DSliceArtifact } from "@math3d/core";

/** Ephemeral view of two checked native slices, never a substitute source document. */
export function fieldExplorerDifferenceSlice(a: VectorField3DSliceArtifact,
  b: VectorField3DSliceArtifact, channel: FieldExplorerDifferenceSettings["channel"]) {
  if (a.normalAxis !== b.normalAxis || a.fixedCoordinate !== b.fixedCoordinate ||
      a.unit !== b.unit || JSON.stringify(a.coordinates) !== JSON.stringify(b.coordinates) ||
      JSON.stringify(a.planeAxes) !== JSON.stringify(b.planeAxes) ||
      JSON.stringify(a.shape) !== JSON.stringify(b.shape))
    throw new TypeError("Difference views require matching physical planes, sample lattices and units.");
  const count = a.shape[0] * a.shape[1];
  if (!count || a.vectors?.length !== count || b.vectors?.length !== count || a.rejected || b.rejected)
    throw new TypeError("Difference values withheld: complete finite vector coverage is required.");
  const vectors = a.vectors.map((vector, index) => {
    const other = b.vectors![index];
    if (!vector || !other || ![...vector, ...other].every(Number.isFinite))
      throw new TypeError("Difference values withheld: a source sample is unavailable.");
    const delta = vector.map((value, component) => value - other[component]!) as [number, number, number];
    if (!delta.every(Number.isFinite)) throw new TypeError("Difference values withheld: numerical overflow.");
    return delta;
  });
  const component = ["p", "q", "r"].indexOf(channel);
  const values = vectors.map(vector => channel === "magnitude" ? Math.hypot(...vector) : vector[component]!);
  if (!values.every(Number.isFinite)) throw new TypeError("Difference values withheld: numerical overflow.");
  return { normalAxis: a.normalAxis, fixedCoordinate: a.fixedCoordinate, fixedUnit: a.fixedUnit,
    planeAxes: a.planeAxes, coordinates: a.coordinates, shape: a.shape, channel, unit: a.unit,
    sources: [a.source, b.source] as const, vectors, values,
    min: Math.min(...values), max: Math.max(...values) };
}

export type FieldExplorerDifferenceSlice = ReturnType<typeof fieldExplorerDifferenceSlice>;

export function fieldExplorerDifferenceProbe(slice: FieldExplorerDifferenceSlice,
  a: VectorField3DSliceArtifact, b: VectorField3DSliceArtifact,
  point: readonly [number, number, number] | null) {
  if (!point || Math.abs(point[slice.normalAxis] - slice.fixedCoordinate) > 1e-9) return null;
  const indices = slice.planeAxes.map((axis, local) =>
    slice.coordinates[local]!.findIndex(value => Math.abs(value - point[axis]!) < 1e-9));
  if (indices.some(index => index < 0)) return null;
  const index = indices[0]! * slice.shape[1] + indices[1]!;
  return { a: a.vectors![index]!, b: b.vectors![index]!, delta: slice.vectors[index]!,
    value: slice.values[index]!, index };
}
