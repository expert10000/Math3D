import type { SurfaceMeshData } from "../mesh/surfaceMesh";

export type GeometryValidityCheckId =
  | "vertices_valid"
  | "faces_valid"
  | "normals_valid"
  | "manifold_check"
  | "duplicate_vertices"
  | "degenerate_triangles"
  | "open_boundaries"
  | "inverted_normals"
  | "self_intersection_warning"
  | "scale_warning";

export type GeometryValidityCheckStatus = "ok" | "warning" | "error" | "unknown";

export type GeometryValidityCheck = {
  id: GeometryValidityCheckId;
  label: string;
  status: GeometryValidityCheckStatus;
  detail: string;
};

export type GeometryMeshReadinessReport = {
  canSafelyBecomeMeshObject: boolean;
  checks: GeometryValidityCheck[];
  stats: {
    vertexCount: number;
    faceCount: number;
    invalidVertexCount: number;
    invalidFaceCount: number;
    degenerateTriangleCount: number;
    duplicateVertexCount: number;
    boundaryEdgeCount: number;
    nonManifoldEdgeCount: number;
    suspectedSelfIntersectionPairs: number;
  };
  suggestions: {
    weldTolerance: number;
    dedupeTolerance: number;
  };
  notes: string[];
};

type ValidTriangle = {
  a: number;
  b: number;
  c: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

const formatCount = (value: number): string => value.toLocaleString();

const isFinite3 = (x: number, y: number, z: number): boolean =>
  Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);

const overlapsAabb = (a: ValidTriangle, b: ValidTriangle, epsilon: number): boolean =>
  a.minX <= b.maxX + epsilon &&
  a.maxX + epsilon >= b.minX &&
  a.minY <= b.maxY + epsilon &&
  a.maxY + epsilon >= b.minY &&
  a.minZ <= b.maxZ + epsilon &&
  a.maxZ + epsilon >= b.minZ;

const triangleSharesVertex = (a: ValidTriangle, b: ValidTriangle): boolean =>
  a.a === b.a ||
  a.a === b.b ||
  a.a === b.c ||
  a.b === b.a ||
  a.b === b.b ||
  a.b === b.c ||
  a.c === b.a ||
  a.c === b.b ||
  a.c === b.c;

const clampPositive = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const edgeKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const evaluateGeometryMeshReadiness = (mesh: SurfaceMeshData): GeometryMeshReadinessReport => {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const normals = mesh.normals ?? null;

  const rawVertexCount = positions.length / 3;
  const vertexCount = Math.floor(rawVertexCount);
  const invalidVertexRemainder = positions.length % 3;

  let invalidVertexCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < vertexCount; i += 1) {
    const p = i * 3;
    const x = Number(positions[p] ?? Number.NaN);
    const y = Number(positions[p + 1] ?? Number.NaN);
    const z = Number(positions[p + 2] ?? Number.NaN);
    if (!isFinite3(x, y, z)) {
      invalidVertexCount += 1;
      continue;
    }
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const hasFiniteBounds = minX <= maxX && minY <= maxY && minZ <= maxZ;
  const dx = hasFiniteBounds ? maxX - minX : 0;
  const dy = hasFiniteBounds ? maxY - minY : 0;
  const dz = hasFiniteBounds ? maxZ - minZ : 0;
  const diag = Math.hypot(dx, dy, dz);
  const areaTolerance = Math.max(1e-18, Math.max(diag, 1) * 1e-12);
  const dedupeTolerance = clampPositive(diag * 1e-8, 1e-9);
  const weldTolerance = clampPositive(diag * 1e-4, 1e-6);

  const triCount =
    indices && indices.length >= 3 ? Math.floor(indices.length / 3) : Math.floor(vertexCount / 3);
  const invalidFaceRemainder = indices ? indices.length % 3 : vertexCount % 3;
  let invalidFaceCount = 0;
  let degenerateTriangleCount = 0;
  let signedVolume = 0;
  const validTriangles: ValidTriangle[] = [];
  const edgeIncidence = new Map<string, number>();

  for (let t = 0; t < triCount; t += 1) {
    const base = t * 3;
    const a = indices ? Number(indices[base]) : base;
    const b = indices ? Number(indices[base + 1]) : base + 1;
    const c = indices ? Number(indices[base + 2]) : base + 2;

    const allInts = Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c);
    const inRange = a >= 0 && b >= 0 && c >= 0 && a < vertexCount && b < vertexCount && c < vertexCount;
    const distinct = a !== b && b !== c && a !== c;
    if (!allInts || !inRange || !distinct) {
      invalidFaceCount += 1;
      continue;
    }

    const a3 = a * 3;
    const b3 = b * 3;
    const c3 = c * 3;
    const ax = Number(positions[a3] ?? Number.NaN);
    const ay = Number(positions[a3 + 1] ?? Number.NaN);
    const az = Number(positions[a3 + 2] ?? Number.NaN);
    const bx = Number(positions[b3] ?? Number.NaN);
    const by = Number(positions[b3 + 1] ?? Number.NaN);
    const bz = Number(positions[b3 + 2] ?? Number.NaN);
    const cx = Number(positions[c3] ?? Number.NaN);
    const cy = Number(positions[c3 + 1] ?? Number.NaN);
    const cz = Number(positions[c3 + 2] ?? Number.NaN);
    if (!isFinite3(ax, ay, az) || !isFinite3(bx, by, bz) || !isFinite3(cx, cy, cz)) {
      invalidFaceCount += 1;
      continue;
    }

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const area2 = Math.hypot(crossX, crossY, crossZ);
    const area = 0.5 * area2;
    if (!Number.isFinite(area) || area <= areaTolerance) {
      degenerateTriangleCount += 1;
      continue;
    }

    const tetra6 = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    if (Number.isFinite(tetra6)) signedVolume += tetra6 / 6;

    validTriangles.push({
      a,
      b,
      c,
      minX: Math.min(ax, bx, cx),
      minY: Math.min(ay, by, cy),
      minZ: Math.min(az, bz, cz),
      maxX: Math.max(ax, bx, cx),
      maxY: Math.max(ay, by, cy),
      maxZ: Math.max(az, bz, cz),
    });

    const e0 = edgeKey(a, b);
    const e1 = edgeKey(b, c);
    const e2 = edgeKey(c, a);
    edgeIncidence.set(e0, (edgeIncidence.get(e0) ?? 0) + 1);
    edgeIncidence.set(e1, (edgeIncidence.get(e1) ?? 0) + 1);
    edgeIncidence.set(e2, (edgeIncidence.get(e2) ?? 0) + 1);
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of edgeIncidence.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    if (count > 2) nonManifoldEdgeCount += 1;
  }

  let invalidNormalsCount = 0;
  const normalCount = normals ? Math.floor(normals.length / 3) : 0;
  const normalsLengthValid = !!normals && normals.length >= vertexCount * 3 && normals.length % 3 === 0;
  if (normalsLengthValid && normals) {
    const checkCount = Math.min(vertexCount, normalCount);
    for (let i = 0; i < checkCount; i += 1) {
      const n = i * 3;
      const nx = Number(normals[n] ?? Number.NaN);
      const ny = Number(normals[n + 1] ?? Number.NaN);
      const nz = Number(normals[n + 2] ?? Number.NaN);
      const length = Math.hypot(nx, ny, nz);
      if (!isFinite3(nx, ny, nz) || !Number.isFinite(length) || length < 1e-8) invalidNormalsCount += 1;
    }
  }

  const duplicateBuckets = new Map<string, number>();
  if (vertexCount > 0 && hasFiniteBounds) {
    const inv = 1 / dedupeTolerance;
    for (let i = 0; i < vertexCount; i += 1) {
      const p = i * 3;
      const x = Number(positions[p] ?? Number.NaN);
      const y = Number(positions[p + 1] ?? Number.NaN);
      const z = Number(positions[p + 2] ?? Number.NaN);
      if (!isFinite3(x, y, z)) continue;
      const qx = Math.round(x * inv);
      const qy = Math.round(y * inv);
      const qz = Math.round(z * inv);
      const key = `${qx}|${qy}|${qz}`;
      duplicateBuckets.set(key, (duplicateBuckets.get(key) ?? 0) + 1);
    }
  }
  let duplicateVertexCount = 0;
  for (const count of duplicateBuckets.values()) {
    if (count > 1) duplicateVertexCount += count - 1;
  }

  const watertight = nonManifoldEdgeCount === 0 && boundaryEdgeCount === 0;
  const invertedNormals = watertight && validTriangles.length > 0 && Math.abs(signedVolume) > 1e-18 && signedVolume < 0;

  const maxDim = Math.max(dx, dy, dz);
  const minPositiveDim = Math.min(
    dx > 1e-12 ? dx : Number.POSITIVE_INFINITY,
    dy > 1e-12 ? dy : Number.POSITIVE_INFINITY,
    dz > 1e-12 ? dz : Number.POSITIVE_INFINITY
  );
  const dimRatio = Number.isFinite(minPositiveDim) ? maxDim / minPositiveDim : Number.POSITIVE_INFINITY;
  const scaleWarning =
    (Number.isFinite(maxDim) && maxDim > 1e5) ||
    (Number.isFinite(maxDim) && maxDim > 0 && maxDim < 1e-6) ||
    (Number.isFinite(dimRatio) && dimRatio > 1e7);

  const maxFacesForSelfCheck = 900;
  const maxPairChecks = 180_000;
  const selfCheckStride =
    validTriangles.length > maxFacesForSelfCheck ? Math.ceil(validTriangles.length / maxFacesForSelfCheck) : 1;
  const sampledTriangles =
    selfCheckStride > 1 ? validTriangles.filter((_, idx) => idx % selfCheckStride === 0) : validTriangles;
  let suspectedSelfIntersectionPairs = 0;
  let checkedPairs = 0;
  let selfCheckTruncated = false;
  const overlapEpsilon = Math.max(1e-9, dedupeTolerance * 2);
  for (let i = 0; i < sampledTriangles.length; i += 1) {
    for (let j = i + 1; j < sampledTriangles.length; j += 1) {
      if (checkedPairs >= maxPairChecks) {
        selfCheckTruncated = true;
        break;
      }
      checkedPairs += 1;
      const a = sampledTriangles[i];
      const b = sampledTriangles[j];
      if (triangleSharesVertex(a, b)) continue;
      if (overlapsAabb(a, b, overlapEpsilon)) {
        suspectedSelfIntersectionPairs += 1;
        if (suspectedSelfIntersectionPairs >= 3) {
          break;
        }
      }
    }
    if (suspectedSelfIntersectionPairs >= 3 || selfCheckTruncated) break;
  }
  const selfIntersectionWarning = suspectedSelfIntersectionPairs > 0;

  const verticesValid =
    vertexCount > 0 && invalidVertexRemainder === 0 && invalidVertexCount === 0 && Number.isFinite(rawVertexCount);
  const facesValid = triCount > 0 && invalidFaceRemainder === 0 && invalidFaceCount === 0;
  const normalsPresent = !!normals && normals.length > 0;
  const normalsValid = normalsLengthValid && invalidNormalsCount === 0;
  const manifoldOk = nonManifoldEdgeCount === 0;

  const canSafelyBecomeMeshObject =
    verticesValid && facesValid && manifoldOk && degenerateTriangleCount === 0 && invalidFaceCount === 0;

  const checks: GeometryValidityCheck[] = [
    {
      id: "vertices_valid",
      label: "vertices valid",
      status: verticesValid ? "ok" : "error",
      detail: verticesValid
        ? `${formatCount(vertexCount)} vertices checked.`
        : `Invalid vertices: ${formatCount(invalidVertexCount)}${invalidVertexRemainder ? " (buffer stride mismatch)" : ""}.`,
    },
    {
      id: "faces_valid",
      label: "faces valid",
      status: facesValid ? "ok" : "error",
      detail: facesValid
        ? `${formatCount(triCount)} face triplets checked.`
        : `Invalid faces: ${formatCount(invalidFaceCount)}${invalidFaceRemainder ? " (index/triangle remainder)" : ""}.`,
    },
    {
      id: "normals_valid",
      label: "normals valid",
      status: !normalsPresent ? "warning" : normalsValid ? "ok" : "warning",
      detail: !normalsPresent
        ? "Normals missing."
        : normalsValid
          ? "Normals are finite."
          : `Normals invalid/non-finite: ${formatCount(invalidNormalsCount)}.`,
    },
    {
      id: "manifold_check",
      label: "manifold check",
      status: manifoldOk ? "ok" : "error",
      detail: manifoldOk
        ? "No non-manifold edges found."
        : `Non-manifold edges: ${formatCount(nonManifoldEdgeCount)}.`,
    },
    {
      id: "duplicate_vertices",
      label: "duplicate vertices",
      status: duplicateVertexCount > 0 ? "warning" : "ok",
      detail:
        duplicateVertexCount > 0
          ? `${formatCount(duplicateVertexCount)} duplicate/overlapping vertices (approx).`
          : "No duplicate vertices detected.",
    },
    {
      id: "degenerate_triangles",
      label: "degenerate triangles",
      status: degenerateTriangleCount > 0 ? "warning" : "ok",
      detail:
        degenerateTriangleCount > 0
          ? `${formatCount(degenerateTriangleCount)} degenerate triangles.`
          : "No degenerate triangles detected.",
    },
    {
      id: "open_boundaries",
      label: "open boundaries",
      status: boundaryEdgeCount > 0 ? "warning" : "ok",
      detail:
        boundaryEdgeCount > 0
          ? `Boundary edges: ${formatCount(boundaryEdgeCount)}.`
          : "No open boundary edges detected.",
    },
    {
      id: "inverted_normals",
      label: "inverted normals",
      status: watertight ? (invertedNormals ? "warning" : "ok") : "unknown",
      detail: watertight
        ? invertedNormals
          ? "Watertight shell has negative signed volume (orientation likely inverted)."
          : "Watertight shell orientation looks consistent."
        : "Needs watertight mesh for reliable orientation check.",
    },
    {
      id: "self_intersection_warning",
      label: "self-intersection warning",
      status: selfIntersectionWarning ? "warning" : checkedPairs > 0 ? "ok" : "unknown",
      detail:
        checkedPairs <= 0
          ? "Insufficient triangles for self-intersection sampling."
          : selfIntersectionWarning
            ? `Possible self-intersection pairs: ${formatCount(suspectedSelfIntersectionPairs)}${selfCheckTruncated ? " (sampled)" : ""}.`
            : `No suspicious pairs in ${formatCount(checkedPairs)} sampled triangle pairs.`,
    },
    {
      id: "scale_warning",
      label: "scale warning",
      status: scaleWarning ? "warning" : "ok",
      detail: hasFiniteBounds
        ? `Bounds span: ${dx.toExponential(2)} x ${dy.toExponential(2)} x ${dz.toExponential(2)}.`
        : "Bounds unavailable.",
    },
  ];

  const notes: string[] = [];
  if (boundaryEdgeCount > 0) {
    notes.push("Warning: object has open boundary.");
    notes.push("Quick fix: triangulate and weld close vertices for simple gaps.");
    notes.push("Advanced repair: open Mesh Operations.");
  }
  if (selfIntersectionWarning) {
    notes.push("Warning: potential self-intersection detected from sampled triangle AABB overlaps.");
  }
  if (!canSafelyBecomeMeshObject) {
    notes.push("Geometry preflight found blocking issues; run quick fixes or continue in Mesh for advanced repair.");
  }

  return {
    canSafelyBecomeMeshObject,
    checks,
    stats: {
      vertexCount,
      faceCount: triCount,
      invalidVertexCount,
      invalidFaceCount,
      degenerateTriangleCount,
      duplicateVertexCount,
      boundaryEdgeCount,
      nonManifoldEdgeCount,
      suspectedSelfIntersectionPairs,
    },
    suggestions: {
      weldTolerance,
      dedupeTolerance,
    },
    notes,
  };
};
