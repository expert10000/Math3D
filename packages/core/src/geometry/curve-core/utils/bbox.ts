import type { Vec2, Vec3 } from "../../../math";
import type { AnyCurve, CurvePoint } from "../model";
import { sampleUniform } from "../sampling";
import { isVec3Point } from "./vector";

export type BoundingBox2D = {
  min: Vec2;
  max: Vec2;
};

export type BoundingBox3D = {
  min: Vec3;
  max: Vec3;
};

export type CurveBoundingBox = BoundingBox2D | BoundingBox3D;

export const bboxFromPoints = (points: CurvePoint[]): CurveBoundingBox | null => {
  if (!points.length) return null;
  const first = points[0];
  if (isVec3Point(first)) {
    const min: Vec3 = { ...first };
    const max: Vec3 = { ...first };
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i];
      if (!isVec3Point(p)) continue;
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    }
    return { min, max };
  }

  const min: Vec2 = { x: first.x, y: first.y };
  const max: Vec2 = { x: first.x, y: first.y };
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
  }
  return { min, max };
};

export const bboxFromCurve = (curve: AnyCurve, samples = 256): CurveBoundingBox | null => {
  const sampled = sampleUniform(curve, samples);
  return bboxFromPoints(sampled.map((row) => row.point));
};

