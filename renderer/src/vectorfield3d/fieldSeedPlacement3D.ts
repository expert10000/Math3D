export type SeedPlane3D = "xy" | "xz" | "yz";
export type FieldAxisBounds = Readonly<{ min: number; max: number }>;

export const seedPlaneNormalAxis = (plane: SeedPlane3D): 0 | 1 | 2 =>
  plane === "xy" ? 2 : plane === "xz" ? 1 : 0;

export function fieldPointToWorld(point: readonly number[], axes: readonly FieldAxisBounds[]):
  [number, number, number] {
  const span = Math.max(...axes.map(axis => axis.max - axis.min));
  return point.map((value, axis) =>
    (value - (axes[axis]!.min + axes[axis]!.max) / 2) * 2 / span) as
    [number, number, number];
}

export function intersectFieldSeedPlane(ray: Readonly<{ origin: readonly number[];
  direction: readonly number[] }>, plane: SeedPlane3D, fixedCoordinate: number,
axes: readonly FieldAxisBounds[]): Readonly<{ point: [number, number, number] | null;
  reason: "parallel" | "behind" | "outside" | null }> {
  const normal = seedPlaneNormalAxis(plane);
  const span = Math.max(...axes.map(axis => axis.max - axis.min));
  if (axes.length !== 3 || !Number.isFinite(span) || span <= 0 ||
      !Number.isFinite(fixedCoordinate) || ray.origin.length !== 3 ||
      ray.direction.length !== 3 || [...ray.origin, ...ray.direction].some(value =>
        !Number.isFinite(value))) return { point: null, reason: "outside" };
  const worldFixed = fieldPointToWorld(axes.map((axis, index) =>
    index === normal ? fixedCoordinate : (axis.min + axis.max) / 2), axes)[normal];
  const denominator = ray.direction[normal]!;
  if (Math.abs(denominator) < 1e-10) return { point: null, reason: "parallel" };
  const distance = (worldFixed - ray.origin[normal]!) / denominator;
  if (distance < 0) return { point: null, reason: "behind" };
  const point = axes.map((axis, index) => index === normal ? fixedCoordinate :
    (ray.origin[index]! + distance * ray.direction[index]!) * span / 2 +
    (axis.min + axis.max) / 2) as [number, number, number];
  const epsilon = span * 1e-9;
  if (point.some((value, index) => value < axes[index]!.min - epsilon ||
      value > axes[index]!.max + epsilon)) return { point: null, reason: "outside" };
  return { point: point.map((value, index) =>
    Math.max(axes[index]!.min, Math.min(axes[index]!.max, value))) as
    [number, number, number], reason: null };
}
