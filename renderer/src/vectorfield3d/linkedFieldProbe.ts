import type { Graph2DScientificVolume } from "@math3d/core";

export type LinkedFieldPoint = readonly [number, number, number];
export type LinkedExplorerProbe = Readonly<{ point: LinkedFieldPoint;
  units: readonly [string, string, string] }>;
export type LinkedFieldAxis = Readonly<{ name: string; unit: string; origin: number;
  spacing: number; count: number }>;

export function linkedFieldPointStatus(point: LinkedFieldPoint, axes: readonly LinkedFieldAxis[],
  pointUnits: readonly string[]): "inside" | "outside" | "incompatible-units" {
  if (axes.length !== 3 || axes.some((axis, index) => axis.unit !== pointUnits[index]))
    return "incompatible-units";
  return point.every((value, index) => Number.isFinite(value) &&
    value >= axes[index]!.origin - 1e-9 &&
    value <= axes[index]!.origin + axes[index]!.spacing * (axes[index]!.count - 1) + 1e-9) ?
    "inside" : "outside";
}

/** Trilinear value on the actual, possibly rounded source indices of a verified bounded volume. */
export function sampleLinkedFieldVolume(volume: Graph2DScientificVolume,
  axes: readonly LinkedFieldAxis[], point: LinkedFieldPoint): number {
  if (linkedFieldPointStatus(point, axes, axes.map(axis => axis.unit)) !== "inside")
    throw new RangeError("Linked probe is outside this field domain.");
  const corners = axes.map((axis, index) => {
    const count = volume.sampleShape[index]!;
    const sourceCount = volume.sourceShape[index]!;
    const positions = Array.from({ length: count }, (_, sample) =>
      Math.round(sample * (sourceCount - 1) / (count - 1)));
    const raw = Math.max(0, Math.min(sourceCount - 1, (point[index]! - axis.origin) / axis.spacing));
    let upper = positions.findIndex(sourceIndex => sourceIndex >= raw - 1e-9);
    if (upper < 0) upper = count - 1;
    const lower = Math.max(0, upper - 1);
    const fraction = upper === lower ? 0 :
      Math.max(0, Math.min(1, (raw - positions[lower]!) / (positions[upper]! - positions[lower]!)));
    return { lower, upper, fraction };
  });
  let value = 0;
  for (let mask = 0; mask < 8; mask++) {
    const indices = corners.map((corner, axis) => (mask & (1 << axis)) ? corner.upper : corner.lower);
    const weight = corners.reduce((product, corner, axis) => product *
      ((mask & (1 << axis)) ? corner.fraction : 1 - corner.fraction), 1);
    value += weight * volume.values[(indices[0]! * volume.sampleShape[1] + indices[1]!) *
      volume.sampleShape[2] + indices[2]!]!;
  }
  return value;
}
