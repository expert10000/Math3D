import type { Plane3, Point3, Polygon3, Polyhedron, Vec3 } from "./types";
import { EPS, crossVec3, dotVec3, lengthVec3, normalizeVec3, planeBasis, subVec3 } from "./vec";

export type FaceSpec = {
  id?: string;
  label?: string;
  vertices: string[];
  color?: number;
  opacity?: number;
};

export type PolyhedronSpec = {
  vertices: Record<string, Point3>;
  faces: FaceSpec[];
  color?: number;
  opacity?: number;
};

export type FaceInfo = {
  id: string;
  label: string;
  vertices: Point3[];
  polygon: Polygon3;
  plane: Plane3 | null;
  normal: Vec3 | null;
  centroid: Point3;
};

export const polygonNormalFromVertices = (vertices: Point3[]): Vec3 | null => {
  if (!vertices || vertices.length < 3) return null;
  const base = vertices[0];
  for (let i = 1; i + 1 < vertices.length; i++) {
    const v1 = subVec3(vertices[i], base);
    const v2 = subVec3(vertices[i + 1], base);
    const cross = crossVec3(v1, v2);
    const len = lengthVec3(cross);
    if (Number.isFinite(len) && len > EPS) {
      return normalizeVec3(cross);
    }
  }
  return null;
};

export const polygonPlaneFromVertices = (vertices: Point3[]): Plane3 | null => {
  const normal = polygonNormalFromVertices(vertices);
  if (!normal || !vertices.length) return null;
  return { point: vertices[0], normal };
};

export const polygonCentroid = (vertices: Point3[]): Point3 => {
  if (!vertices.length) return { x: 0, y: 0, z: 0 };
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;
  for (const v of vertices) {
    x += v.x;
    y += v.y;
    z += v.z;
    count += 1;
  }
  const inv = 1 / Math.max(1, count);
  return { x: x * inv, y: y * inv, z: z * inv };
};

export const pointInPolygonOnPlane = (
  point: Point3,
  polygon: Polygon3,
  plane?: Plane3 | null,
  tolerance = 1e-3
): { inside: boolean; distance: number } | null => {
  if (!polygon.vertices?.length) return null;
  const pl = plane ?? polygonPlaneFromVertices(polygon.vertices);
  if (!pl) return null;
  const n = normalizeVec3(pl.normal);
  if (!n) return null;
  const basis = planeBasis(n);
  if (!basis) return null;
  const { u, v } = basis;
  const origin = pl.point;
  const to2d = (p: Point3) => {
    const d = subVec3(p, origin);
    return { x: dotVec3(d, u), y: dotVec3(d, v) };
  };
  const proj = polygon.vertices.map(to2d);
  const p = to2d(point);
  const distance = dotVec3(subVec3(point, origin), n);
  if (Math.abs(distance) > tolerance) {
    return { inside: false, distance };
  }

  let inside = false;
  for (let i = 0, j = proj.length - 1; i < proj.length; j = i++) {
    const xi = proj[i].x;
    const yi = proj[i].y;
    const xj = proj[j].x;
    const yj = proj[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + EPS) + xi;
    if (intersect) inside = !inside;
  }
  return { inside, distance };
};

export const buildPolyhedronFromVertexSets = (spec: PolyhedronSpec): { polyhedron: Polyhedron; faceInfo: FaceInfo[] } => {
  const faces: Polygon3[] = [];
  const faceInfo: FaceInfo[] = [];
  spec.faces.forEach((face, idx) => {
    const verts = face.vertices.map((key) => spec.vertices[key]).filter(Boolean);
    if (verts.length < 3) return;
    const id = face.id ?? `face_${idx}`;
    const label = face.label ?? face.vertices.join("");
    const polygon: Polygon3 = {
      id,
      label,
      vertices: verts,
      color: face.color ?? spec.color,
      opacity: face.opacity ?? spec.opacity,
    };
    faces.push(polygon);
    const plane = polygonPlaneFromVertices(verts);
    const normal = plane?.normal ?? null;
    faceInfo.push({
      id,
      label,
      vertices: verts,
      polygon,
      plane,
      normal,
      centroid: polygonCentroid(verts),
    });
  });

  return {
    polyhedron: { faces, color: spec.color, opacity: spec.opacity },
    faceInfo,
  };
};
