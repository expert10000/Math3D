import type { Line3, Plane3, Point3, Vec3 } from "./types";
import { EPS, angleBetweenVec3, crossVec3, dotVec3, lengthVec3, normalizeVec3, subVec3 } from "./vec";

export type ConstraintUnit = "unit" | "deg";
export type ConstraintStatus = "ok" | "fail" | "invalid";

export type ConstraintDef = {
  id: string;
  label: string;
  tolerance: number;
  unit?: ConstraintUnit;
  residual: () => number | null;
  hint?: string;
};

export type ConstraintResult = {
  id: string;
  label: string;
  tolerance: number;
  unit: ConstraintUnit;
  residual: number | null;
  status: ConstraintStatus;
  hint?: string;
};

const RAD2DEG = 180 / Math.PI;

export const signedDistancePointToPlane = (point: Point3, plane: Plane3): number | null => {
  const n = normalizeVec3(plane.normal);
  if (!n) return null;
  const v = subVec3(point, plane.point);
  return dotVec3(v, n);
};

export const distancePointToPlane = (point: Point3, plane: Plane3): number | null => {
  const d = signedDistancePointToPlane(point, plane);
  return d == null ? null : Math.abs(d);
};

export const distancePointToLine = (point: Point3, line: Line3): number | null => {
  const d = line.direction;
  const len = lengthVec3(d);
  if (!Number.isFinite(len) || len <= EPS) return null;
  const v = subVec3(point, line.origin);
  const cross = crossVec3(v, d);
  return lengthVec3(cross) / len;
};

export const coplanarityResidual = (a: Point3, b: Point3, c: Point3, d: Point3): number | null => {
  const ab = subVec3(b, a);
  const ac = subVec3(c, a);
  const n = crossVec3(ab, ac);
  const nLen = lengthVec3(n);
  if (!Number.isFinite(nLen) || nLen <= EPS) return null;
  const ad = subVec3(d, a);
  return Math.abs(dotVec3(ad, n) / nLen);
};

export const lineLineClosestDistance = (a: Line3, b: Line3): number | null => {
  const d1 = a.direction;
  const d2 = b.direction;
  const cross = crossVec3(d1, d2);
  const denom = lengthVec3(cross);
  const p13 = subVec3(a.origin, b.origin);
  if (!Number.isFinite(denom) || denom <= EPS) {
    const dist = lengthVec3(crossVec3(p13, d1)) / Math.max(EPS, lengthVec3(d1));
    return Number.isFinite(dist) ? dist : null;
  }
  return Math.abs(dotVec3(p13, cross)) / denom;
};

export const angleBetweenLines = (a: Line3, b: Line3): number | null => {
  const ang = angleBetweenVec3(a.direction, b.direction);
  if (ang == null) return null;
  return Math.min(ang, Math.PI - ang);
};

export type BestFitPlaneResult = {
  plane: Plane3;
  centroid: Point3;
  normal: Vec3;
  residuals: number[];
  rms: number;
  max: number;
};

const jacobiEigenSymmetric3 = (m: number[][]) => {
  const a = [
    [m[0][0], m[0][1], m[0][2]],
    [m[1][0], m[1][1], m[1][2]],
    [m[2][0], m[2][1], m[2][2]],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const maxIter = 24;
  for (let iter = 0; iter < maxIter; iter++) {
    let p = 0;
    let q = 1;
    let max = Math.abs(a[0][1]);
    const a02 = Math.abs(a[0][2]);
    const a12 = Math.abs(a[1][2]);
    if (a02 > max) {
      max = a02;
      p = 0;
      q = 2;
    }
    if (a12 > max) {
      max = a12;
      p = 1;
      q = 2;
    }
    if (max <= 1e-10) break;

    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    for (let i = 0; i < 3; i++) {
      if (i === p || i === q) continue;
      const aip = a[i][p];
      const aiq = a[i][q];
      const nip = c * aip - s * aiq;
      const niq = s * aip + c * aiq;
      a[i][p] = nip;
      a[p][i] = nip;
      a[i][q] = niq;
      a[q][i] = niq;
    }

    const appNew = c * c * app - 2 * s * c * apq + s * s * aqq;
    const aqqNew = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][p] = appNew;
    a[q][q] = aqqNew;
    a[p][q] = 0;
    a[q][p] = 0;

    for (let i = 0; i < 3; i++) {
      const vip = v[i][p];
      const viq = v[i][q];
      v[i][p] = c * vip - s * viq;
      v[i][q] = s * vip + c * viq;
    }
  }
  return {
    values: [a[0][0], a[1][1], a[2][2]],
    vectors: v,
  };
};

export const bestFitPlane = (points: Point3[]): BestFitPlaneResult | null => {
  if (!points || points.length < 3) return null;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let count = 0;
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    cx += p.x;
    cy += p.y;
    cz += p.z;
    count += 1;
  }
  if (count < 3) return null;
  const inv = 1 / count;
  const centroid: Point3 = { x: cx * inv, y: cy * inv, z: cz * inv };

  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (const p of points) {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const dz = p.z - centroid.z;
    xx += dx * dx;
    xy += dx * dy;
    xz += dx * dz;
    yy += dy * dy;
    yz += dy * dz;
    zz += dz * dz;
  }

  const cov = [
    [xx, xy, xz],
    [xy, yy, yz],
    [xz, yz, zz],
  ];
  const eig = jacobiEigenSymmetric3(cov);
  const vals = eig.values;
  let minIdx = 0;
  if (vals[1] < vals[minIdx]) minIdx = 1;
  if (vals[2] < vals[minIdx]) minIdx = 2;

  const normal: Vec3 = {
    x: eig.vectors[0][minIdx],
    y: eig.vectors[1][minIdx],
    z: eig.vectors[2][minIdx],
  };
  const normed = normalizeVec3(normal);
  if (!normed) return null;

  const residuals: number[] = [];
  let sumSq = 0;
  let max = 0;
  for (const p of points) {
    const d = dotVec3(subVec3(p, centroid), normed);
    const dist = Math.abs(d);
    residuals.push(dist);
    sumSq += dist * dist;
    max = Math.max(max, dist);
  }
  const rms = Math.sqrt(sumSq / Math.max(1, residuals.length));
  const plane: Plane3 = { point: centroid, normal: normed };
  return { plane, centroid, normal: normed, residuals, rms, max };
};

export const evaluateConstraints = (constraints: ConstraintDef[]): ConstraintResult[] => {
  return constraints.map((c) => {
    const raw = c.residual();
    if (raw == null || !Number.isFinite(raw)) {
      return {
        id: c.id,
        label: c.label,
        tolerance: c.tolerance,
        unit: c.unit ?? "unit",
        residual: null,
        status: "invalid",
        hint: c.hint,
      };
    }
    const residual = Math.abs(raw);
    const tol = Math.abs(c.tolerance);
    const status: ConstraintStatus = residual <= tol ? "ok" : "fail";
    return {
      id: c.id,
      label: c.label,
      tolerance: tol,
      unit: c.unit ?? "unit",
      residual,
      status,
      hint: c.hint,
    };
  });
};

export const formatConstraintValue = (value: number | null, unit: ConstraintUnit = "unit") => {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (unit === "deg") return `${value.toFixed(2)}°`;
  if (abs >= 1000 || abs < 1e-3) return value.toExponential(2);
  return value.toFixed(abs < 1 ? 4 : 3);
};

export const constraintCoplanar = (
  id: string,
  label: string,
  points: [Point3, Point3, Point3, Point3],
  tolerance = 1e-3
): ConstraintDef => ({
  id,
  label,
  tolerance,
  unit: "unit",
  residual: () => coplanarityResidual(points[0], points[1], points[2], points[3]),
});

export const constraintPointOnPlane = (
  id: string,
  label: string,
  point: Point3,
  plane: Plane3,
  tolerance = 1e-3
): ConstraintDef => ({
  id,
  label,
  tolerance,
  unit: "unit",
  residual: () => distancePointToPlane(point, plane),
});

export const constraintPointOnLine = (
  id: string,
  label: string,
  point: Point3,
  line: Line3,
  tolerance = 1e-3
): ConstraintDef => ({
  id,
  label,
  tolerance,
  unit: "unit",
  residual: () => distancePointToLine(point, line),
});

export const constraintEqualDistancesToLines = (
  id: string,
  label: string,
  point: Point3,
  lines: Line3[],
  tolerance = 1e-3
): ConstraintDef => ({
  id,
  label,
  tolerance,
  unit: "unit",
  residual: () => {
    if (!lines.length) return null;
    const distances = lines.map((line) => distancePointToLine(point, line)).filter((d): d is number => d != null);
    if (distances.length < 2) return null;
    const min = Math.min(...distances);
    const max = Math.max(...distances);
    return max - min;
  },
});

export const constraintEqualAngles = (
  id: string,
  label: string,
  bisector: Line3,
  lineA: Line3,
  lineB: Line3,
  toleranceDeg = 0.5
): ConstraintDef => ({
  id,
  label,
  tolerance: toleranceDeg,
  unit: "deg",
  residual: () => {
    const a1 = angleBetweenLines(bisector, lineA);
    const a2 = angleBetweenLines(bisector, lineB);
    if (a1 == null || a2 == null) return null;
    return Math.abs((a1 - a2) * RAD2DEG);
  },
});

export const constraintAngleBetweenLines = (
  id: string,
  label: string,
  lineA: Line3,
  lineB: Line3,
  expectedDeg: number,
  toleranceDeg = 0.5
): ConstraintDef => ({
  id,
  label,
  tolerance: toleranceDeg,
  unit: "deg",
  residual: () => {
    const ang = angleBetweenLines(lineA, lineB);
    if (ang == null) return null;
    const deg = ang * RAD2DEG;
    return Math.abs(deg - expectedDeg);
  },
});

export const constraintLineIntersection = (
  id: string,
  label: string,
  lineA: Line3,
  lineB: Line3,
  tolerance = 1e-3
): ConstraintDef => ({
  id,
  label,
  tolerance,
  unit: "unit",
  residual: () => lineLineClosestDistance(lineA, lineB),
});
