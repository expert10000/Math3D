import type { Vec3 } from "./types";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type SectionPlanePreset = "xy" | "yz" | "xz" | "custom";

export type SectionPlane = {
  origin: Vec3;
  normal: Vec3;
};

export type SectionPolyline = {
  points: Vec3[];
  closed: boolean;
  length: number;
  area: number | null;
};

export type MeshSectionResult = {
  polylines: SectionPolyline[];
  closedPolygons: Vec3[][];
  segmentCount: number;
  curveLength: number;
  area: number;
  closed: boolean;
  equivalentRadius: number | null;
};

type Segment = {
  a: Vec3;
  b: Vec3;
};

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));

const normalize = (v: Vec3): Vec3 | null => {
  const l = len(v);
  if (!Number.isFinite(l) || l <= 1e-12) return null;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

const edgeIntersections = (
  p0: Vec3,
  d0: number,
  p1: Vec3,
  d1: number,
  epsilon: number
): Vec3[] => {
  const out: Vec3[] = [];
  const on0 = Math.abs(d0) <= epsilon;
  const on1 = Math.abs(d1) <= epsilon;
  if (on0 && on1) {
    out.push(p0, p1);
    return out;
  }
  if (on0) {
    out.push(p0);
    return out;
  }
  if (on1) {
    out.push(p1);
    return out;
  }
  if (d0 * d1 > 0) return out;
  const t = d0 / (d0 - d1);
  if (!Number.isFinite(t)) return out;
  out.push(add(p0, scale(sub(p1, p0), t)));
  return out;
};

const dedupePoints = (points: Vec3[], tolerance: number): Vec3[] => {
  const result: Vec3[] = [];
  for (const p of points) {
    if (result.some((q) => dist(p, q) <= tolerance)) continue;
    result.push(p);
  }
  return result;
};

const farthestPair = (points: Vec3[]): [Vec3, Vec3] | null => {
  if (points.length < 2) return null;
  let best: [Vec3, Vec3] | null = null;
  let bestD = -1;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = dist(points[i], points[j]);
      if (d > bestD) {
        bestD = d;
        best = [points[i], points[j]];
      }
    }
  }
  return best;
};

const keyOfPoint = (p: Vec3, tolerance: number): string => {
  const inv = 1 / Math.max(tolerance, 1e-12);
  return `${Math.round(p.x * inv)}|${Math.round(p.y * inv)}|${Math.round(p.z * inv)}`;
};

const planeBasis = (normal: Vec3): { u: Vec3; v: Vec3 } => {
  const ref = Math.abs(normal.z) < 0.95 ? ({ x: 0, y: 0, z: 1 } as Vec3) : ({ x: 0, y: 1, z: 0 } as Vec3);
  const u = normalize(cross(ref, normal)) ?? { x: 1, y: 0, z: 0 };
  const v = normalize(cross(normal, u)) ?? { x: 0, y: 1, z: 0 };
  return { u, v };
};

const areaOnPlane = (points: Vec3[], planeNormal: Vec3): number => {
  if (points.length < 3) return 0;
  const n = normalize(planeNormal);
  if (!n) return 0;
  const { u, v } = planeBasis(n);
  let area2 = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const ax = dot(a, u);
    const ay = dot(a, v);
    const bx = dot(b, u);
    const by = dot(b, v);
    area2 += ax * by - ay * bx;
  }
  return Math.abs(area2) * 0.5;
};

const polylineLength = (points: Vec3[], closed: boolean): number => {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) sum += dist(points[i - 1], points[i]);
  if (closed) sum += dist(points[points.length - 1], points[0]);
  return sum;
};

const buildPolylinesFromSegments = (segments: Segment[], tolerance: number): Vec3[][] => {
  if (!segments.length) return [];
  const pointByKey = new Map<string, Vec3>();
  const segKeys = segments.map((segment) => {
    const ka = keyOfPoint(segment.a, tolerance);
    const kb = keyOfPoint(segment.b, tolerance);
    if (!pointByKey.has(ka)) pointByKey.set(ka, segment.a);
    if (!pointByKey.has(kb)) pointByKey.set(kb, segment.b);
    return { ka, kb };
  });
  const adjacency = new Map<string, Array<{ segIndex: number; other: string }>>();
  const addAdj = (key: string, segIndex: number, other: string) => {
    const arr = adjacency.get(key);
    if (arr) arr.push({ segIndex, other });
    else adjacency.set(key, [{ segIndex, other }]);
  };
  for (let i = 0; i < segKeys.length; i += 1) {
    const { ka, kb } = segKeys[i];
    addAdj(ka, i, kb);
    addAdj(kb, i, ka);
  }

  const used = new Uint8Array(segments.length);
  const polylines: Vec3[][] = [];

  const takeNeighbor = (key: string): { segIndex: number; other: string } | null => {
    const list = adjacency.get(key);
    if (!list) return null;
    for (const cand of list) {
      if (!used[cand.segIndex]) return cand;
    }
    return null;
  };

  for (let i = 0; i < segKeys.length; i += 1) {
    if (used[i]) continue;
    used[i] = 1;
    const { ka, kb } = segKeys[i];
    const keys = [ka, kb];

    let extended = true;
    while (extended) {
      extended = false;
      const head = keys[0];
      const nHead = takeNeighbor(head);
      if (nHead && nHead.other !== keys[1]) {
        used[nHead.segIndex] = 1;
        keys.unshift(nHead.other);
        extended = true;
      }
      const tail = keys[keys.length - 1];
      const nTail = takeNeighbor(tail);
      if (nTail && nTail.other !== keys[keys.length - 2]) {
        used[nTail.segIndex] = 1;
        keys.push(nTail.other);
        extended = true;
      }
    }

    const points = keys
      .map((key) => pointByKey.get(key) ?? null)
      .filter((p): p is Vec3 => !!p);
    if (points.length >= 2) polylines.push(points);
  }

  return polylines;
};

export const computeMeshSection = (
  mesh: Pick<SurfaceMeshData, "positions" | "indices">,
  plane: SectionPlane,
  tolerance = 1e-6
): MeshSectionResult => {
  const normal = normalize(plane.normal) ?? { x: 0, y: 0, z: 1 };
  const epsilon = Math.max(1e-9, tolerance);
  const positions = mesh.positions;
  const vertexCount = Math.floor((positions.length ?? 0) / 3);
  const indices = mesh.indices ?? null;
  const faceCount = indices ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);

  const getPoint = (idx: number): Vec3 => {
    const i = idx * 3;
    return {
      x: Number(positions[i] ?? 0),
      y: Number(positions[i + 1] ?? 0),
      z: Number(positions[i + 2] ?? 0),
    };
  };

  const signedDistance = (p: Vec3): number => dot(sub(p, plane.origin), normal);

  const segments: Segment[] = [];
  for (let f = 0; f < faceCount; f += 1) {
    const base = f * 3;
    const ia = indices ? Number(indices[base]) : base;
    const ib = indices ? Number(indices[base + 1]) : base + 1;
    const ic = indices ? Number(indices[base + 2]) : base + 2;
    if (
      !Number.isInteger(ia) ||
      !Number.isInteger(ib) ||
      !Number.isInteger(ic) ||
      ia < 0 ||
      ib < 0 ||
      ic < 0 ||
      ia >= vertexCount ||
      ib >= vertexCount ||
      ic >= vertexCount
    ) {
      continue;
    }
    if (ia === ib || ib === ic || ic === ia) continue;

    const a = getPoint(ia);
    const b = getPoint(ib);
    const c = getPoint(ic);
    const da = signedDistance(a);
    const db = signedDistance(b);
    const dc = signedDistance(c);
    if ((da > epsilon && db > epsilon && dc > epsilon) || (da < -epsilon && db < -epsilon && dc < -epsilon)) {
      continue;
    }
    const candidates = dedupePoints(
      [
        ...edgeIntersections(a, da, b, db, epsilon),
        ...edgeIntersections(b, db, c, dc, epsilon),
        ...edgeIntersections(c, dc, a, da, epsilon),
      ],
      epsilon * 2
    );
    const pair = farthestPair(candidates);
    if (!pair) continue;
    const [p0, p1] = pair;
    if (dist(p0, p1) <= epsilon * 4) continue;
    segments.push({ a: p0, b: p1 });
  }

  const polylinesPoints = buildPolylinesFromSegments(segments, epsilon * 6);
  const polylines: SectionPolyline[] = polylinesPoints.map((points) => {
    const closed = points.length >= 3 && dist(points[0], points[points.length - 1]) <= epsilon * 8;
    const clean = closed ? points.slice(0, -1) : points.slice();
    const area = closed && clean.length >= 3 ? areaOnPlane(clean, normal) : null;
    return {
      points: clean,
      closed,
      length: polylineLength(clean, closed),
      area,
    };
  });
  const closedPolygons = polylines.filter((p) => p.closed && p.points.length >= 3).map((p) => p.points);
  const curveLength = polylines.reduce((sum, poly) => sum + poly.length, 0);
  const area = polylines.reduce((sum, poly) => sum + (poly.area ?? 0), 0);
  const allClosed = polylines.length > 0 && polylines.every((poly) => poly.closed);
  const equivalentRadius = area > 0 ? Math.sqrt(area / Math.PI) : null;

  return {
    polylines,
    closedPolygons,
    segmentCount: segments.length,
    curveLength,
    area,
    closed: allClosed,
    equivalentRadius,
  };
};

export const sectionPlaneNormalFromPreset = (
  preset: SectionPlanePreset,
  customNormal: Vec3
): Vec3 => {
  if (preset === "xy") return { x: 0, y: 0, z: 1 };
  if (preset === "yz") return { x: 1, y: 0, z: 0 };
  if (preset === "xz") return { x: 0, y: 1, z: 0 };
  return normalize(customNormal) ?? { x: 0, y: 0, z: 1 };
};
