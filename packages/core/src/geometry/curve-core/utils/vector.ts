import type { Vec3 } from "../../../math";
import type { CurvePoint } from "../model";

export const isVec3Point = (value: CurvePoint): value is Vec3 => {
  return "z" in value;
};

export const addPoint = <TPoint extends CurvePoint>(a: TPoint, b: TPoint): TPoint => {
  if (isVec3Point(a) && isVec3Point(b)) return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z } as TPoint;
  return { x: a.x + b.x, y: a.y + b.y } as TPoint;
};

export const subPoint = <TPoint extends CurvePoint>(a: TPoint, b: TPoint): TPoint => {
  if (isVec3Point(a) && isVec3Point(b)) return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z } as TPoint;
  return { x: a.x - b.x, y: a.y - b.y } as TPoint;
};

export const scalePoint = <TPoint extends CurvePoint>(a: TPoint, s: number): TPoint => {
  if (isVec3Point(a)) return { x: a.x * s, y: a.y * s, z: a.z * s } as TPoint;
  return { x: a.x * s, y: a.y * s } as TPoint;
};

export const dotPoint = (a: CurvePoint, b: CurvePoint): number => {
  if (isVec3Point(a) && isVec3Point(b)) return a.x * b.x + a.y * b.y + a.z * b.z;
  return a.x * b.x + a.y * b.y;
};

export const crossPoint3 = (a: CurvePoint, b: CurvePoint): Vec3 => {
  const az = isVec3Point(a) ? a.z : 0;
  const bz = isVec3Point(b) ? b.z : 0;
  return {
    x: a.y * bz - az * b.y,
    y: az * b.x - a.x * bz,
    z: a.x * b.y - a.y * b.x,
  };
};

export const lengthPoint = (value: CurvePoint): number => {
  return Math.sqrt(dotPoint(value, value));
};

export const distancePoint = (a: CurvePoint, b: CurvePoint): number => {
  return lengthPoint(subPoint(a, b));
};

export const normalizePoint = <TPoint extends CurvePoint>(value: TPoint): TPoint => {
  const len = lengthPoint(value);
  if (len <= 1e-12) return scalePoint(value, 0);
  return scalePoint(value, 1 / len);
};

export const lerpPoint = <TPoint extends CurvePoint>(a: TPoint, b: TPoint, alpha: number): TPoint => {
  const oneMinus = 1 - alpha;
  return addPoint(scalePoint(a, oneMinus), scalePoint(b, alpha));
};

export const finitePoint = (value: CurvePoint): boolean => {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return false;
  if (isVec3Point(value)) return Number.isFinite(value.z);
  return true;
};
