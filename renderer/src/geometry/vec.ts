import type { Vec3 } from "./types";

export const EPS = 1e-12;

export const isFiniteVec3 = (v: Vec3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

export const addVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const subVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scaleVec3 = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });

export const dotVec3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const crossVec3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const lengthVec3 = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
export const lengthSqVec3 = (v: Vec3): number => v.x * v.x + v.y * v.y + v.z * v.z;

export const normalizeVec3 = (v: Vec3, eps = EPS): Vec3 | null => {
  if (!isFiniteVec3(v)) return null;
  const len = lengthVec3(v);
  if (!Number.isFinite(len) || len <= eps) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

export const distanceVec3 = (a: Vec3, b: Vec3): number => lengthVec3(subVec3(a, b));
export const distanceSqVec3 = (a: Vec3, b: Vec3): number => lengthSqVec3(subVec3(a, b));

export const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

export const angleBetweenVec3 = (a: Vec3, b: Vec3): number | null => {
  const na = normalizeVec3(a);
  const nb = normalizeVec3(b);
  if (!na || !nb) return null;
  const d = clamp(dotVec3(na, nb), -1, 1);
  return Math.acos(d);
};

export const planeBasis = (normal: Vec3): { u: Vec3; v: Vec3 } | null => {
  const n = normalizeVec3(normal);
  if (!n) return null;
  const up: Vec3 = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = normalizeVec3(crossVec3(n, up)) ?? { x: 1, y: 0, z: 0 };
  const v = normalizeVec3(crossVec3(n, u)) ?? { x: 0, y: 0, z: 1 };
  return { u, v };
};
