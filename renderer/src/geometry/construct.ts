import type { Line3, Plane3, Point3, Segment3, Vec3 } from "./types";
import {
  EPS,
  addVec3,
  angleBetweenVec3,
  clamp,
  crossVec3,
  distanceVec3,
  dotVec3,
  lengthVec3,
  normalizeVec3,
  planeBasis,
  scaleVec3,
  subVec3,
} from "./vec";

export type LineIntersectionResult = { point: Point3; t: number; s: number };
export type PlaneIntersectionResult = { point: Point3; t: number };

export type IncenterResult = {
  center: Point3;
  radius: number;
  normal: Vec3;
};

export const lineThroughPoints = (a: Point3, b: Point3, opts: Partial<Line3> = {}): Line3 | null => {
  const dir = subVec3(b, a);
  const norm = normalizeVec3(dir);
  if (!norm) return null;
  return { origin: a, direction: norm, ...opts };
};

export const lineFromPointDir = (origin: Point3, direction: Vec3, opts: Partial<Line3> = {}): Line3 | null => {
  const norm = normalizeVec3(direction);
  if (!norm) return null;
  return { origin, direction: norm, ...opts };
};

export const planeThroughPoints = (a: Point3, b: Point3, c: Point3, opts: Partial<Plane3> = {}): Plane3 | null => {
  const ab = subVec3(b, a);
  const ac = subVec3(c, a);
  const normal = normalizeVec3(crossVec3(ab, ac));
  if (!normal) return null;
  return { point: a, normal, ...opts };
};

export const angleAtPoint = (a: Point3, vertex: Point3, c: Point3): number | null => {
  const v1 = subVec3(a, vertex);
  const v2 = subVec3(c, vertex);
  return angleBetweenVec3(v1, v2);
};

export const angleBisectorLine = (
  vertex: Point3,
  a: Point3,
  c: Point3,
  opts: Partial<Line3> = {}
): Line3 | null => {
  const v1 = normalizeVec3(subVec3(a, vertex));
  const v2 = normalizeVec3(subVec3(c, vertex));
  if (!v1 || !v2) return null;
  const sum = addVec3(v1, v2);
  const dir = normalizeVec3(sum);
  if (!dir) return null;
  return { origin: vertex, direction: dir, ...opts };
};

export const triangleIncenter = (a: Point3, b: Point3, c: Point3): IncenterResult | null => {
  const lenA = distanceVec3(b, c);
  const lenB = distanceVec3(a, c);
  const lenC = distanceVec3(a, b);
  const perimeter = lenA + lenB + lenC;
  if (!Number.isFinite(perimeter) || perimeter <= EPS) return null;

  const center: Point3 = {
    x: (lenA * a.x + lenB * b.x + lenC * c.x) / perimeter,
    y: (lenA * a.y + lenB * b.y + lenC * c.y) / perimeter,
    z: (lenA * a.z + lenB * b.z + lenC * c.z) / perimeter,
  };

  const ab = subVec3(b, a);
  const ac = subVec3(c, a);
  const normal = normalizeVec3(crossVec3(ab, ac));
  if (!normal) return null;

  const area2 = lengthVec3(crossVec3(ab, ac));
  const radius = area2 / perimeter;
  if (!Number.isFinite(radius)) return null;

  return { center, radius, normal };
};

export const buildCircleSegments = (
  center: Point3,
  normal: Vec3,
  radius: number,
  opts: { segments?: number; color?: number; opacity?: number; radiusScale?: number } = {}
): Segment3[] => {
  if (!Number.isFinite(radius) || radius <= 0) return [];
  const basis = planeBasis(normal);
  if (!basis) return [];
  const steps = Math.max(12, Math.round(opts.segments ?? 48));
  const { u, v } = basis;
  const points: Point3[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const offset = addVec3(scaleVec3(u, Math.cos(t) * radius), scaleVec3(v, Math.sin(t) * radius));
    points.push(addVec3(center, offset));
  }
  const segments: Segment3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    segments.push({
      a,
      b,
      color: opts.color,
      opacity: opts.opacity,
      radiusScale: opts.radiusScale,
    });
  }
  return segments;
};

export const linePlaneIntersection = (line: Line3, plane: Plane3): PlaneIntersectionResult | null => {
  const n = normalizeVec3(plane.normal);
  if (!n) return null;
  const denom = dotVec3(n, line.direction);
  if (!Number.isFinite(denom) || Math.abs(denom) <= EPS) return null;
  const t = dotVec3(n, subVec3(plane.point, line.origin)) / denom;
  if (!Number.isFinite(t)) return null;
  const point = addVec3(line.origin, scaleVec3(line.direction, t));
  return { point, t };
};

export const lineLineIntersectionCoplanar = (
  lineA: Line3,
  lineB: Line3,
  tolerance = 1e-6
): LineIntersectionResult | null => {
  const d1 = lineA.direction;
  const d2 = lineB.direction;
  const cross = crossVec3(d1, d2);
  const n = normalizeVec3(cross);
  if (!n) return null;

  const delta = subVec3(lineB.origin, lineA.origin);
  const distToPlane = Math.abs(dotVec3(delta, n));
  if (!Number.isFinite(distToPlane) || distToPlane > tolerance) return null;

  const basis = planeBasis(n);
  if (!basis) return null;
  const { u, v } = basis;
  const d1u = dotVec3(d1, u);
  const d1v = dotVec3(d1, v);
  const d2u = dotVec3(d2, u);
  const d2v = dotVec3(d2, v);
  const du = dotVec3(delta, u);
  const dv = dotVec3(delta, v);

  const det = d1u * d2v - d1v * d2u;
  if (!Number.isFinite(det) || Math.abs(det) <= EPS) return null;

  const t = (du * d2v - dv * d2u) / det;
  const s = (d1u * dv - d1v * du) / det;
  if (!Number.isFinite(t) || !Number.isFinite(s)) return null;
  const point = addVec3(lineA.origin, scaleVec3(lineA.direction, t));
  return { point, t, s };
};

export const clampAngle = (angleRad: number) => {
  if (!Number.isFinite(angleRad)) return 0;
  const twoPi = Math.PI * 2;
  return clamp(((angleRad + Math.PI) % twoPi + twoPi) % twoPi - Math.PI, -Math.PI, Math.PI);
};
