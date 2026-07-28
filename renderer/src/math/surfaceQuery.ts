import * as THREE from "three";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { SurfaceScalarField, SurfaceVectorField } from "../scene/datasets";
import { computeVertexNormals } from "../mesh/meshOps";
import type { ParamGeodesicDomain, ParamSurfaceFunc } from "./paramGeodesicContinuous";

export type Vec3 = { x: number; y: number; z: number };

export type SurfaceQueryMetric = { E: number; F: number; G: number };

export type SurfaceQuerySample = {
  point: Vec3;
  du: Vec3;
  dv: Vec3;
  normal: Vec3;
  metric: SurfaceQueryMetric;
  areaElem: number;
};

export type SurfaceQueryTangentBasis = {
  tangentU: Vec3;
  tangentV: Vec3;
  normal: Vec3;
};

export type SurfaceQueryChartCoord = {
  u: number;
  v: number;
  valid: boolean;
  kind: "xy" | "uv" | "local";
};

export type SurfaceQueryNeighborhood = {
  origin: Vec3;
  normal: Vec3;
  tangentU: Vec3;
  tangentV: Vec3;
  neighbors?: number[];
  vertexIndex?: number;
};

export type SurfaceQueryPick = {
  point: Vec3;
  uv?: { u: number; v: number };
  xy?: { x: number; y: number };
  vertexIndex?: number;
};

export type SurfaceQueryKind = "graph" | "implicit" | "param" | "weierstrass" | "mesh";

export type SurfaceQuery = {
  kind: SurfaceQueryKind;
  sampleAt: (pick: SurfaceQueryPick) => SurfaceQuerySample | null;
  neighborhood: (pick: SurfaceQueryPick) => SurfaceQueryNeighborhood | null;
  tangentBasis: (pick: SurfaceQueryPick) => SurfaceQueryTangentBasis | null;
  projectToChart: (pick: SurfaceQueryPick) => SurfaceQueryChartCoord | null;
  scalarField?: (name: string) => SurfaceScalarField | null;
  vectorField?: (name: string) => SurfaceVectorField | null;
};

const vLen = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const vDot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const vScale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const vSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vCross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const vNormalize = (v: Vec3): Vec3 => {
  const len = vLen(v);
  return len > 1e-12 ? vScale(v, 1 / len) : { x: 0, y: 0, z: 0 };
};

const buildOrthoBasis = (normal: Vec3): { t1: Vec3; t2: Vec3 } => {
  const n = vNormalize(normal);
  const ref = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const t1 = vNormalize(vCross(ref, n));
  const t2 = vNormalize(vCross(n, t1));
  return { t1, t2 };
};

export function sampleGraphAt(opts: {
  f: (x: number, y: number) => number;
  x: number;
  y: number;
  h?: number;
}): SurfaceQuerySample | null {
  const { f, x, y } = opts;
  const h = opts.h ?? 1e-3;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(h) || h <= 0) return null;

  const z = f(x, y);
  if (!Number.isFinite(z)) return null;

  const fx = (f(x + h, y) - f(x - h, y)) / (2 * h);
  const fy = (f(x, y + h) - f(x, y - h)) / (2 * h);
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return null;

  const du = { x: 1, y: fx, z: 0 };
  const dv = { x: 0, y: fy, z: 1 };
  const nRaw = vCross(du, dv);
  const areaElem = vLen(nRaw);
  if (!Number.isFinite(areaElem) || areaElem <= 1e-12) return null;

  const normal = vNormalize(nRaw);
  const E = vDot(du, du);
  const F = vDot(du, dv);
  const G = vDot(dv, dv);
  if (!Number.isFinite(E) || !Number.isFinite(F) || !Number.isFinite(G)) return null;

  return {
    point: { x, y: z, z: y },
    du,
    dv,
    normal,
    metric: { E, F, G },
    areaElem,
  };
}

export function sampleParamAt(opts: {
  paramFunc: ParamSurfaceFunc;
  u: number;
  v: number;
  domain: ParamGeodesicDomain;
  du?: number;
  dv?: number;
}): SurfaceQuerySample | null {
  const { paramFunc, u, v, domain } = opts;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  const uRange = domain.uMax - domain.uMin || 1;
  const vRange = domain.vMax - domain.vMin || 1;
  const du = opts.du ?? Math.max(1e-5, Math.abs(uRange) * 1e-3);
  const dv = opts.dv ?? Math.max(1e-5, Math.abs(vRange) * 1e-3);

  const clamp = (val: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, val));
  const evalParam = (uu: number, vv: number, target: THREE.Vector3) => {
    paramFunc(clamp(uu, domain.uMin, domain.uMax), clamp(vv, domain.vMin, domain.vMax), target);
    return target;
  };

  const p = new THREE.Vector3();
  const pu1 = new THREE.Vector3();
  const pu2 = new THREE.Vector3();
  const pv1 = new THREE.Vector3();
  const pv2 = new THREE.Vector3();

  evalParam(u, v, p);
  evalParam(u + du, v, pu1);
  evalParam(u - du, v, pu2);
  evalParam(u, v + dv, pv1);
  evalParam(u, v - dv, pv2);

  const ru = new THREE.Vector3().subVectors(pu1, pu2).multiplyScalar(0.5 / du);
  const rv = new THREE.Vector3().subVectors(pv1, pv2).multiplyScalar(0.5 / dv);

  const nRaw = new THREE.Vector3().crossVectors(ru, rv);
  const areaElem = nRaw.length();
  if (!Number.isFinite(areaElem) || areaElem <= 1e-12) return null;
  nRaw.multiplyScalar(1 / areaElem);

  const duVec = { x: ru.x, y: ru.y, z: ru.z };
  const dvVec = { x: rv.x, y: rv.y, z: rv.z };
  const E = vDot(duVec, duVec);
  const F = vDot(duVec, dvVec);
  const G = vDot(dvVec, dvVec);
  if (!Number.isFinite(E) || !Number.isFinite(F) || !Number.isFinite(G)) return null;

  return {
    point: { x: p.x, y: p.y, z: p.z },
    du: duVec,
    dv: dvVec,
    normal: { x: nRaw.x, y: nRaw.y, z: nRaw.z },
    metric: { E, F, G },
    areaElem,
  };
}

const readMeshVec = (arr: ArrayLike<number>, idx: number): Vec3 => ({
  x: arr[idx * 3],
  y: arr[idx * 3 + 1],
  z: arr[idx * 3 + 2],
});

const nearestVertexIndex = (mesh: SurfaceMeshData, point: Vec3): number | null => {
  const positions = mesh.positions;
  const count = Math.floor(positions.length / 3);
  if (!count) return null;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    const dx = positions[idx] - point.x;
    const dy = positions[idx + 1] - point.y;
    const dz = positions[idx + 2] - point.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestDist) {
      bestDist = d2;
      best = i;
    }
  }
  return best >= 0 ? best : null;
};

const resolveMeshNormal = (mesh: SurfaceMeshData, vertexIndex: number): Vec3 | null => {
  let normals = mesh.normals ?? null;
  if (!normals || normals.length < (vertexIndex + 1) * 3) {
    const withNormals = computeVertexNormals(mesh);
    normals = withNormals.normals ?? null;
  }
  if (!normals || normals.length < (vertexIndex + 1) * 3) return null;
  const normal = readMeshVec(normals, vertexIndex);
  if (!Number.isFinite(normal.x) || !Number.isFinite(normal.y) || !Number.isFinite(normal.z)) return null;
  return vNormalize(normal);
};

const resolveMeshFrame = (mesh: SurfaceMeshData, vertexIndex: number): SurfaceQueryNeighborhood | null => {
  const positions = mesh.positions;
  const count = Math.floor(positions.length / 3);
  if (!count || vertexIndex < 0 || vertexIndex >= count) return null;
  const origin = readMeshVec(positions, vertexIndex);
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) return null;

  let normal = resolveMeshNormal(mesh, vertexIndex);
  if (!normal) normal = { x: 0, y: 1, z: 0 };

  const neighbors = mesh.adjacency?.[vertexIndex] ?? [];
  let t1: Vec3 | null = null;
  for (const nIdx of neighbors) {
    if (!Number.isFinite(nIdx)) continue;
    if (nIdx < 0 || nIdx >= count) continue;
    const p = readMeshVec(positions, nIdx);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    const edge = vSub(p, origin);
    const proj = vSub(edge, vScale(normal, vDot(edge, normal)));
    const len = vLen(proj);
    if (len > 1e-8) {
      t1 = vScale(proj, 1 / len);
      break;
    }
  }

  if (!t1) {
    const basis = buildOrthoBasis(normal);
    t1 = basis.t1;
  }

  const t2 = vNormalize(vCross(normal, t1));
  return { origin, normal, tangentU: t1, tangentV: t2, neighbors, vertexIndex };
};

export function sampleMeshAt(opts: {
  mesh: SurfaceMeshData;
  vertexIndex?: number;
  point?: Vec3;
}): SurfaceQuerySample | null {
  const { mesh } = opts;
  const vertexIndex =
    typeof opts.vertexIndex === "number"
      ? opts.vertexIndex
      : opts.point
        ? nearestVertexIndex(mesh, opts.point)
        : null;
  if (vertexIndex == null) return null;

  const frame = resolveMeshFrame(mesh, vertexIndex);
  if (!frame) return null;

  const meanEdge =
    mesh.meanEdgeLength != null && Number.isFinite(mesh.meanEdgeLength) && mesh.meanEdgeLength > 0
      ? mesh.meanEdgeLength
      : 1;
  const scale = Math.max(1e-6, meanEdge);
  const du = vScale(frame.tangentU, scale);
  const dv = vScale(frame.tangentV, scale);
  const nRaw = vCross(du, dv);
  const areaElem = vLen(nRaw);
  if (!Number.isFinite(areaElem) || areaElem <= 1e-12) return null;

  const E = vDot(du, du);
  const F = vDot(du, dv);
  const G = vDot(dv, dv);
  if (!Number.isFinite(E) || !Number.isFinite(F) || !Number.isFinite(G)) return null;

  return {
    point: frame.origin,
    du,
    dv,
    normal: frame.normal,
    metric: { E, F, G },
    areaElem,
  };
}

export function buildMeshNeighborhood(opts: {
  mesh: SurfaceMeshData;
  vertexIndex?: number;
  point?: Vec3;
}): SurfaceQueryNeighborhood | null {
  const { mesh } = opts;
  const vertexIndex =
    typeof opts.vertexIndex === "number"
      ? opts.vertexIndex
      : opts.point
        ? nearestVertexIndex(mesh, opts.point)
        : null;
  if (vertexIndex == null) return null;
  return resolveMeshFrame(mesh, vertexIndex);
}
