import * as THREE from "three";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type GeometryPickKind = "object" | "face" | "edge" | "vertex";
export type GeometryPickTangentKind = "face-frame" | "edge-direction";

export interface GeometryPickResult {
  kind: GeometryPickKind;

  objectId: string;
  objectLabel: string;
  objectType: string;

  meshKey?: string;
  topologyVersion?: number;

  worldPoint: [number, number, number];
  localPoint?: [number, number, number];

  faceIndex?: number;
  vertexIndex?: number;
  edgeVertices?: [number, number];
  edgeKey?: string;

  normal?: [number, number, number];
  faceNormal?: [number, number, number];
  surfaceNormal?: [number, number, number];
  vertexNormal?: [number, number, number];
  tangent?: [number, number, number];
  bitangent?: [number, number, number];
  tangentKind?: GeometryPickTangentKind;

  barycentric?: [number, number, number];

  distanceFromRay?: number;
  sourceTriangle?: [number, number, number];

  stale?: boolean;
  label: string;
}

export interface GeometryRawHit {
  renderObjectId: string;
  point: [number, number, number];
  faceIndex?: number;
  vertexIndex?: number;
  distance: number;
  normal?: [number, number, number];
  screenPoint?: [number, number];
  sourceTriangleScreen?: [[number, number], [number, number], [number, number]];
}

export type GeometryPickObjectContext = {
  objectId: string;
  objectLabel: string;
  objectType: string;
  meshKey?: string;
  topologyVersion?: number;
  worldMesh?: SurfaceMeshData | null;
};

export type GeometryPickContext = {
  objects: GeometryPickObjectContext[];
  fallbackObjectId?: string | null;
  selectionRadiusPx?: {
    vertex: number;
    edge: number;
  };
};

type Vec3Tuple = [number, number, number];

const fallbackNormal: Vec3Tuple = [0, 1, 0];

const isFiniteTuple = (value: Vec3Tuple) => value.every(Number.isFinite);

const tupleFromPoint = (point: { x: number; y: number; z: number }): Vec3Tuple => [point.x, point.y, point.z];

const vectorFromTuple = (value: Vec3Tuple) => new THREE.Vector3(value[0], value[1], value[2]);

const tupleFromVector = (value: THREE.Vector3): Vec3Tuple => [value.x, value.y, value.z];

const normalizeTuple = (value: Vec3Tuple | undefined, fallback: Vec3Tuple = fallbackNormal): Vec3Tuple => {
  if (!value || !isFiniteTuple(value)) return fallback;
  const vector = vectorFromTuple(value);
  if (vector.lengthSq() <= 1e-12) return fallback;
  vector.normalize();
  return tupleFromVector(vector);
};

const normalizeTupleOptional = (value: Vec3Tuple | undefined): Vec3Tuple | undefined => {
  if (!value || !isFiniteTuple(value)) return undefined;
  const vector = vectorFromTuple(value);
  if (vector.lengthSq() <= 1e-12) return undefined;
  vector.normalize();
  return tupleFromVector(vector);
};

export function makeGeometryEdgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

const orthonormalTangentFrame = (
  normalInput: THREE.Vector3,
  preferredInput: THREE.Vector3
): { normal: THREE.Vector3; tangent: THREE.Vector3; bitangent: THREE.Vector3 } => {
  const normal = normalInput.lengthSq() > 1e-12 ? normalInput.clone().normalize() : vectorFromTuple(fallbackNormal);
  let tangent = preferredInput.clone().sub(normal.clone().multiplyScalar(preferredInput.dot(normal)));
  if (tangent.lengthSq() <= 1e-12) {
    const ref =
      Math.abs(normal.x) <= Math.abs(normal.y) && Math.abs(normal.x) <= Math.abs(normal.z)
        ? new THREE.Vector3(1, 0, 0)
        : Math.abs(normal.y) <= Math.abs(normal.z)
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
    tangent = ref.sub(normal.clone().multiplyScalar(ref.dot(normal)));
  }
  tangent.normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
  if (bitangent.lengthSq() <= 1e-12) bitangent.set(0, 0, 1);
  else bitangent.normalize();
  return { normal, tangent, bitangent };
};

const readVertex = (mesh: SurfaceMeshData, index: number): THREE.Vector3 | null => {
  const positions = mesh.positions;
  const vertexCount = Math.floor((positions?.length ?? 0) / 3);
  if (!Number.isInteger(index) || index < 0 || index >= vertexCount) return null;
  const base = index * 3;
  return new THREE.Vector3(Number(positions[base]), Number(positions[base + 1]), Number(positions[base + 2]));
};

const readNormal = (mesh: SurfaceMeshData, index: number): Vec3Tuple | undefined => {
  const normals = mesh.normals;
  if (!normals || index < 0 || index * 3 + 2 >= normals.length) return undefined;
  return normalizeTuple([Number(normals[index * 3]), Number(normals[index * 3 + 1]), Number(normals[index * 3 + 2])]);
};

const readFace = (mesh: SurfaceMeshData, faceIndex: number) => {
  const positions = mesh.positions;
  const vertexCount = Math.floor((positions?.length ?? 0) / 3);
  const indices = mesh.indices ?? null;
  const faceCount = indices && indices.length >= 3 ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= faceCount) return null;
  const base = faceIndex * 3;
  const ia = indices ? Number(indices[base]) : base;
  const ib = indices ? Number(indices[base + 1]) : base + 1;
  const ic = indices ? Number(indices[base + 2]) : base + 2;
  if (ia < 0 || ib < 0 || ic < 0 || ia >= vertexCount || ib >= vertexCount || ic >= vertexCount) return null;
  if (ia === ib || ib === ic || ia === ic) return null;
  const a = readVertex(mesh, ia);
  const b = readVertex(mesh, ib);
  const c = readVertex(mesh, ic);
  if (!a || !b || !c) return null;
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normalRaw = new THREE.Vector3().crossVectors(ab, ac);
  const area = normalRaw.length() * 0.5;
  const frame = orthonormalTangentFrame(normalRaw, ab);
  const normal = frame.normal;
  const tangent = frame.tangent;
  const bitangent = frame.bitangent;
  return { faceIndex, vertexIndices: [ia, ib, ic] as [number, number, number], vertices: [a, b, c] as const, normal, tangent, bitangent, area };
};

const barycentricForFace = (
  point: THREE.Vector3,
  face: NonNullable<ReturnType<typeof readFace>>
): Vec3Tuple | undefined => {
  const out = new THREE.Vector3();
  THREE.Triangle.getBarycoord(point, face.vertices[0], face.vertices[1], face.vertices[2], out);
  if (!Number.isFinite(out.x) || !Number.isFinite(out.y) || !Number.isFinite(out.z)) return undefined;
  return [out.x, out.y, out.z];
};

const nearestVertexOnFace = (
  point: THREE.Vector3,
  face: NonNullable<ReturnType<typeof readFace>>
): { index: number; point: THREE.Vector3; distanceSq: number } => {
  let best = { index: face.vertexIndices[0], point: face.vertices[0], distanceSq: point.distanceToSquared(face.vertices[0]) };
  for (let i = 1; i < 3; i += 1) {
    const candidate = face.vertices[i];
    const distanceSq = point.distanceToSquared(candidate);
    if (distanceSq < best.distanceSq) {
      best = { index: face.vertexIndices[i], point: candidate, distanceSq };
    }
  }
  return best;
};

const distancePointToScreenSegment = (
  point: [number, number],
  a: [number, number],
  b: [number, number]
) => {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-12) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * abx + (point[1] - a[1]) * aby) / lenSq));
  const x = a[0] + abx * t;
  const y = a[1] + aby * t;
  return Math.hypot(point[0] - x, point[1] - y);
};

const nearestEdgeOnFace = (
  point: THREE.Vector3,
  face: NonNullable<ReturnType<typeof readFace>>,
  screenPoint?: [number, number],
  sourceTriangleScreen?: [[number, number], [number, number], [number, number]]
): { edgeVertices: [number, number]; point: THREE.Vector3; distanceSq: number; tangent: THREE.Vector3; rank: number } | null => {
  const edges = [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const;
  let best: { edgeVertices: [number, number]; point: THREE.Vector3; distanceSq: number; tangent: THREE.Vector3; rank: number } | null = null;
  for (const [ai, bi] of edges) {
    const a = face.vertices[ai];
    const b = face.vertices[bi];
    const ab = new THREE.Vector3().subVectors(b, a);
    const lenSq = ab.lengthSq();
    if (lenSq <= 1e-12) continue;
    const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(point, a).dot(ab) / lenSq));
    const closest = a.clone().addScaledVector(ab, t);
    const distanceSq = point.distanceToSquared(closest);
    const screenDistance =
      screenPoint && sourceTriangleScreen
        ? distancePointToScreenSegment(screenPoint, sourceTriangleScreen[ai], sourceTriangleScreen[bi])
        : undefined;
    const edgeVertices = [face.vertexIndices[ai], face.vertexIndices[bi]].sort((l, r) => l - r) as [number, number];
    const tangent = ab.normalize();
    const rank = screenDistance ?? distanceSq;
    if (!best || rank < best.rank) {
      best = { edgeVertices, point: closest, distanceSq, tangent, rank };
    }
  }
  return best;
};

const findObjectContext = (rawHit: GeometryRawHit, context: GeometryPickContext): GeometryPickObjectContext | null => {
  const candidates = [rawHit.renderObjectId, context.fallbackObjectId].filter((value): value is string => !!value);
  for (const id of candidates) {
    const found = context.objects.find((entry) => entry.objectId === id || entry.meshKey === id);
    if (found) return found;
  }
  return context.objects[0] ?? null;
};

const makeBasePick = (
  kind: GeometryPickKind,
  rawHit: GeometryRawHit,
  object: GeometryPickObjectContext,
  label: string
): GeometryPickResult => ({
  kind,
  objectId: object.objectId,
  objectLabel: object.objectLabel,
  objectType: object.objectType,
  meshKey: object.meshKey,
  topologyVersion: object.topologyVersion,
  worldPoint: rawHit.point,
  normal: normalizeTuple(rawHit.normal),
  surfaceNormal: normalizeTupleOptional(rawHit.normal),
  distanceFromRay: Number.isFinite(rawHit.distance) ? rawHit.distance : undefined,
  label,
});

export function resolveGeometryPick(
  rawHit: GeometryRawHit,
  mode: GeometryPickKind,
  context: GeometryPickContext
): GeometryPickResult | null {
  const object = findObjectContext(rawHit, context);
  if (!object) return null;

  const objectLabel = object.objectLabel || object.objectId;
  const mesh = object.worldMesh ?? null;
  const hitPoint = vectorFromTuple(rawHit.point);

  if (mode === "object" || !mesh) {
    return makeBasePick("object", rawHit, object, `${objectLabel} object`);
  }

  const rawFace = Number.isInteger(rawHit.faceIndex) ? Number(rawHit.faceIndex) : null;
  const face = rawFace != null ? readFace(mesh, rawFace) : null;

  if (mode === "face") {
    if (!face) return makeBasePick("face", rawHit, object, `${objectLabel} face`);
    const faceNormal = tupleFromVector(face.normal);
    return {
      ...makeBasePick("face", rawHit, object, `${objectLabel} face #${face.faceIndex}`),
      faceIndex: face.faceIndex,
      sourceTriangle: face.vertexIndices,
      normal: faceNormal,
      faceNormal,
      tangent: tupleFromVector(face.tangent),
      bitangent: tupleFromVector(face.bitangent),
      tangentKind: "face-frame",
      barycentric: barycentricForFace(hitPoint, face),
    };
  }

  if (mode === "vertex") {
    let nearest = face ? nearestVertexOnFace(hitPoint, face) : null;
    if (face && rawHit.screenPoint && rawHit.sourceTriangleScreen) {
      let bestScreenIndex = 0;
      let bestScreenDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < 3; i += 1) {
        const screen = rawHit.sourceTriangleScreen[i];
        const distance = Math.hypot(rawHit.screenPoint[0] - screen[0], rawHit.screenPoint[1] - screen[1]);
        if (distance < bestScreenDistance) {
          bestScreenDistance = distance;
          bestScreenIndex = i;
        }
      }
      const radius = Math.max(0, context.selectionRadiusPx?.vertex ?? 10);
      if (bestScreenDistance > radius) return null;
      nearest = {
        index: face.vertexIndices[bestScreenIndex],
        point: face.vertices[bestScreenIndex],
        distanceSq: hitPoint.distanceToSquared(face.vertices[bestScreenIndex]),
      };
    }
    const explicit =
      !rawHit.sourceTriangleScreen && Number.isInteger(rawHit.vertexIndex)
        ? readVertex(mesh, Number(rawHit.vertexIndex))
        : null;
    const vertexIndex = explicit ? Number(rawHit.vertexIndex) : nearest?.index;
    const vertexPoint = explicit ?? nearest?.point ?? null;
    if (vertexIndex == null || !vertexPoint) return makeBasePick("vertex", rawHit, object, `${objectLabel} vertex`);
    const vertexNormal = readNormal(mesh, vertexIndex);
    const faceNormal = face ? tupleFromVector(face.normal) : undefined;
    const normal = vertexNormal ?? faceNormal ?? normalizeTuple(rawHit.normal);
    return {
      ...makeBasePick("vertex", rawHit, object, `${objectLabel} vertex #${vertexIndex}`),
      worldPoint: tupleFromVector(vertexPoint),
      vertexIndex,
      faceIndex: face?.faceIndex,
      sourceTriangle: face?.vertexIndices,
      normal,
      faceNormal,
      vertexNormal,
    };
  }

  const edge = face ? nearestEdgeOnFace(hitPoint, face, rawHit.screenPoint, rawHit.sourceTriangleScreen) : null;
  if (!edge) return makeBasePick("edge", rawHit, object, `${objectLabel} edge`);
  if (rawHit.screenPoint && rawHit.sourceTriangleScreen) {
    const edgeIndices = edge.edgeVertices.map((vertex) => face?.vertexIndices.indexOf(vertex) ?? -1);
    if (edgeIndices.some((index) => index < 0)) return null;
    const distance = distancePointToScreenSegment(
      rawHit.screenPoint,
      rawHit.sourceTriangleScreen[edgeIndices[0]],
      rawHit.sourceTriangleScreen[edgeIndices[1]]
    );
    const radius = Math.max(0, context.selectionRadiusPx?.edge ?? 8);
    if (distance > radius) return null;
  }
  const faceNormal = face ? tupleFromVector(face.normal) : undefined;
  const normal = faceNormal ?? normalizeTuple(rawHit.normal);
  const edgeStart = readVertex(mesh, edge.edgeVertices[0]);
  const edgeEnd = readVertex(mesh, edge.edgeVertices[1]);
  const edgeTangent =
    edgeStart && edgeEnd && edgeEnd.distanceToSquared(edgeStart) > 1e-12
      ? edgeEnd.clone().sub(edgeStart).normalize()
      : edge.tangent;
  const bitangent = new THREE.Vector3().crossVectors(vectorFromTuple(normal), edgeTangent);
  if (bitangent.lengthSq() > 1e-12) bitangent.normalize();
  return {
    ...makeBasePick("edge", rawHit, object, `${objectLabel} edge [${edge.edgeVertices[0]}, ${edge.edgeVertices[1]}]`),
    worldPoint: tupleFromVector(edge.point),
    faceIndex: face?.faceIndex,
    edgeVertices: edge.edgeVertices,
    edgeKey: makeGeometryEdgeKey(edge.edgeVertices[0], edge.edgeVertices[1]),
    sourceTriangle: face?.vertexIndices,
    normal,
    faceNormal,
    tangent: tupleFromVector(edgeTangent),
    bitangent: tupleFromVector(bitangent),
    tangentKind: "edge-direction",
  };
}
