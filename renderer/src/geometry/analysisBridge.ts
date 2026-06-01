import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { promoteGeometryToMesh } from "./meshPromotionContract";
import { evaluateGeometryMeshReadiness, type GeometryMeshReadinessReport } from "./meshReadiness";

export type GeometryAnalysisSnapshot = {
  id: string;
  sourceObjectId: string;
  sourceObjectName: string;
  createdAt: number;
  mesh: SurfaceMeshData;
  readiness: GeometryMeshReadinessReport;
};

export type GeometryAnalysisBasicMetrics = {
  volume: number;
  area: number;
  centroid: { x: number; y: number; z: number } | null;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
};

export type GeometryAnalysisTopologySummary = {
  vertexCount: number;
  edgeCount: number;
  faceCount: number;
  eulerCharacteristic: number;
  boundaryCount: number;
  manifold: boolean;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
};

export type GeometrySectionAnalysisSummary = {
  sectionLength: number;
  sectionEnclosedArea: number;
};

export type GeometryAnalysisEligibility = {
  eligible: boolean;
  readiness: GeometryMeshReadinessReport;
  reason: string | null;
};

const boundaryKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const parseBoundaryKey = (key: string): [number, number] | null => {
  const split = key.split("|");
  if (split.length !== 2) return null;
  const a = Number(split[0]);
  const b = Number(split[1]);
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
  return [a, b];
};

const meshBounds = (positions: ArrayLike<number>): { min: [number, number, number]; max: [number, number, number] } | null => {
  const count = Math.floor((positions?.length ?? 0) / 3);
  if (count <= 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let finiteCount = 0;
  for (let i = 0; i < count; i += 1) {
    const p = i * 3;
    const x = Number(positions[p] ?? Number.NaN);
    const y = Number(positions[p + 1] ?? Number.NaN);
    const z = Number(positions[p + 2] ?? Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    finiteCount += 1;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (finiteCount <= 0) return null;
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
};

const enumerateTriangles = (
  mesh: Pick<SurfaceMeshData, "positions" | "indices">
): Array<{ a: number; b: number; c: number }> => {
  const vertexCount = Math.floor((mesh.positions?.length ?? 0) / 3);
  if (vertexCount <= 0) return [];
  const indices = mesh.indices ?? null;
  const triCount = indices && indices.length >= 3 ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  const out: Array<{ a: number; b: number; c: number }> = [];
  for (let t = 0; t < triCount; t += 1) {
    const base = t * 3;
    const a = indices ? Number(indices[base]) : base;
    const b = indices ? Number(indices[base + 1]) : base + 1;
    const c = indices ? Number(indices[base + 2]) : base + 2;
    const validInts = Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c);
    const inRange = a >= 0 && b >= 0 && c >= 0 && a < vertexCount && b < vertexCount && c < vertexCount;
    const distinct = a !== b && b !== c && a !== c;
    if (!validInts || !inRange || !distinct) continue;
    out.push({ a, b, c });
  }
  return out;
};

export const formatGeometryAnalysisSnapshotId = (sequence: number): string =>
  `geometry-analysis-${String(Math.max(0, Math.floor(sequence))).padStart(5, "0")}`;

export const evaluateGeometryAnalysisEligibility = (mesh: SurfaceMeshData): GeometryAnalysisEligibility => {
  const readiness = evaluateGeometryMeshReadiness(mesh);
  const hasVertices = readiness.stats.vertexCount > 0;
  const hasFaces = readiness.stats.faceCount > 0;
  const hasFatal =
    !hasVertices ||
    !hasFaces ||
    readiness.checks.some(
      (check) =>
        check.status === "error" &&
        (check.id === "vertices_valid" || check.id === "faces_valid" || check.id === "degenerate_triangles")
    );
  if (!hasVertices) {
    return { eligible: false, readiness, reason: "No mesh vertices found for analysis." };
  }
  if (!hasFaces) {
    return { eligible: false, readiness, reason: "No valid mesh faces found for analysis." };
  }
  if (hasFatal) {
    return { eligible: false, readiness, reason: "Mesh validity failed. Fix invalid vertices/faces before analysis." };
  }
  return { eligible: true, readiness, reason: null };
};

export const createGeometryAnalysisSnapshot = (args: {
  mesh: SurfaceMeshData;
  sourceObjectId: string;
  sourceObjectName: string;
  snapshotSequence: number;
  createdAt?: number;
}): GeometryAnalysisSnapshot => {
  const promoted = promoteGeometryToMesh({
    mesh: args.mesh,
    sourceGeometryId: args.sourceObjectId,
    sourceOperationHistory: ["Geometry quick analysis snapshot"],
    promotionMode: "analysis_ready_mesh",
    createdAt: args.createdAt,
    labelOverride: `${args.sourceObjectName} analysis snapshot`,
  });
  return {
    id: formatGeometryAnalysisSnapshotId(args.snapshotSequence),
    sourceObjectId: args.sourceObjectId,
    sourceObjectName: args.sourceObjectName,
    createdAt: Number.isFinite(args.createdAt) ? Number(args.createdAt) : Date.now(),
    mesh: promoted.mesh,
    readiness: promoted.metadata.validityReport,
  };
};

export const computeGeometryAnalysisBasicMetrics = (mesh: SurfaceMeshData): GeometryAnalysisBasicMetrics => {
  const triangles = enumerateTriangles(mesh);
  let area = 0;
  let signedVolume = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let centroidCount = 0;
  const positions = mesh.positions;
  const vertexCount = Math.floor((positions?.length ?? 0) / 3);
  for (let i = 0; i < vertexCount; i += 1) {
    const p = i * 3;
    const x = Number(positions[p] ?? Number.NaN);
    const y = Number(positions[p + 1] ?? Number.NaN);
    const z = Number(positions[p + 2] ?? Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    cx += x;
    cy += y;
    cz += z;
    centroidCount += 1;
  }
  for (const tri of triangles) {
    const a3 = tri.a * 3;
    const b3 = tri.b * 3;
    const c3 = tri.c * 3;
    const ax = Number(positions[a3] ?? 0);
    const ay = Number(positions[a3 + 1] ?? 0);
    const az = Number(positions[a3 + 2] ?? 0);
    const bx = Number(positions[b3] ?? 0);
    const by = Number(positions[b3 + 1] ?? 0);
    const bz = Number(positions[b3 + 2] ?? 0);
    const cxTri = Number(positions[c3] ?? 0);
    const cyTri = Number(positions[c3 + 1] ?? 0);
    const czTri = Number(positions[c3 + 2] ?? 0);
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cxTri - ax;
    const acy = cyTri - ay;
    const acz = czTri - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const triArea = 0.5 * Math.hypot(crossX, crossY, crossZ);
    if (Number.isFinite(triArea)) area += triArea;
    const tetra6 = ax * (by * czTri - bz * cyTri) + ay * (bz * cxTri - bx * czTri) + az * (bx * cyTri - by * cxTri);
    if (Number.isFinite(tetra6)) signedVolume += tetra6 / 6;
  }
  return {
    volume: Math.abs(signedVolume),
    area,
    centroid:
      centroidCount > 0
        ? {
            x: cx / centroidCount,
            y: cy / centroidCount,
            z: cz / centroidCount,
          }
        : null,
    bounds: meshBounds(positions),
  };
};

export const computeGeometryAnalysisTopologySummary = (mesh: SurfaceMeshData): GeometryAnalysisTopologySummary => {
  const vertexCount = Math.floor((mesh.positions?.length ?? 0) / 3);
  const triangles = enumerateTriangles(mesh);
  const edgeIncidence = new Map<string, number>();
  for (const tri of triangles) {
    const e0 = boundaryKey(tri.a, tri.b);
    const e1 = boundaryKey(tri.b, tri.c);
    const e2 = boundaryKey(tri.c, tri.a);
    edgeIncidence.set(e0, (edgeIncidence.get(e0) ?? 0) + 1);
    edgeIncidence.set(e1, (edgeIncidence.get(e1) ?? 0) + 1);
    edgeIncidence.set(e2, (edgeIncidence.get(e2) ?? 0) + 1);
  }
  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  const boundaryAdjacency = new Map<number, number[]>();
  for (const [edge, incidence] of edgeIncidence.entries()) {
    if (incidence === 1) {
      boundaryEdgeCount += 1;
      const parsed = parseBoundaryKey(edge);
      if (!parsed) continue;
      const [a, b] = parsed;
      const aNeighbors = boundaryAdjacency.get(a) ?? [];
      aNeighbors.push(b);
      boundaryAdjacency.set(a, aNeighbors);
      const bNeighbors = boundaryAdjacency.get(b) ?? [];
      bNeighbors.push(a);
      boundaryAdjacency.set(b, bNeighbors);
    } else if (incidence > 2) {
      nonManifoldEdgeCount += 1;
    }
  }
  const visited = new Set<number>();
  let boundaryCount = 0;
  for (const seed of boundaryAdjacency.keys()) {
    if (visited.has(seed)) continue;
    boundaryCount += 1;
    const queue = [seed];
    visited.add(seed);
    for (let q = 0; q < queue.length; q += 1) {
      const v = queue[q];
      const neighbors = boundaryAdjacency.get(v) ?? [];
      for (const n of neighbors) {
        if (visited.has(n)) continue;
        visited.add(n);
        queue.push(n);
      }
    }
  }
  const edgeCount = edgeIncidence.size;
  const faceCount = triangles.length;
  return {
    vertexCount,
    edgeCount,
    faceCount,
    eulerCharacteristic: vertexCount - edgeCount + faceCount,
    boundaryCount,
    manifold: nonManifoldEdgeCount === 0,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
  };
};

