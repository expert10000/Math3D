import type { GeometryScene, Line3, Plane3, Point3, Polygon3, Segment3, Triangle3, Vec3 } from "./types";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { computeVertexNormals } from "../mesh/meshOps";
import type { OverlayPointSet, OverlayPolylineGroup } from "../components/SurfaceViewer";
import type { PolylineSet } from "../scene/renderPrimitives";

export type GeometryRenderOptions = {
  label?: string;
  defaultLineColor?: number;
  defaultPointColor?: number;
  defaultLineLength?: number;
  defaultPlaneSize?: number;
  emitEdges?: boolean;
};

export type GeometryRenderData = {
  mesh: SurfaceMeshData | null;
  overlayPointSets: OverlayPointSet[];
  overlayPolylineGroups: OverlayPolylineGroup[];
};

const DEFAULT_LINE_COLOR = 0x2a7bff;
const DEFAULT_POINT_COLOR = 0xff3b30;

const isFiniteVec3 = (v: Vec3) =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

const normalizeVec3 = (v: Vec3): Vec3 | null => {
  if (!isFiniteVec3(v)) return null;
  const len = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(len) || len <= 1e-12) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

const addVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subVec3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mulVec3 = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });

const toKey = (v: Vec3) =>
  `${Number.isFinite(v.x) ? v.x.toFixed(6) : "nan"},${Number.isFinite(v.y) ? v.y.toFixed(6) : "nan"},${Number.isFinite(v.z) ? v.z.toFixed(6) : "nan"}`;

const edgeKey = (a: Vec3, b: Vec3) => {
  const ka = toKey(a);
  const kb = toKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

const planeBasis = (n: Vec3) => {
  const up: Vec3 = Math.abs(n.y) < 0.95 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const ux = n.y * up.z - n.z * up.y;
  const uy = n.z * up.x - n.x * up.z;
  const uz = n.x * up.y - n.y * up.x;
  const u = normalizeVec3({ x: ux, y: uy, z: uz }) ?? { x: 1, y: 0, z: 0 };
  const vx = n.y * u.z - n.z * u.y;
  const vy = n.z * u.x - n.x * u.z;
  const vz = n.x * u.y - n.y * u.x;
  const v = normalizeVec3({ x: vx, y: vy, z: vz }) ?? { x: 0, y: 0, z: 1 };
  return { u, v };
};

const boundsFromPoints = (points: Vec3[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (!isFiniteVec3(p)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!(minX <= maxX) || !(minY <= maxY) || !(minZ <= maxZ)) return null;
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
};

const diagFromBounds = (b: { min: Vec3; max: Vec3 } | null) => {
  if (!b) return 0;
  const dx = b.max.x - b.min.x;
  const dy = b.max.y - b.min.y;
  const dz = b.max.z - b.min.z;
  return Math.hypot(dx, dy, dz);
};

const triangulatePolygon = (poly: Polygon3): Triangle3[] => {
  const verts = poly.vertices;
  if (!verts || verts.length < 3) return [];
  const tris: Triangle3[] = [];
  for (let i = 1; i + 1 < verts.length; i++) {
    tris.push({ a: verts[0], b: verts[i], c: verts[i + 1], color: poly.color, opacity: poly.opacity });
  }
  return tris;
};

const polygonEdges = (poly: Polygon3): Segment3[] => {
  const verts = poly.vertices;
  if (!verts || verts.length < 2) return [];
  const segments: Segment3[] = [];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    segments.push({ a, b, color: poly.color, opacity: poly.opacity });
  }
  return segments;
};

const planeToPolygon = (plane: Plane3, size: number): Polygon3 | null => {
  const n = normalizeVec3(plane.normal);
  if (!n) return null;
  const { u, v } = planeBasis(n);
  const half = size * 0.5;
  const center = plane.point;
  const p0 = addVec3(addVec3(center, mulVec3(u, -half)), mulVec3(v, -half));
  const p1 = addVec3(addVec3(center, mulVec3(u, half)), mulVec3(v, -half));
  const p2 = addVec3(addVec3(center, mulVec3(u, half)), mulVec3(v, half));
  const p3 = addVec3(addVec3(center, mulVec3(u, -half)), mulVec3(v, half));
  return {
    vertices: [p0, p1, p2, p3],
    color: plane.color,
    opacity: plane.opacity,
  };
};

const lineToSegment = (line: Line3, length: number): Segment3 | null => {
  const dir = normalizeVec3(line.direction);
  if (!dir) return null;
  const half = (line.length ?? length) * 0.5;
  const delta = mulVec3(dir, half);
  return {
    a: subVec3(line.origin, delta),
    b: addVec3(line.origin, delta),
    color: line.color,
    opacity: line.opacity,
    radiusScale: line.radiusScale,
  };
};

export const buildGeometryRenderData = (
  scene: GeometryScene,
  opts: GeometryRenderOptions = {}
): GeometryRenderData => {
  const points = scene.points ?? [];
  const segments = scene.segments ?? [];
  const lines = scene.lines ?? [];
  const planes = scene.planes ?? [];
  const triangles = scene.triangles ?? [];
  const polygons = scene.polygons ?? [];
  const polyhedra = scene.polyhedra ?? [];

  const allPoints: Vec3[] = [];
  const pushPoint = (p: Vec3) => {
    if (isFiniteVec3(p)) allPoints.push(p);
  };

  points.forEach(pushPoint);
  segments.forEach((s) => {
    pushPoint(s.a);
    pushPoint(s.b);
  });
  lines.forEach((l) => pushPoint(l.origin));
  planes.forEach((p) => pushPoint(p.point));
  triangles.forEach((t) => {
    pushPoint(t.a);
    pushPoint(t.b);
    pushPoint(t.c);
  });
  polygons.forEach((p) => p.vertices.forEach(pushPoint));
  polyhedra.forEach((p) => p.faces.forEach((f) => f.vertices.forEach(pushPoint)));

  const bounds = boundsFromPoints(allPoints);
  const diag = diagFromBounds(bounds);
  const defaultLineLength = opts.defaultLineLength ?? (diag > 0 ? diag * 1.4 : 4);
  const defaultPlaneSize = opts.defaultPlaneSize ?? (diag > 0 ? diag * 0.9 : 3);

  const planePolys: Polygon3[] = [];
  planes.forEach((plane) => {
    const poly = planeToPolygon(plane, plane.size ?? defaultPlaneSize);
    if (poly) planePolys.push(poly);
  });

  const edgeSegments: Segment3[] = [];
  if (opts.emitEdges !== false) {
    triangles.forEach((t) => {
      edgeSegments.push({ a: t.a, b: t.b, color: t.color, opacity: t.opacity });
      edgeSegments.push({ a: t.b, b: t.c, color: t.color, opacity: t.opacity });
      edgeSegments.push({ a: t.c, b: t.a, color: t.color, opacity: t.opacity });
    });

    polygons.forEach((p) => edgeSegments.push(...polygonEdges(p)));
    polyhedra.forEach((p) => p.faces.forEach((f) => edgeSegments.push(...polygonEdges(f))));
    planePolys.forEach((p) => edgeSegments.push(...polygonEdges(p)));
  }

  const facePolys: Polygon3[] = [...polygons, ...planePolys];
  polyhedra.forEach((p) => facePolys.push(...p.faces));

  const meshTriangles: Triangle3[] = [...triangles];
  facePolys.forEach((p) => meshTriangles.push(...triangulatePolygon(p)));

  const positions: number[] = [];
  for (const tri of meshTriangles) {
    positions.push(tri.a.x, tri.a.y, tri.a.z);
    positions.push(tri.b.x, tri.b.y, tri.b.z);
    positions.push(tri.c.x, tri.c.y, tri.c.z);
  }

  let mesh: SurfaceMeshData | null = null;
  if (positions.length >= 9) {
    const base: SurfaceMeshData = {
      label: opts.label ?? "Geometry",
      positions: Float32Array.from(positions),
      indices: null,
      source: { kind: "polyhedronPreset", label: opts.label ?? "Geometry" },
    };
    mesh = computeVertexNormals(base);
  }

  const lineGroups = new Map<string, OverlayPolylineGroup>();
  const addLine = (segment: Segment3, fallbackColor: number) => {
    const a = segment.a;
    const b = segment.b;
    if (!isFiniteVec3(a) || !isFiniteVec3(b)) return;
    const color = segment.color ?? fallbackColor;
    const opacity = segment.opacity;
    const radiusScale = segment.radiusScale;
    const key = `${color}|${opacity ?? ""}|${radiusScale ?? ""}`;
    let group = lineGroups.get(key);
    if (!group) {
      group = { lines: [] as PolylineSet, color, opacity, radiusScale };
      lineGroups.set(key, group);
    }
    group.lines.push([a, b]);
  };

  const seenEdges = new Set<string>();
  const addUniqueEdge = (segment: Segment3, fallbackColor: number) => {
    const key = edgeKey(segment.a, segment.b);
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    addLine(segment, fallbackColor);
  };

  segments.forEach((s) => addLine(s, opts.defaultLineColor ?? DEFAULT_LINE_COLOR));
  edgeSegments.forEach((s) => addUniqueEdge(s, opts.defaultLineColor ?? DEFAULT_LINE_COLOR));

  lines.forEach((line) => {
    const seg = lineToSegment(line, defaultLineLength);
    if (seg) addLine(seg, opts.defaultLineColor ?? DEFAULT_LINE_COLOR);
  });

  const pointGroups = new Map<string, OverlayPointSet>();
  const addPoint = (p: Point3, fallbackColor: number) => {
    if (!isFiniteVec3(p)) return;
    const color = p.color ?? fallbackColor;
    const size = p.size;
    const opacity = p.opacity;
    const key = `${color}|${size ?? ""}|${opacity ?? ""}`;
    let set = pointGroups.get(key);
    if (!set) {
      set = { points: [], color, size, opacity };
      pointGroups.set(key, set);
    }
    set.points.push({ x: p.x, y: p.y, z: p.z });
  };

  points.forEach((p) => addPoint(p, opts.defaultPointColor ?? DEFAULT_POINT_COLOR));

  return {
    mesh,
    overlayPointSets: Array.from(pointGroups.values()),
    overlayPolylineGroups: Array.from(lineGroups.values()),
  };
};
