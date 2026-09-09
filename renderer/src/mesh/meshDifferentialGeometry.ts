import type { SurfaceMeshData } from "./surfaceMesh";

export const MESH_CURVATURE_WARNING = {
  BOUNDARY: 1 << 0,
  NON_MANIFOLD: 1 << 1,
  DEGENERATE: 1 << 2,
  NEARLY_FLAT: 1 << 3,
  UMBILIC: 1 << 4,
  INCONSISTENT_ORIENTATION: 1 << 5,
  INSUFFICIENT_NEIGHBORHOOD: 1 << 6,
  CURVATURE_IDENTITY: 1 << 7,
} as const;

export type MeshCurvatureWarningFlag = (typeof MESH_CURVATURE_WARNING)[keyof typeof MESH_CURVATURE_WARNING];

export const TRIANGLE_MESH_CURVATURE_PARAMETERS = {
  method: "angle-defect-cotan-shape-operator",
  vertexArea: "barycentric",
  boundaryTreatment: "pi-angle-defect",
  orientation: "face-winding-outward-for-closed-mesh",
  meanCurvatureSign: "positive-on-outward-convex-surfaces",
  principalDirectionFit: "weighted-normal-section-least-squares",
  version: 2,
} as const;

export type MeshDifferentialGeometryConventions = {
  vertexArea: "barycentric";
  gaussianCurvature: "angle-defect";
  boundaryAngle: "pi";
  orientation: "input-winding-open-outward-closed";
  meanCurvatureSign: "positive-outward-convex";
  principalCurvatureOrder: "k1>=k2";
  shapeIndex: "2/pi*atan2(k1+k2,k1-k2)";
};

export type MeshDifferentialGeometrySummary = {
  vertexCount: number;
  faceCount: number;
  validVertexCount: number;
  directionValidVertexCount: number;
  boundaryVertexCount: number;
  nonManifoldVertexCount: number;
  degenerateVertexCount: number;
  nearlyFlatVertexCount: number;
  umbilicVertexCount: number;
  inconsistentOrientationVertexCount: number;
  insufficientNeighborhoodVertexCount: number;
  identityWarningVertexCount: number;
  invalidFaceCount: number;
  degenerateFaceCount: number;
  orientationFlipped: boolean;
  maxGaussianIdentityResidual: number;
  maxMeanIdentityResidual: number;
};

export type MeshDifferentialGeometryResult = {
  K: Float32Array;
  H: Float32Array;
  k1: Float32Array;
  k2: Float32Array;
  shapeIndex: Float32Array;
  curvedness: Float32Array;
  normals: Float32Array;
  d1: Float32Array;
  d2: Float32Array;
  validMask: Uint8Array;
  directionValidMask: Uint8Array;
  warningMask: Uint16Array;
  gaussianIdentityResidual: Float32Array;
  meanIdentityResidual: Float32Array;
  conventions: MeshDifferentialGeometryConventions;
  summary: MeshDifferentialGeometrySummary;
};

export type MeshDifferentialGeometryProbe = {
  K: number;
  H: number;
  k1: number;
  k2: number;
  shapeIndex: number;
  curvedness: number;
  normal: readonly [number, number, number];
  d1: readonly [number, number, number] | null;
  d2: readonly [number, number, number] | null;
  valid: boolean;
  directionValid: boolean;
  warnings: string[];
};

type Vec3 = readonly [number, number, number];
type Triangle = {
  a: number;
  b: number;
  c: number;
  area: number;
  cross: Vec3;
  angles: readonly [number, number, number];
};
type EdgeRecord = {
  a: number;
  b: number;
  count: number;
  firstDirection: 1 | -1;
  orientationMismatch: boolean;
};

const CONVENTIONS: MeshDifferentialGeometryConventions = {
  vertexArea: "barycentric",
  gaussianCurvature: "angle-defect",
  boundaryAngle: "pi",
  orientation: "input-winding-open-outward-closed",
  meanCurvatureSign: "positive-outward-convex",
  principalCurvatureOrder: "k1>=k2",
  shapeIndex: "2/pi*atan2(k1+k2,k1-k2)",
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const edgeKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const normalize = (v: Vec3): Vec3 => {
  const len = length(v);
  return len > 1e-30 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
};
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const angleBetween = (a: Vec3, b: Vec3): number => {
  const denom = length(a) * length(b);
  return denom > 1e-30 ? Math.acos(clamp(dot(a, b) / denom, -1, 1)) : Number.NaN;
};

const cotangent = (angle: number): number => {
  const sine = Math.sin(angle);
  return Number.isFinite(angle) && Math.abs(sine) > 1e-12 ? Math.cos(angle) / sine : 0;
};

const tangentBasis = (normal: Vec3): readonly [Vec3, Vec3] => {
  const axis: Vec3 = Math.abs(normal[2]) < 0.8 ? [0, 0, 1] : [0, 1, 0];
  const t1 = normalize(cross(axis, normal));
  return [t1, normalize(cross(normal, t1))];
};

const solveSymmetric3 = (matrix: Float64Array, rhs: Float64Array): Vec3 | null => {
  const augmented = [
    [matrix[0], matrix[1], matrix[2], rhs[0]],
    [matrix[1], matrix[3], matrix[4], rhs[1]],
    [matrix[2], matrix[4], matrix[5], rhs[2]],
  ];
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) <= 1e-12) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry < 4; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let entry = column; entry < 4; entry += 1) augmented[row][entry] -= factor * augmented[column][entry];
    }
  }
  const result: Vec3 = [augmented[0][3], augmented[1][3], augmented[2][3]];
  return result.every(Number.isFinite) ? result : null;
};

const warningLabels: readonly [MeshCurvatureWarningFlag, string][] = [
  [MESH_CURVATURE_WARNING.BOUNDARY, "Boundary vertex: the Gaussian angle target is pi."],
  [MESH_CURVATURE_WARNING.NON_MANIFOLD, "Non-manifold neighborhood."],
  [MESH_CURVATURE_WARNING.DEGENERATE, "Degenerate incident face."],
  [MESH_CURVATURE_WARNING.NEARLY_FLAT, "Nearly flat neighborhood: directions are numerically weak."],
  [MESH_CURVATURE_WARNING.UMBILIC, "Umbilic neighborhood: principal directions are undefined."],
  [MESH_CURVATURE_WARNING.INCONSISTENT_ORIENTATION, "Incident face winding is inconsistent."],
  [MESH_CURVATURE_WARNING.INSUFFICIENT_NEIGHBORHOOD, "Insufficient neighborhood for principal-direction fitting."],
  [MESH_CURVATURE_WARNING.CURVATURE_IDENTITY, "Discrete H and K require a clamped principal-curvature discriminant."],
];

export const describeMeshCurvatureWarnings = (mask: number): string[] =>
  warningLabels.filter(([flag]) => (mask & flag) !== 0).map(([, label]) => label);

export const readMeshDifferentialGeometryProbe = (
  result: MeshDifferentialGeometryResult | null | undefined,
  vertexIndex: number | null | undefined
): MeshDifferentialGeometryProbe | null => {
  if (!result || vertexIndex == null || vertexIndex < 0 || vertexIndex >= result.K.length) return null;
  const base = vertexIndex * 3;
  const tuple = (values: Float32Array): Vec3 => [values[base], values[base + 1], values[base + 2]];
  const directionValid = result.directionValidMask[vertexIndex] === 1;
  return {
    K: result.K[vertexIndex],
    H: result.H[vertexIndex],
    k1: result.k1[vertexIndex],
    k2: result.k2[vertexIndex],
    shapeIndex: result.shapeIndex[vertexIndex],
    curvedness: result.curvedness[vertexIndex],
    normal: tuple(result.normals),
    d1: directionValid ? tuple(result.d1) : null,
    d2: directionValid ? tuple(result.d2) : null,
    valid: result.validMask[vertexIndex] === 1,
    directionValid,
    warnings: describeMeshCurvatureWarnings(result.warningMask[vertexIndex]),
  };
};

export const computeMeshDifferentialGeometry = (mesh: SurfaceMeshData): MeshDifferentialGeometryResult | null => {
  const positions = mesh.positions;
  const vertexCount = Math.floor(positions.length / 3);
  const rawFaceCount = mesh.indices ? Math.floor(mesh.indices.length / 3) : Math.floor(vertexCount / 3);
  if (vertexCount <= 0 || rawFaceCount <= 0) return null;

  const readVertex = (index: number): Vec3 => {
    const base = index * 3;
    return [Number(positions[base]), Number(positions[base + 1]), Number(positions[base + 2])];
  };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < vertexCount; index += 1) {
    const [x, y, z] = readVertex(index);
    if (![x, y, z].every(Number.isFinite)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const diagonal = Math.max(1e-12, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ));
  const areaEpsilon = Math.max(1e-24, diagonal * diagonal * 1e-14);
  const curvatureScale = 1 / diagonal;

  const vertexArea = new Float64Array(vertexCount);
  const angleSum = new Float64Array(vertexCount);
  const laplaceX = new Float64Array(vertexCount);
  const laplaceY = new Float64Array(vertexCount);
  const laplaceZ = new Float64Array(vertexCount);
  const normalX = new Float64Array(vertexCount);
  const normalY = new Float64Array(vertexCount);
  const normalZ = new Float64Array(vertexCount);
  const warningMask = new Uint16Array(vertexCount);
  const neighbors = Array.from({ length: vertexCount }, () => new Set<number>());
  const edgeMap = new Map<string, EdgeRecord>();
  const triangles: Triangle[] = [];
  let invalidFaceCount = mesh.indices ? mesh.indices.length % 3 : vertexCount % 3;
  let degenerateFaceCount = 0;
  let signedVolumeSix = 0;

  const addEdge = (from: number, to: number) => {
    neighbors[from].add(to);
    neighbors[to].add(from);
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    const direction: 1 | -1 = from === a ? 1 : -1;
    const key = edgeKey(from, to);
    const existing = edgeMap.get(key);
    if (!existing) {
      edgeMap.set(key, { a, b, count: 1, firstDirection: direction, orientationMismatch: false });
    } else {
      existing.orientationMismatch ||= existing.firstDirection === direction;
      existing.count += 1;
    }
  };
  const addLaplace = (i: number, j: number, weight: number) => {
    const from = readVertex(i);
    const to = readVertex(j);
    laplaceX[i] += weight * (to[0] - from[0]);
    laplaceY[i] += weight * (to[1] - from[1]);
    laplaceZ[i] += weight * (to[2] - from[2]);
  };

  for (let faceIndex = 0; faceIndex < rawFaceCount; faceIndex += 1) {
    const base = faceIndex * 3;
    const a = mesh.indices ? Number(mesh.indices[base]) : base;
    const b = mesh.indices ? Number(mesh.indices[base + 1]) : base + 1;
    const c = mesh.indices ? Number(mesh.indices[base + 2]) : base + 2;
    const indicesValid =
      Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c) &&
      a >= 0 && b >= 0 && c >= 0 && a < vertexCount && b < vertexCount && c < vertexCount;
    if (!indicesValid || a === b || b === c || c === a) {
      invalidFaceCount += 1;
      for (const index of [a, b, c]) {
        if (Number.isInteger(index) && index >= 0 && index < vertexCount) warningMask[index] |= MESH_CURVATURE_WARNING.DEGENERATE;
      }
      continue;
    }
    const pa = readVertex(a);
    const pb = readVertex(b);
    const pc = readVertex(c);
    if (![...pa, ...pb, ...pc].every(Number.isFinite)) {
      invalidFaceCount += 1;
      warningMask[a] |= MESH_CURVATURE_WARNING.DEGENERATE;
      warningMask[b] |= MESH_CURVATURE_WARNING.DEGENERATE;
      warningMask[c] |= MESH_CURVATURE_WARNING.DEGENERATE;
      continue;
    }
    const ab = subtract(pb, pa);
    const ac = subtract(pc, pa);
    const bc = subtract(pc, pb);
    const faceCross = cross(ab, ac);
    const area = 0.5 * length(faceCross);
    if (!Number.isFinite(area) || area <= areaEpsilon) {
      degenerateFaceCount += 1;
      warningMask[a] |= MESH_CURVATURE_WARNING.DEGENERATE;
      warningMask[b] |= MESH_CURVATURE_WARNING.DEGENERATE;
      warningMask[c] |= MESH_CURVATURE_WARNING.DEGENERATE;
      continue;
    }
    const angleA = angleBetween(ab, ac);
    const angleB = angleBetween([-ab[0], -ab[1], -ab[2]], bc);
    const angleC = Math.PI - angleA - angleB;
    if (![angleA, angleB, angleC].every(Number.isFinite)) {
      degenerateFaceCount += 1;
      continue;
    }
    triangles.push({ a, b, c, area, cross: faceCross, angles: [angleA, angleB, angleC] });
    signedVolumeSix += dot(pa, cross(pb, pc));
    for (const index of [a, b, c]) vertexArea[index] += area / 3;
    angleSum[a] += angleA;
    angleSum[b] += angleB;
    angleSum[c] += angleC;
    normalX[a] += faceCross[0]; normalY[a] += faceCross[1]; normalZ[a] += faceCross[2];
    normalX[b] += faceCross[0]; normalY[b] += faceCross[1]; normalZ[b] += faceCross[2];
    normalX[c] += faceCross[0]; normalY[c] += faceCross[1]; normalZ[c] += faceCross[2];
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
    const cotA = cotangent(angleA);
    const cotB = cotangent(angleB);
    const cotC = cotangent(angleC);
    addLaplace(a, b, cotC); addLaplace(b, a, cotC);
    addLaplace(b, c, cotA); addLaplace(c, b, cotA);
    addLaplace(c, a, cotB); addLaplace(a, c, cotB);
  }
  if (!triangles.length) return null;

  let hasBoundary = false;
  for (const edge of edgeMap.values()) {
    if (edge.count === 1) {
      hasBoundary = true;
      warningMask[edge.a] |= MESH_CURVATURE_WARNING.BOUNDARY;
      warningMask[edge.b] |= MESH_CURVATURE_WARNING.BOUNDARY;
    }
    if (edge.count > 2) {
      warningMask[edge.a] |= MESH_CURVATURE_WARNING.NON_MANIFOLD;
      warningMask[edge.b] |= MESH_CURVATURE_WARNING.NON_MANIFOLD;
    }
    if (edge.orientationMismatch) {
      warningMask[edge.a] |= MESH_CURVATURE_WARNING.INCONSISTENT_ORIENTATION;
      warningMask[edge.b] |= MESH_CURVATURE_WARNING.INCONSISTENT_ORIENTATION;
    }
  }
  const orientationFlipped = !hasBoundary && signedVolumeSix < 0;
  const normalSign = orientationFlipped ? -1 : 1;

  const K = new Float32Array(vertexCount).fill(Number.NaN);
  const H = new Float32Array(vertexCount).fill(Number.NaN);
  const k1 = new Float32Array(vertexCount).fill(Number.NaN);
  const k2 = new Float32Array(vertexCount).fill(Number.NaN);
  const shapeIndex = new Float32Array(vertexCount).fill(Number.NaN);
  const curvedness = new Float32Array(vertexCount).fill(Number.NaN);
  const normals = new Float32Array(vertexCount * 3).fill(Number.NaN);
  const d1 = new Float32Array(vertexCount * 3).fill(Number.NaN);
  const d2 = new Float32Array(vertexCount * 3).fill(Number.NaN);
  const validMask = new Uint8Array(vertexCount);
  const directionValidMask = new Uint8Array(vertexCount);
  const gaussianIdentityResidual = new Float32Array(vertexCount).fill(Number.NaN);
  const meanIdentityResidual = new Float32Array(vertexCount).fill(Number.NaN);

  let maxGaussianIdentityResidual = 0;
  let maxMeanIdentityResidual = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    const area = vertexArea[index];
    if (!Number.isFinite(area) || area <= areaEpsilon) {
      warningMask[index] |= MESH_CURVATURE_WARNING.DEGENERATE;
      continue;
    }
    const rawNormal: Vec3 = [normalSign * normalX[index], normalSign * normalY[index], normalSign * normalZ[index]];
    const normal = normalize(rawNormal);
    if (length(normal) <= 0) {
      warningMask[index] |= MESH_CURVATURE_WARNING.DEGENERATE;
      continue;
    }
    const base = index * 3;
    normals[base] = normal[0]; normals[base + 1] = normal[1]; normals[base + 2] = normal[2];
    const boundary = (warningMask[index] & MESH_CURVATURE_WARNING.BOUNDARY) !== 0;
    const gaussian = ((boundary ? Math.PI : 2 * Math.PI) - angleSum[index]) / area;
    const laplace: Vec3 = [laplaceX[index] / (2 * area), laplaceY[index] / (2 * area), laplaceZ[index] / (2 * area)];
    const mean = -0.5 * dot(laplace, normal);
    if (!Number.isFinite(gaussian) || !Number.isFinite(mean)) continue;
    K[index] = gaussian;
    H[index] = mean;
    let discriminant = mean * mean - gaussian;
    const discriminantTolerance = 0.05 * (mean * mean + Math.abs(gaussian) + curvatureScale * curvatureScale);
    if (discriminant < 0) {
      warningMask[index] |= MESH_CURVATURE_WARNING.CURVATURE_IDENTITY;
      if (discriminant < -discriminantTolerance) {
        continue;
      }
      discriminant = 0;
    }
    const root = Math.sqrt(discriminant);
    const principal1 = mean + root;
    const principal2 = mean - root;
    k1[index] = principal1;
    k2[index] = principal2;
    const gaussianResidual = Math.abs(principal1 * principal2 - gaussian);
    const meanResidual = Math.abs(0.5 * (principal1 + principal2) - mean);
    gaussianIdentityResidual[index] = gaussianResidual;
    meanIdentityResidual[index] = meanResidual;
    maxGaussianIdentityResidual = Math.max(maxGaussianIdentityResidual, gaussianResidual);
    maxMeanIdentityResidual = Math.max(maxMeanIdentityResidual, meanResidual);
    curvedness[index] = Math.sqrt(0.5 * (principal1 * principal1 + principal2 * principal2));
    shapeIndex[index] = (2 / Math.PI) * Math.atan2(principal1 + principal2, principal1 - principal2);
    validMask[index] =
      (warningMask[index] & (MESH_CURVATURE_WARNING.NON_MANIFOLD | MESH_CURVATURE_WARNING.DEGENERATE | MESH_CURVATURE_WARNING.INCONSISTENT_ORIENTATION)) === 0
        ? 1
        : 0;

    if (curvedness[index] <= curvatureScale * 1e-5) warningMask[index] |= MESH_CURVATURE_WARNING.NEARLY_FLAT;
    if (
      !validMask[index] ||
      (warningMask[index] & MESH_CURVATURE_WARNING.NEARLY_FLAT) !== 0
    ) continue;

    const [tangent1, tangent2] = tangentBasis(normal);
    const matrix = new Float64Array(6);
    const rhs = new Float64Array(3);
    let samples = 0;
    const center = readVertex(index);
    for (const neighborIndex of neighbors[index]) {
      const difference = subtract(readVertex(neighborIndex), center);
      const uRaw = dot(difference, tangent1);
      const vRaw = dot(difference, tangent2);
      const tangentLengthSquared = uRaw * uRaw + vRaw * vRaw;
      if (tangentLengthSquared <= diagonal * diagonal * 1e-20) continue;
      const invLength = 1 / Math.sqrt(tangentLengthSquared);
      const u = uRaw * invLength;
      const v = vRaw * invLength;
      const normalCurvature = -2 * dot(difference, normal) / tangentLengthSquared;
      const row: Vec3 = [u * u, 2 * u * v, v * v];
      const weight = Math.sqrt(tangentLengthSquared);
      matrix[0] += weight * row[0] * row[0];
      matrix[1] += weight * row[0] * row[1];
      matrix[2] += weight * row[0] * row[2];
      matrix[3] += weight * row[1] * row[1];
      matrix[4] += weight * row[1] * row[2];
      matrix[5] += weight * row[2] * row[2];
      rhs[0] += weight * row[0] * normalCurvature;
      rhs[1] += weight * row[1] * normalCurvature;
      rhs[2] += weight * row[2] * normalCurvature;
      samples += 1;
    }
    const fitted = samples >= 3 ? solveSymmetric3(matrix, rhs) : null;
    if (!fitted) {
      warningMask[index] |= MESH_CURVATURE_WARNING.INSUFFICIENT_NEIGHBORHOOD;
      continue;
    }
    const [a, b, c] = fitted;
    const traceHalf = 0.5 * (a + c);
    const eigenRadius = Math.hypot(0.5 * (a - c), b);
    const fittedK1 = traceHalf + eigenRadius;
    const fittedK2 = traceHalf - eigenRadius;
    const fittedMagnitude = Math.max(Math.abs(fittedK1), Math.abs(fittedK2), curvatureScale * 1e-6);
    if (2 * eigenRadius <= Math.max(curvatureScale * 1e-5, fittedMagnitude * 5e-2)) {
      warningMask[index] |= MESH_CURVATURE_WARNING.UMBILIC;
      continue;
    }
    let eigen1: readonly [number, number];
    if (Math.abs(b) > Math.abs(fittedK1 - a)) eigen1 = [1, (fittedK1 - a) / b];
    else if (Math.abs(fittedK1 - c) > 1e-14) eigen1 = [b / (fittedK1 - c), 1];
    else eigen1 = [1, 0];
    const eigenLength = Math.hypot(eigen1[0], eigen1[1]);
    if (!Number.isFinite(eigenLength) || eigenLength <= 1e-12) {
      warningMask[index] |= MESH_CURVATURE_WARNING.INSUFFICIENT_NEIGHBORHOOD;
      continue;
    }
    const eu = eigen1[0] / eigenLength;
    const ev = eigen1[1] / eigenLength;
    const direction1 = normalize([
      eu * tangent1[0] + ev * tangent2[0],
      eu * tangent1[1] + ev * tangent2[1],
      eu * tangent1[2] + ev * tangent2[2],
    ]);
    const direction2 = normalize(cross(normal, direction1));
    d1[base] = direction1[0]; d1[base + 1] = direction1[1]; d1[base + 2] = direction1[2];
    d2[base] = direction2[0]; d2[base + 1] = direction2[1]; d2[base + 2] = direction2[2];
    directionValidMask[index] = 1;
  }

  const countFlag = (flag: MeshCurvatureWarningFlag): number => {
    let count = 0;
    for (const mask of warningMask) if ((mask & flag) !== 0) count += 1;
    return count;
  };
  let validVertexCount = 0;
  let directionValidVertexCount = 0;
  for (let index = 0; index < vertexCount; index += 1) {
    validVertexCount += validMask[index];
    directionValidVertexCount += directionValidMask[index];
  }
  return {
    K, H, k1, k2, shapeIndex, curvedness, normals, d1, d2,
    validMask, directionValidMask, warningMask, gaussianIdentityResidual, meanIdentityResidual,
    conventions: CONVENTIONS,
    summary: {
      vertexCount,
      faceCount: triangles.length,
      validVertexCount,
      directionValidVertexCount,
      boundaryVertexCount: countFlag(MESH_CURVATURE_WARNING.BOUNDARY),
      nonManifoldVertexCount: countFlag(MESH_CURVATURE_WARNING.NON_MANIFOLD),
      degenerateVertexCount: countFlag(MESH_CURVATURE_WARNING.DEGENERATE),
      nearlyFlatVertexCount: countFlag(MESH_CURVATURE_WARNING.NEARLY_FLAT),
      umbilicVertexCount: countFlag(MESH_CURVATURE_WARNING.UMBILIC),
      inconsistentOrientationVertexCount: countFlag(MESH_CURVATURE_WARNING.INCONSISTENT_ORIENTATION),
      insufficientNeighborhoodVertexCount: countFlag(MESH_CURVATURE_WARNING.INSUFFICIENT_NEIGHBORHOOD),
      identityWarningVertexCount: countFlag(MESH_CURVATURE_WARNING.CURVATURE_IDENTITY),
      invalidFaceCount,
      degenerateFaceCount,
      orientationFlipped,
      maxGaussianIdentityResidual,
      maxMeanIdentityResidual,
    },
  };
};

export type VtkCurvatureReference = {
  gaussian: ArrayLike<number>;
  mean: ArrayLike<number>;
};

export type VtkCurvatureComparison = {
  sampleCount: number;
  gaussianRmse: number;
  meanRmse: number;
  meanCurvatureSign: "same" | "opposite";
};

/** VTK mean-curvature sign must be declared because its convention depends on mesh orientation and filter usage. */
export const compareVtkCurvatureReference = (
  result: MeshDifferentialGeometryResult,
  reference: VtkCurvatureReference,
  options: { meanCurvatureSign: "same" | "opposite" }
): VtkCurvatureComparison => {
  const count = Math.min(result.K.length, reference.gaussian.length, reference.mean.length);
  let gaussianSquared = 0;
  let meanSquared = 0;
  let sampleCount = 0;
  const sign = options.meanCurvatureSign === "same" ? 1 : -1;
  for (let index = 0; index < count; index += 1) {
    const gaussian = Number(reference.gaussian[index]);
    const mean = sign * Number(reference.mean[index]);
    if (!result.validMask[index] || !Number.isFinite(gaussian) || !Number.isFinite(mean)) continue;
    gaussianSquared += (result.K[index] - gaussian) ** 2;
    meanSquared += (result.H[index] - mean) ** 2;
    sampleCount += 1;
  }
  return {
    sampleCount,
    gaussianRmse: sampleCount ? Math.sqrt(gaussianSquared / sampleCount) : Number.NaN,
    meanRmse: sampleCount ? Math.sqrt(meanSquared / sampleCount) : Number.NaN,
    meanCurvatureSign: options.meanCurvatureSign,
  };
};
