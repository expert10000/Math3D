export type Vec2 = { x: number; y: number };

export type Vec3 = { x: number; y: number; z: number };

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isVec3 = (value: unknown): value is Vec3 => {
  if (!value || typeof value !== "object") return false;
  const probe = value as Partial<Vec3>;
  return isFiniteNumber(probe.x) && isFiniteNumber(probe.y) && isFiniteNumber(probe.z);
};
