import * as THREE from "three";
import type { Vec3 } from "./types";

export type GeometryObjectType = "sphere" | "box" | "cylinder" | "cone" | "torus" | "polyhedron";

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
};

export type GeometryObject = {
  id: string;
  type: GeometryObjectType;
  params: Record<string, number | boolean | string>;
  transform: GeometryObjectTransform;
  visible: boolean;
  material: GeometryObjectMaterial;
  name: string;
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
  { value: "bipyramid", label: "Bipyramid (n)" },
  { value: "antiprism", label: "Antiprism (n)" },
  { value: "geodesic", label: "Geodesic sphere (t)" },
];

export const POLYHEDRON_KIND_OPTIONS = polyhedronOptions;
export const POLYHEDRON_FAMILY_OPTIONS = polyhedronFamilyOptions;

const buildPrismGeometry = (n: number, radius: number, height: number) => {
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
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const x = Math.cos(t) * r;
    const y = Math.sin(t) * r;
    positions.push(x, y, h * 0.5);
  }
  const indices: number[] = [];
  for (let i = 1; i + 1 < sides; i++) {
    indices.push(0, i + 1, i);
  }
  const topOffset = sides;
  for (let i = 1; i + 1 < sides; i++) {
    indices.push(topOffset, topOffset + i, topOffset + i + 1);
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

const buildPyramidGeometry = (n: number, radius: number, height: number) => {
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
  for (let i = 1; i + 1 < sides; i++) {
    indices.push(0, i, i + 1);
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
    build: (params) =>
      new THREE.SphereGeometry(
        Number(params.radius ?? 1),
        Math.max(3, Math.round(Number(params.widthSegments ?? 32))),
        Math.max(2, Math.round(Number(params.heightSegments ?? 20)))
      ),
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
    defaultParams: { radius: 1, tube: 0.35, radialSegments: 24, tubularSegments: 96, arc: Math.PI * 2 },
    params: [
      { id: "radius", label: "Radius", kind: "number", min: 0.1, max: 10, step: 0.1 },
      { id: "tube", label: "Tube", kind: "number", min: 0.05, max: 5, step: 0.05 },
      { id: "radialSegments", label: "Radial segments", kind: "number", min: 3, max: 128, step: 1 },
      { id: "tubularSegments", label: "Tubular segments", kind: "number", min: 8, max: 256, step: 1 },
      { id: "arc", label: "Arc", kind: "number", min: 0.1, max: Math.PI * 2, step: 0.1 },
    ],
    build: (params) =>
      new THREE.TorusGeometry(
        Number(params.radius ?? 1),
        Number(params.tube ?? 0.35),
        Math.max(3, Math.round(Number(params.radialSegments ?? 24))),
        Math.max(8, Math.round(Number(params.tubularSegments ?? 96))),
        Number(params.arc ?? Math.PI * 2)
      ),
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
        return buildPrismGeometry(Number(params.n ?? 6), radius, Number(params.height ?? 1.6));
      }
      if (family === "pyramid") {
        return buildPyramidGeometry(Number(params.n ?? 6), radius, Number(params.height ?? 1.6));
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
    material: { color: 0x8aa4ff, opacity: 1 },
    name: entry.label,
  };
};
