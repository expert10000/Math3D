import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "./types";

export type GeometryObjectType =
  | "sphere"
  | "box"
  | "polygon"
  | "cylinder"
  | "cone"
  | "torus"
  | "plane"
  | "polyhedron"
  | "constructed";

export type GeometryParamDef = {
  id: string;
  label: string;
  kind: "number" | "toggle" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
};

export type GeometryObjectTransform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type GeometryObjectMaterial = {
  color?: number;
  opacity?: number;
  roughness?: number;
  metalness?: number;
};

export type GeometryObject = {
  id: string;
  type: GeometryObjectType;
  params: Record<string, number | boolean | string>;
  transform: GeometryObjectTransform;
  visible: boolean;
  material: GeometryObjectMaterial;
  name: string;
  group?: string;
};

export type GeometryObjectRegistryEntry = {
  type: GeometryObjectType;
  label: string;
  defaultParams: Record<string, number | boolean | string>;
  params: GeometryParamDef[];
  build: (params: Record<string, number | boolean | string>) => THREE.BufferGeometry;
};

const polyhedronOptions: Array<{ value: string; label: string }> = [
  { value: "tetra", label: "Tetrahedron" },
  { value: "cube", label: "Cube" },
  { value: "octa", label: "Octahedron" },
  { value: "dodeca", label: "Dodecahedron" },
  { value: "icosa", label: "Icosahedron" },
];

const polyhedronFamilyOptions: Array<{ value: string; label: string }> = [
  { value: "platonic", label: "Platonic" },
  { value: "prism", label: "Prism (n)" },
  { value: "pyramid", label: "Pyramid (n)" },
  { value: "frustum", label: "Frustum (n)" },
  { value: "bipyramid", label: "Bipyramid (n)" },
  { value: "antiprism", label: "Antiprism (n)" },
  { value: "geodesic", label: "Geodesic sphere (t)" },
];

const constructedKindOptions: Array<{ value: string; label: string }> = [
  { value: "curve-polyline", label: "Polyline" },
  { value: "curve-interpolation", label: "Interpolation curve" },
  { value: "curve-bezier", label: "Bézier curve" },
  { value: "curve-bspline", label: "B-spline curve" },
  { value: "curve-nurbs", label: "NURBS curve" },
  { value: "curve-helix", label: "Helix" },
  { value: "curve-composite", label: "Composite curve" },
  { value: "surface-ruled", label: "Ruled surface" },
  { value: "surface-extrude", label: "Extruded surface" },
  { value: "surface-revolve", label: "Revolved surface" },
  { value: "surface-sweep", label: "Swept surface" },
  { value: "surface-loft", label: "Lofted surface" },
  { value: "surface-bezier", label: "Bézier surface" },
  { value: "surface-bspline", label: "B-spline surface" },
  { value: "surface-nurbs", label: "NURBS surface" },
  { value: "surface-coons", label: "Coons patch" },
  { value: "solid-extrusion", label: "Extrusion solid" },
  { value: "solid-revolution", label: "Revolution solid" },
  { value: "solid-sweep", label: "Sweep solid" },
  { value: "solid-loft", label: "Loft solid" },
  { value: "derived-offset", label: "Offset" },
  { value: "derived-projection", label: "Projection" },
  { value: "derived-intersection", label: "Intersection" },
  { value: "derived-boundary", label: "Boundary" },
  { value: "derived-iso-curve", label: "Iso-curve" },
  { value: "derived-normal-curve", label: "Normal curve" },
  { value: "scratch-scene", label: "Scratch construction" },
];

const finiteParam = (params: Record<string, number | boolean | string>, key: string, fallback: number) => {
  const value = Number(params[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
};

const buildSampledSurfaceGeometry = (
  sample: (u: number, v: number) => THREE.Vector3,
  uSegments: number,
  vSegments: number,
  wrapU = false
) => {
  const uCount = Math.max(2, Math.round(uSegments));
  const vCount = Math.max(2, Math.round(vSegments));
  const positions: number[] = [];
  const indices: number[] = [];
  const columns = uCount + 1;
  for (let vIndex = 0; vIndex <= vCount; vIndex += 1) {
    const v = vIndex / vCount;
    for (let uIndex = 0; uIndex <= uCount; uIndex += 1) {
      const u = wrapU && uIndex === uCount ? 0 : uIndex / uCount;
      const point = sample(u, v);
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let vIndex = 0; vIndex < vCount; vIndex += 1) {
    for (let uIndex = 0; uIndex < uCount; uIndex += 1) {
      const a = vIndex * columns + uIndex;
      const b = a + 1;
      const c = a + columns + 1;
      const d = a + columns;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

class PiecewiseLinearCurve extends THREE.Curve<THREE.Vector3> {
  private readonly points: THREE.Vector3[];
  private readonly closed: boolean;

  constructor(points: THREE.Vector3[], closed: boolean) {
    super();
    this.points = points;
    this.closed = closed;
  }

  getPoint(t: number) {
    const spanCount = this.closed ? this.points.length : Math.max(1, this.points.length - 1);
    const scaled = Math.max(0, Math.min(1, t)) * spanCount;
    const index = Math.min(spanCount - 1, Math.floor(scaled));
    const local = scaled - index;
    const a = this.points[index % this.points.length];
    const b = this.points[(index + 1) % this.points.length] ?? a;
    return new THREE.Vector3().lerpVectors(a, b, local);
  }
}

const sampledCurve = (points: THREE.Vector3[], smooth: boolean, closed = false): THREE.Curve<THREE.Vector3> => {
  if (smooth) return new THREE.CatmullRomCurve3(points, closed, "centripetal", 0.45);
  return new PiecewiseLinearCurve(points, closed);
};

const buildCurveTube = (
  curve: THREE.Curve<THREE.Vector3>,
  segments: number,
  thickness: number,
  radialSegments: number,
  closed = false
) => new THREE.TubeGeometry(
  curve,
  Math.max(8, Math.round(segments)),
  Math.max(0.004, thickness),
  Math.max(3, Math.round(radialSegments)),
  closed
);

const orientGeometryYAxis = (geometry: THREE.BufferGeometry, direction: THREE.Vector3) => {
  const normalized = direction.clone().normalize();
  if (normalized.lengthSq() < 1e-12) return geometry;
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalized);
  geometry.applyQuaternion(quaternion);
  return geometry;
};

const buildScratchSceneGeometry = (payload: string, thickness: number): THREE.BufferGeometry => {
  type ScratchPoint = { x?: unknown; y?: unknown; z?: unknown; size?: unknown };
  type ScratchSegment = { a?: ScratchPoint; b?: ScratchPoint; radiusScale?: unknown };
  type ScratchLine = { origin?: ScratchPoint; direction?: ScratchPoint; length?: unknown; radiusScale?: unknown };
  const components: THREE.BufferGeometry[] = [];
  const toVector = (point: ScratchPoint | undefined) => new THREE.Vector3(
    Number(point?.x ?? 0),
    Number(point?.y ?? 0),
    Number(point?.z ?? 0)
  );
  const appendSegment = (aValue: ScratchPoint | undefined, bValue: ScratchPoint | undefined, radiusScale = 1) => {
    const a = toVector(aValue);
    const b = toVector(bValue);
    const direction = b.clone().sub(a);
    const length = direction.length();
    if (!Number.isFinite(length) || length < 1e-8) return;
    const cylinder = new THREE.CylinderGeometry(
      Math.max(0.003, thickness * radiusScale),
      Math.max(0.003, thickness * radiusScale),
      length,
      6,
      1,
      false
    );
    orientGeometryYAxis(cylinder, direction);
    cylinder.translate((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
    components.push(cylinder);
  };
  try {
    const scene = JSON.parse(payload) as {
      points?: ScratchPoint[];
      segments?: ScratchSegment[];
      lines?: ScratchLine[];
    };
    for (const point of scene.points ?? []) {
      const radius = Math.max(0.015, Number(point.size ?? thickness * 1.7));
      const sphere = new THREE.SphereGeometry(radius, 10, 7);
      const position = toVector(point);
      sphere.translate(position.x, position.y, position.z);
      components.push(sphere);
    }
    for (const segment of scene.segments ?? []) {
      appendSegment(segment.a, segment.b, Number(segment.radiusScale ?? 1));
    }
    for (const line of scene.lines ?? []) {
      const origin = toVector(line.origin);
      const direction = toVector(line.direction).normalize();
      const length = Math.max(0.1, Number(line.length ?? 4));
      const half = direction.clone().multiplyScalar(length * 0.5);
      appendSegment(
        { x: origin.x - half.x, y: origin.y - half.y, z: origin.z - half.z },
        { x: origin.x + half.x, y: origin.y + half.y, z: origin.z + half.z },
        Number(line.radiusScale ?? 1)
      );
    }
  } catch {
    return new THREE.BoxGeometry(0.2, 0.2, 0.2);
  }
  if (!components.length) return new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const merged = mergeGeometries(components, false);
  for (const component of components) component.dispose();
  return merged ?? new THREE.BoxGeometry(0.2, 0.2, 0.2);
};

const buildConstructedGeometry = (params: Record<string, number | boolean | string>): THREE.BufferGeometry => {
  const kind = String(params.constructionKind ?? "curve-polyline");
  const size = Math.max(0.05, finiteParam(params, "size", 1.4));
  const secondary = Math.max(0.02, finiteParam(params, "secondarySize", 0.75));
  const height = Math.max(0.05, finiteParam(params, "height", 1.8));
  const thickness = Math.max(0.004, finiteParam(params, "thickness", 0.035));
  const segments = Math.max(8, Math.round(finiteParam(params, "segments", 48)));
  const radialSegments = Math.max(3, Math.round(finiteParam(params, "radialSegments", 7)));
  const turns = Math.max(0.25, finiteParam(params, "turns", 2.5));
  const offset = finiteParam(params, "offset", 0.2);
  const wavePoints = [
    new THREE.Vector3(-size, -secondary * 0.55, 0),
    new THREE.Vector3(-size * 0.35, secondary, secondary * 0.35),
    new THREE.Vector3(size * 0.3, -secondary, -secondary * 0.25),
    new THREE.Vector3(size, secondary * 0.55, secondary * 0.2),
  ];

  if (kind === "scratch-scene") {
    return buildScratchSceneGeometry(String(params.sourcePayload ?? "{}"), thickness);
  }

  if (kind === "curve-bezier") {
    return buildCurveTube(
      new THREE.CubicBezierCurve3(wavePoints[0], wavePoints[1], wavePoints[2], wavePoints[3]),
      segments,
      thickness,
      radialSegments
    );
  }
  if (kind === "curve-helix") {
    const points = Array.from({ length: segments + 1 }, (_, index) => {
      const t = index / segments;
      const angle = t * Math.PI * 2 * turns;
      return new THREE.Vector3(Math.cos(angle) * secondary, Math.sin(angle) * secondary, (t - 0.5) * height);
    });
    return buildCurveTube(sampledCurve(points, true), segments, thickness, radialSegments);
  }
  if (kind === "curve-composite") {
    const points = [...wavePoints, new THREE.Vector3(size * 1.25, 0, secondary), new THREE.Vector3(size * 1.6, secondary * 0.2, 0)];
    return buildCurveTube(sampledCurve(points, false), segments, thickness, radialSegments);
  }
  if (["curve-polyline", "curve-interpolation", "curve-bspline", "curve-nurbs"].includes(kind)) {
    return buildCurveTube(
      sampledCurve(wavePoints, kind !== "curve-polyline"),
      segments,
      thickness,
      radialSegments
    );
  }

  if (kind === "surface-sweep") {
    return buildCurveTube(sampledCurve(wavePoints, true), segments, secondary * 0.18, radialSegments);
  }
  if (kind === "solid-sweep") {
    const profile = new THREE.Shape();
    profile.absarc(0, 0, secondary * 0.32, 0, Math.PI * 2, false);
    return new THREE.ExtrudeGeometry(profile, {
      steps: segments,
      bevelEnabled: false,
      extrudePath: sampledCurve(wavePoints, true),
    });
  }
  if (kind === "solid-extrusion") {
    const shape = new THREE.Shape();
    shape.moveTo(-size * 0.65, -secondary * 0.55);
    shape.lineTo(size * 0.65, -secondary * 0.55);
    shape.lineTo(size * 0.85, secondary * 0.55);
    shape.lineTo(-size * 0.45, secondary * 0.8);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      steps: Math.max(1, Math.round(segments / 12)),
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -height * 0.5);
    return geometry;
  }
  if (kind === "solid-revolution") {
    const profileCount = Math.max(6, Math.round(segments / 4));
    const profile = Array.from({ length: profileCount }, (_, index) => {
      const t = index / Math.max(1, profileCount - 1);
      return new THREE.Vector2(secondary * Math.max(0.001, Math.sin(Math.PI * t)), (t - 0.5) * height);
    });
    return new THREE.LatheGeometry(profile, segments);
  }
  if (kind === "solid-loft") {
    const geometry = new THREE.CylinderGeometry(
      size * 0.5,
      size * 0.35,
      height,
      segments,
      Math.max(3, Math.round(segments / 4)),
      false
    );
    geometry.scale(1, 1, 0.72);
    return geometry;
  }

  if (kind === "derived-boundary") {
    const points = [
      new THREE.Vector3(-size, -secondary, 0),
      new THREE.Vector3(size, -secondary, 0),
      new THREE.Vector3(size, secondary, 0),
      new THREE.Vector3(-size, secondary, 0),
    ];
    return buildCurveTube(sampledCurve(points, false, true), segments, thickness, radialSegments, true);
  }
  if (["derived-projection", "derived-intersection", "derived-iso-curve", "derived-normal-curve"].includes(kind)) {
    const points = wavePoints.map((point, index) => {
      if (kind === "derived-projection") return new THREE.Vector3(point.x, point.y, 0);
      if (kind === "derived-intersection") return new THREE.Vector3(point.x, Math.sin(index * 1.7) * secondary * 0.35, point.z);
      if (kind === "derived-iso-curve") return new THREE.Vector3(point.x, point.y * 0.45, Math.sin(point.x * 2) * secondary * 0.25);
      return new THREE.Vector3(point.x, point.y * 0.25, point.z + index * secondary * 0.28);
    });
    return buildCurveTube(sampledCurve(points, true), segments, thickness, radialSegments);
  }

  return buildSampledSurfaceGeometry((u, v) => {
    const x = (u - 0.5) * size * 2;
    const y = (v - 0.5) * secondary * 2;
    if (kind === "surface-revolve") {
      const angle = u * Math.PI * 2;
      const radius = size * (0.45 + 0.18 * Math.sin(Math.PI * v));
      return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, (v - 0.5) * height);
    }
    if (kind === "surface-loft") {
      const angle = u * Math.PI * 2;
      const radius = size * (0.35 + 0.18 * v);
      return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * (0.7 + 0.2 * v), (v - 0.5) * height);
    }
    if (kind === "surface-ruled") {
      return new THREE.Vector3(x, y, (1 - v) * Math.sin(u * Math.PI * 2) * secondary * 0.35 + v * Math.cos(u * Math.PI * 2) * secondary * 0.35);
    }
    if (kind === "surface-extrude") {
      return new THREE.Vector3(x, y, Math.sin(u * Math.PI * 2) * secondary * 0.35);
    }
    if (kind === "surface-coons") {
      return new THREE.Vector3(x + (v - 0.5) * secondary * 0.35, y, Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * secondary);
    }
    if (kind === "derived-offset") {
      return new THREE.Vector3(x, y, Math.sin(Math.PI * u) * Math.cos(Math.PI * v) * secondary * 0.4 + offset);
    }
    const amplitude = kind === "surface-nurbs" ? 0.75 : kind === "surface-bspline" ? 0.55 : 0.9;
    return new THREE.Vector3(x, y, Math.sin(Math.PI * u) * Math.cos(Math.PI * v) * secondary * amplitude);
  }, segments, Math.max(8, Math.round(segments / 2)), kind === "surface-revolve" || kind === "surface-loft");
};

export const POLYHEDRON_KIND_OPTIONS = polyhedronOptions;
export const POLYHEDRON_FAMILY_OPTIONS = polyhedronFamilyOptions;

const buildPrismGeometry = (n: number, radius: number, height: number, twistAngleDeg = 0, cap = true) => {
  return buildFrustumGeometry(n, radius, radius, height, twistAngleDeg, cap);
};

const buildFrustumGeometry = (
  n: number,
  baseRadius: number,
  topRadius: number,
  height: number,
  twistAngleDeg = 0,
  cap = true
) => {
  const sides = Math.max(3, Math.round(n));
  const h = Math.max(1e-6, height);
  const rBase = Math.max(0, baseRadius);
  const rTop = Math.max(0, topRadius);
  const twist = (Number.isFinite(twistAngleDeg) ? twistAngleDeg : 0) * (Math.PI / 180);
  if (rTop <= 1e-6) {
    return buildPyramidGeometry(sides, Math.max(1e-6, rBase), h, cap);
  }
  if (rBase <= 1e-6) {
    const geom = buildPyramidGeometry(sides, Math.max(1e-6, rTop), h, cap);
    geom.rotateX(Math.PI);
    return geom;
  }
  const positions: number[] = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const x = Math.cos(t) * rBase;
    const y = Math.sin(t) * rBase;
    positions.push(x, y, -h * 0.5);
  }
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2 + twist;
    const x = Math.cos(t) * rTop;
    const y = Math.sin(t) * rTop;
    positions.push(x, y, h * 0.5);
  }
  const indices: number[] = [];
  if (cap) {
    for (let i = 1; i + 1 < sides; i++) {
      indices.push(0, i + 1, i);
    }
  }
  const topOffset = sides;
  if (cap) {
    for (let i = 1; i + 1 < sides; i++) {
      indices.push(topOffset, topOffset + i, topOffset + i + 1);
    }
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const a = i;
    const b = j;
    const c = topOffset + j;
    const d = topOffset + i;
    indices.push(a, b, c);
    indices.push(a, c, d);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  return geom;
};

const buildPyramidGeometry = (n: number, radius: number, height: number, cap = true) => {
  const sides = Math.max(3, Math.round(n));
  const h = Math.max(1e-6, height);
  const r = Math.max(1e-6, radius);
  const positions: number[] = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    positions.push(x, y, -h * 0.5);
  }
  const apexIndex = positions.length / 3;
  positions.push(0, 0, h * 0.5);
  const indices: number[] = [];
  if (cap) {
    for (let i = 1; i + 1 < sides; i++) {
      indices.push(0, i, i + 1);
    }
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    indices.push(i, j, apexIndex);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  return geom;
};

const buildBipyramidGeometry = (n: number, radius: number, height: number) => {
  const sides = Math.max(3, Math.round(n));
  const h = Math.max(1e-6, height);
  const r = Math.max(1e-6, radius);
  const positions: number[] = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    positions.push(x, y, 0);
  }
  const topIndex = positions.length / 3;
  positions.push(0, 0, h * 0.5);
  const bottomIndex = positions.length / 3;
  positions.push(0, 0, -h * 0.5);
  const indices: number[] = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    indices.push(i, j, topIndex);
    indices.push(j, i, bottomIndex);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  return geom;
};

const buildAntiprismGeometry = (n: number, radius: number, height: number) => {
  const sides = Math.max(3, Math.round(n));
  const h = Math.max(1e-6, height);
  const r = Math.max(1e-6, radius);
  const positions: number[] = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    positions.push(x, y, -h * 0.5);
  }
  const topOffset = positions.length / 3;
  for (let i = 0; i < sides; i++) {
    const t = ((i + 0.5) / sides) * Math.PI * 2;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    positions.push(x, y, h * 0.5);
  }
  const indices: number[] = [];
  for (let i = 1; i + 1 < sides; i++) {
    indices.push(0, i + 1, i);
  }
  for (let i = 1; i + 1 < sides; i++) {
    indices.push(topOffset, topOffset + i, topOffset + i + 1);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const a = i;
    const b = j;
    const c = topOffset + i;
    const d = topOffset + j;
    indices.push(a, b, c);
    indices.push(b, d, c);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  return geom;
};

const buildGeodesicGeometry = (freq: number, radius: number) => {
  const t = Math.max(1, Math.round(freq));
  const r = Math.max(1e-6, radius);
  const phi = (1 + Math.sqrt(5)) / 2;
  const baseVerts: Array<[number, number, number]> = [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ];
  const baseFaces: Array<[number, number, number]> = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const positions: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<string, number>();

  const addVertex = (x: number, y: number, z: number) => {
    const len = Math.hypot(x, y, z) || 1;
    const nx = (x / len) * r;
    const ny = (y / len) * r;
    const nz = (z / len) * r;
    const key = `${nx.toFixed(6)},${ny.toFixed(6)},${nz.toFixed(6)}`;
    const existing = vertexMap.get(key);
    if (existing != null) return existing;
    const idx = positions.length / 3;
    positions.push(nx, ny, nz);
    vertexMap.set(key, idx);
    return idx;
  };

  for (const face of baseFaces) {
    const a = baseVerts[face[0]];
    const b = baseVerts[face[1]];
    const c = baseVerts[face[2]];
    const rows: number[][] = [];
    for (let i = 0; i <= t; i++) {
      const row: number[] = [];
      for (let j = 0; j <= t - i; j++) {
        const k = t - i - j;
        const x = (a[0] * i + b[0] * j + c[0] * k) / t;
        const y = (a[1] * i + b[1] * j + c[1] * k) / t;
        const z = (a[2] * i + b[2] * j + c[2] * k) / t;
        row.push(addVertex(x, y, z));
      }
      rows.push(row);
    }
    for (let i = 0; i < t; i++) {
      for (let j = 0; j < t - i; j++) {
        const v0 = rows[i][j];
        const v1 = rows[i + 1][j];
        const v2 = rows[i][j + 1];
        indices.push(v0, v1, v2);
        if (j + 1 <= t - i - 1) {
          const v3 = rows[i + 1][j + 1];
          indices.push(v1, v3, v2);
        }
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  return geom;
};

export const GEOMETRY_OBJECT_REGISTRY: Record<GeometryObjectType, GeometryObjectRegistryEntry> = {
  sphere: {
    type: "sphere",
    label: "Sphere",
    defaultParams: { radius: 1, widthSegments: 32, heightSegments: 20 },
    params: [
      { id: "radius", label: "Radius", kind: "number", min: 0.1, max: 10, step: 0.1 },
      { id: "widthSegments", label: "Width segments", kind: "number", min: 3, max: 128, step: 1 },
      { id: "heightSegments", label: "Height segments", kind: "number", min: 2, max: 128, step: 1 },
    ],
    build: (params) => {
      const geometry = new THREE.SphereGeometry(
        Number(params.radius ?? 1),
        Math.max(3, Math.round(Number(params.widthSegments ?? 32))),
        Math.max(2, Math.round(Number(params.heightSegments ?? 20)))
      );
      geometry.deleteAttribute("normal");
      geometry.deleteAttribute("uv");
      const welded = mergeVertices(geometry, 1e-8);
      welded.computeVertexNormals();
      return welded;
    },
  },
  box: {
    type: "box",
    label: "Box",
    defaultParams: { width: 1.6, height: 1.2, depth: 1, widthSegments: 1, heightSegments: 1, depthSegments: 1 },
    params: [
      { id: "width", label: "Width", kind: "number", min: 0.1, max: 10, step: 0.1 },
      { id: "height", label: "Height", kind: "number", min: 0.1, max: 10, step: 0.1 },
      { id: "depth", label: "Depth", kind: "number", min: 0.1, max: 10, step: 0.1 },
      { id: "widthSegments", label: "Width segments", kind: "number", min: 1, max: 64, step: 1 },
      { id: "heightSegments", label: "Height segments", kind: "number", min: 1, max: 64, step: 1 },
      { id: "depthSegments", label: "Depth segments", kind: "number", min: 1, max: 64, step: 1 },
    ],
    build: (params) =>
      new THREE.BoxGeometry(
        Number(params.width ?? 1),
        Number(params.height ?? 1),
        Number(params.depth ?? 1),
        Math.max(1, Math.round(Number(params.widthSegments ?? 1))),
        Math.max(1, Math.round(Number(params.heightSegments ?? 1))),
        Math.max(1, Math.round(Number(params.depthSegments ?? 1)))
      ),
  },
  polygon: {
    type: "polygon",
    label: "Polygon",
    defaultParams: { radius: 1.2, sides: 6, thetaStart: 0, thetaLength: Math.PI * 2 },
    params: [
      { id: "radius", label: "Radius", kind: "number", min: 0.1, max: 10, step: 0.1 },
      { id: "sides", label: "Sides", kind: "number", min: 3, max: 24, step: 1 },
      { id: "thetaStart", label: "Start angle", kind: "number", min: -Math.PI * 2, max: Math.PI * 2, step: 0.1 },
      { id: "thetaLength", label: "Arc length", kind: "number", min: 0.1, max: Math.PI * 2, step: 0.1 },
    ],
    build: (params) =>
      new THREE.CircleGeometry(
        Number(params.radius ?? 1.2),
        Math.max(3, Math.round(Number(params.sides ?? 6))),
        Number(params.thetaStart ?? 0),
        Math.max(0.1, Math.min(Math.PI * 2, Number(params.thetaLength ?? Math.PI * 2)))
      ),
  },
  cylinder: {
    type: "cylinder",
    label: "Cylinder",
    defaultParams: { radiusTop: 1, radiusBottom: 1, height: 2, radialSegments: 24, heightSegments: 1, openEnded: false },
    params: [
      { id: "radiusTop", label: "Radius top", kind: "number", min: 0, max: 10, step: 0.1 },
      { id: "radiusBottom", label: "Radius bottom", kind: "number", min: 0, max: 10, step: 0.1 },
      { id: "height", label: "Height", kind: "number", min: 0.1, max: 20, step: 0.1 },
      { id: "radialSegments", label: "Radial segments", kind: "number", min: 3, max: 128, step: 1 },
      { id: "heightSegments", label: "Height segments", kind: "number", min: 1, max: 64, step: 1 },
      { id: "openEnded", label: "Open ended", kind: "toggle" },
    ],
    build: (params) =>
      new THREE.CylinderGeometry(
        Number(params.radiusTop ?? 1),
        Number(params.radiusBottom ?? 1),
        Number(params.height ?? 2),
        Math.max(3, Math.round(Number(params.radialSegments ?? 24))),
        Math.max(1, Math.round(Number(params.heightSegments ?? 1))),
        Boolean(params.openEnded)
      ),
  },
  cone: {
    type: "cone",
    label: "Cone",
    defaultParams: { radius: 1, height: 2, radialSegments: 24, heightSegments: 1, openEnded: false },
    params: [
      { id: "radius", label: "Radius", kind: "number", min: 0.1, max: 10, step: 0.1 },
      { id: "height", label: "Height", kind: "number", min: 0.1, max: 20, step: 0.1 },
      { id: "radialSegments", label: "Radial segments", kind: "number", min: 3, max: 128, step: 1 },
      { id: "heightSegments", label: "Height segments", kind: "number", min: 1, max: 64, step: 1 },
      { id: "openEnded", label: "Open ended", kind: "toggle" },
    ],
    build: (params) =>
      new THREE.ConeGeometry(
        Number(params.radius ?? 1),
        Number(params.height ?? 2),
        Math.max(3, Math.round(Number(params.radialSegments ?? 24))),
        Math.max(1, Math.round(Number(params.heightSegments ?? 1))),
        Boolean(params.openEnded)
      ),
  },
  torus: {
    type: "torus",
    label: "Torus",
    defaultParams: { radius: 1, tube: 0.35, radialSegments: 12, tubularSegments: 48, arc: Math.PI * 2 },
    params: [
      { id: "radius", label: "Radius", kind: "number", min: 0.1, max: 10, step: 0.1 },
      { id: "tube", label: "Tube", kind: "number", min: 0.05, max: 5, step: 0.05 },
      { id: "radialSegments", label: "Radial segments", kind: "number", min: 3, max: 40, step: 1 },
      { id: "tubularSegments", label: "Tubular segments", kind: "number", min: 8, max: 96, step: 1 },
      { id: "arc", label: "Arc", kind: "number", min: 0.1, max: Math.PI * 2, step: 0.1 },
    ],
    build: (params) =>
      new THREE.TorusGeometry(
        Number(params.radius ?? 1),
        Number(params.tube ?? 0.35),
        Math.min(40, Math.max(3, Math.round(Number(params.radialSegments ?? 12)))),
        Math.min(96, Math.max(8, Math.round(Number(params.tubularSegments ?? 48)))),
        Number(params.arc ?? Math.PI * 2)
      ),
  },
  plane: {
    type: "plane",
    label: "Plane",
    defaultParams: {
      width: 2,
      height: 2,
      widthSegments: 1,
      heightSegments: 1,
      axis: "xy",
    },
    params: [
      { id: "width", label: "Width", kind: "number", min: 0.1, max: 20, step: 0.1 },
      { id: "height", label: "Height", kind: "number", min: 0.1, max: 20, step: 0.1 },
      { id: "widthSegments", label: "Width segments", kind: "number", min: 1, max: 128, step: 1 },
      { id: "heightSegments", label: "Height segments", kind: "number", min: 1, max: 128, step: 1 },
      {
        id: "axis",
        label: "Orientation",
        kind: "select",
        options: [
          { value: "xy", label: "XY" },
          { value: "xz", label: "XZ" },
          { value: "yz", label: "YZ" },
        ],
      },
    ],
    build: (params) => {
      const width = Number(params.width ?? 2);
      const height = Number(params.height ?? 2);
      const widthSegments = Math.max(1, Math.round(Number(params.widthSegments ?? 1)));
      const heightSegments = Math.max(1, Math.round(Number(params.heightSegments ?? 1)));
      const axis = String(params.axis ?? "xy");
      const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
      if (axis === "xz") {
        geometry.rotateX(-Math.PI * 0.5);
      } else if (axis === "yz") {
        geometry.rotateY(Math.PI * 0.5);
      }
      return geometry;
    },
  },
  polyhedron: {
    type: "polyhedron",
    label: "Polyhedron",
    defaultParams: {
      family: "platonic",
      kind: "dodeca",
      n: 6,
      height: 1.6,
      radius: 1,
      topRadius: 0.55,
      twistAngle: 0,
      cap: true,
      subdivision: 0,
      frequency: 2,
      triangulate: true,
      smoothNormals: true,
      edgeDisplay: false,
    },
    params: [
      { id: "family", label: "Family", kind: "select", options: polyhedronFamilyOptions },
    ],
    build: (params) => {
      const family = String(params.family ?? "platonic");
      const radius = Number(params.radius ?? 1);
      if (family === "prism") {
        return buildPrismGeometry(
          Number(params.n ?? 6),
          radius,
          Number(params.height ?? 1.6),
          Number(params.twistAngle ?? 0),
          Boolean(params.cap ?? true)
        );
      }
      if (family === "pyramid") {
        return buildPyramidGeometry(Number(params.n ?? 6), radius, Number(params.height ?? 1.6), Boolean(params.cap ?? true));
      }
      if (family === "frustum") {
        return buildFrustumGeometry(
          Number(params.n ?? 6),
          radius,
          Number(params.topRadius ?? 0.55),
          Number(params.height ?? 1.6),
          Number(params.twistAngle ?? 0),
          Boolean(params.cap ?? true)
        );
      }
      if (family === "bipyramid") {
        return buildBipyramidGeometry(Number(params.n ?? 6), radius, Number(params.height ?? 1.6));
      }
      if (family === "antiprism") {
        return buildAntiprismGeometry(Number(params.n ?? 6), radius, Number(params.height ?? 1.6));
      }
      if (family === "geodesic") {
        return buildGeodesicGeometry(Number(params.frequency ?? 2), radius);
      }
      const kind = String(params.kind ?? "dodeca");
      const subdivision = Math.max(0, Math.min(5, Math.round(Number(params.subdivision ?? 0))));
      if (kind === "tetra") return new THREE.TetrahedronGeometry(radius, subdivision);
      if (kind === "cube") {
        const seg = Math.max(1, Math.pow(2, subdivision));
        return new THREE.BoxGeometry(radius * 1.6, radius * 1.6, radius * 1.6, seg, seg, seg);
      }
      if (kind === "octa") return new THREE.OctahedronGeometry(radius, subdivision);
      if (kind === "icosa") return new THREE.IcosahedronGeometry(radius, subdivision);
      return new THREE.DodecahedronGeometry(radius, subdivision);
    },
  },
  constructed: {
    type: "constructed",
    label: "Constructed geometry",
    defaultParams: {
      constructionKind: "curve-polyline",
      constructionFamily: "Curves",
      authoringSource: "professional-construct",
      sourceObjectIds: "",
      sourceEntityIds: "",
      sourcePayload: "{}",
      size: 1.4,
      secondarySize: 0.75,
      height: 1.8,
      thickness: 0.035,
      offset: 0.2,
      turns: 2.5,
      segments: 48,
      radialSegments: 7,
      degree: 3,
      closed: false,
    },
    params: [
      { id: "constructionKind", label: "Construction type", kind: "select", options: constructedKindOptions },
      { id: "size", label: "Size", kind: "number", min: 0.05, max: 20, step: 0.05 },
      { id: "secondarySize", label: "Secondary size", kind: "number", min: 0.02, max: 20, step: 0.05 },
      { id: "height", label: "Height", kind: "number", min: 0.05, max: 30, step: 0.05 },
      { id: "thickness", label: "Curve thickness", kind: "number", min: 0.004, max: 1, step: 0.005 },
      { id: "offset", label: "Offset", kind: "number", min: -10, max: 10, step: 0.05 },
      { id: "turns", label: "Turns", kind: "number", min: 0.25, max: 20, step: 0.25 },
      { id: "segments", label: "Segments", kind: "number", min: 8, max: 256, step: 1 },
      { id: "radialSegments", label: "Radial segments", kind: "number", min: 3, max: 32, step: 1 },
      { id: "degree", label: "Degree", kind: "number", min: 1, max: 7, step: 1 },
      { id: "closed", label: "Closed", kind: "toggle" },
    ],
    build: buildConstructedGeometry,
  },
};

export const GEOMETRY_OBJECT_TYPES = Object.keys(GEOMETRY_OBJECT_REGISTRY) as GeometryObjectType[];

const DEFAULT_TRANSFORM: GeometryObjectTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

export const createGeometryObject = (type: GeometryObjectType, id: string): GeometryObject => {
  const entry = GEOMETRY_OBJECT_REGISTRY[type];
  return {
    id,
    type,
    params: { ...entry.defaultParams },
    transform: {
      position: { ...DEFAULT_TRANSFORM.position },
      rotation: { ...DEFAULT_TRANSFORM.rotation },
      scale: { ...DEFAULT_TRANSFORM.scale },
    },
    visible: true,
    material: { color: 0x8aa4ff, opacity: 1, roughness: 0.3, metalness: 0.1 },
    name: entry.label,
    group: "default",
  };
};
