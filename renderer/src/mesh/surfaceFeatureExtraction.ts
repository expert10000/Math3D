import type { MeshDifferentialGeometryResult } from "./meshDifferentialGeometry";
import type { SurfaceMeshData } from "./surfaceMesh";

export const SURFACE_FEATURE_EXTRACTION_VERSION = 1;

export const SURFACE_FEATURE_UNCERTAINTY = {
  DIFFERENTIAL_WARNING: 1 << 0,
  GAUSSIAN_THRESHOLD: 1 << 1,
  CURVATURE_THRESHOLD: 1 << 2,
  UMBILIC_THRESHOLD: 1 << 3,
} as const;

export type SurfaceFeatureClass =
  | "high-curvature"
  | "elliptic"
  | "hyperbolic"
  | "parabolic"
  | "umbilic";

export const SURFACE_FEATURE_CLASSES: readonly SurfaceFeatureClass[] = [
  "high-curvature",
  "elliptic",
  "hyperbolic",
  "parabolic",
  "umbilic",
];

export const SURFACE_FEATURE_LABELS: Readonly<Record<SurfaceFeatureClass, string>> = {
  "high-curvature": "High curvature",
  elliptic: "Elliptic",
  hyperbolic: "Hyperbolic / saddle",
  parabolic: "Parabolic / developable",
  umbilic: "Umbilic candidates",
};

export type SurfaceFeatureExtractionParameters = {
  version: number;
  curvatureThreshold: number;
  gaussianZeroTolerance: number;
  umbilicTolerance: number;
  uncertaintyRelativeBand: number;
  sharpEdgeAngleDeg: number;
};

export const DEFAULT_SURFACE_FEATURE_PARAMETERS: SurfaceFeatureExtractionParameters = {
  version: SURFACE_FEATURE_EXTRACTION_VERSION,
  curvatureThreshold: 1,
  gaussianZeroTolerance: 0.05,
  umbilicTolerance: 0.1,
  uncertaintyRelativeBand: 0.15,
  sharpEdgeAngleDeg: 35,
};

export type SurfaceFeatureEdge = readonly [number, number];
export type SurfaceFeaturePoint = readonly [number, number, number];
export type SurfaceFeaturePolyline = readonly SurfaceFeaturePoint[];

export type SurfaceFeatureExtractionResult = {
  parameters: SurfaceFeatureExtractionParameters;
  vertexMasks: Record<SurfaceFeatureClass, Uint8Array>;
  vertexSets: Record<SurfaceFeatureClass, Uint32Array>;
  faceRegionMasks: Record<SurfaceFeatureClass, Uint8Array>;
  edgeSets: {
    boundary: readonly SurfaceFeatureEdge[];
    nonManifold: readonly SurfaceFeatureEdge[];
    sharp: readonly SurfaceFeatureEdge[];
    feature: readonly SurfaceFeatureEdge[];
  };
  polylines: {
    parabolic: readonly SurfaceFeaturePolyline[];
    sharp: readonly SurfaceFeaturePolyline[];
    feature: readonly SurfaceFeaturePolyline[];
  };
  scalars: {
    curvatureStrength: Float32Array;
    gaussianMagnitude: Float32Array;
    umbilicStrength: Float32Array;
    confidence: Float32Array;
  };
  uncertaintyMask: Uint8Array;
  summary: {
    vertexCount: number;
    faceCount: number;
    validVertexCount: number;
    uncertainVertexCount: number;
    classCounts: Record<SurfaceFeatureClass, number>;
    boundaryEdgeCount: number;
    nonManifoldEdgeCount: number;
    sharpEdgeCount: number;
    featureEdgeCount: number;
    parabolicSegmentCount: number;
  };
};

type Triangle = readonly [number, number, number];
type EdgeRecord = { a: number; b: number; faces: number[] };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const edgeKey = (a: number, b: number): string => a < b ? `${a}|${b}` : `${b}|${a}`;

const readPoint = (positions: ArrayLike<number>, vertex: number): SurfaceFeaturePoint => {
  const base = vertex * 3;
  return [Number(positions[base]), Number(positions[base + 1]), Number(positions[base + 2])];
};

const readTriangles = (mesh: SurfaceMeshData, vertexCount: number): Triangle[] => {
  const triangles: Triangle[] = [];
  const source = mesh.indices ?? Uint32Array.from({ length: vertexCount }, (_, index) => index);
  for (let offset = 0; offset + 2 < source.length; offset += 3) {
    const a = Number(source[offset]);
    const b = Number(source[offset + 1]);
    const c = Number(source[offset + 2]);
    if (
      Number.isInteger(a) && Number.isInteger(b) && Number.isInteger(c) &&
      a >= 0 && b >= 0 && c >= 0 && a < vertexCount && b < vertexCount && c < vertexCount &&
      a !== b && b !== c && c !== a
    ) triangles.push([a, b, c]);
  }
  return triangles;
};

const buildEdges = (triangles: readonly Triangle[]): Map<string, EdgeRecord> => {
  const edges = new Map<string, EdgeRecord>();
  triangles.forEach(([a, b, c], face) => {
    for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
      const key = edgeKey(from, to);
      const existing = edges.get(key);
      if (existing) existing.faces.push(face);
      else edges.set(key, { a: Math.min(from, to), b: Math.max(from, to), faces: [face] });
    }
  });
  return edges;
};

const faceNormal = (mesh: SurfaceMeshData, triangle: Triangle): SurfaceFeaturePoint | null => {
  const a = readPoint(mesh.positions, triangle[0]);
  const b = readPoint(mesh.positions, triangle[1]);
  const c = readPoint(mesh.positions, triangle[2]);
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const length = Math.hypot(nx, ny, nz);
  return Number.isFinite(length) && length > 1e-20 ? [nx / length, ny / length, nz / length] : null;
};

const interpolateZero = (
  a: SurfaceFeaturePoint,
  b: SurfaceFeaturePoint,
  valueA: number,
  valueB: number
): SurfaceFeaturePoint => {
  const denominator = valueA - valueB;
  const t = Math.abs(denominator) > 1e-30 ? clamp(valueA / denominator, 0, 1) : 0.5;
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
};

const parabolicSegment = (
  mesh: SurfaceMeshData,
  triangle: Triangle,
  gaussian: ArrayLike<number>,
  validMask: ArrayLike<number>,
  tolerance: number
): SurfaceFeaturePolyline | null => {
  if (triangle.some((vertex) => !validMask[vertex] || !Number.isFinite(gaussian[vertex]))) return null;
  const values = triangle.map((vertex) => Number(gaussian[vertex]));
  if (values.every((value) => Math.abs(value) <= tolerance)) return null;
  if (values.every((value) => value > tolerance) || values.every((value) => value < -tolerance)) return null;

  const points: SurfaceFeaturePoint[] = [];
  const addPoint = (point: SurfaceFeaturePoint) => {
    if (!points.some((entry) => Math.hypot(entry[0] - point[0], entry[1] - point[1], entry[2] - point[2]) <= 1e-10)) {
      points.push(point);
    }
  };
  for (const [left, right] of [[0, 1], [1, 2], [2, 0]] as const) {
    const vertexA = triangle[left];
    const vertexB = triangle[right];
    const valueA = values[left];
    const valueB = values[right];
    const pointA = readPoint(mesh.positions, vertexA);
    const pointB = readPoint(mesh.positions, vertexB);
    if (Math.abs(valueA) <= tolerance) addPoint(pointA);
    if (Math.abs(valueB) <= tolerance) addPoint(pointB);
    if ((valueA < -tolerance && valueB > tolerance) || (valueA > tolerance && valueB < -tolerance)) {
      addPoint(interpolateZero(pointA, pointB, valueA, valueB));
    }
  }
  if (points.length < 2) return null;
  let best: readonly [SurfaceFeaturePoint, SurfaceFeaturePoint] = [points[0], points[1]];
  let bestDistance = -1;
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const distance = Math.hypot(
        points[a][0] - points[b][0],
        points[a][1] - points[b][1],
        points[a][2] - points[b][2]
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [points[a], points[b]];
      }
    }
  }
  return bestDistance > 1e-12 ? best : null;
};

const indicesFromMask = (mask: Uint8Array): Uint32Array => {
  const indices: number[] = [];
  for (let index = 0; index < mask.length; index += 1) if (mask[index]) indices.push(index);
  return Uint32Array.from(indices);
};

const countMask = (mask: Uint8Array): number => {
  let count = 0;
  for (const value of mask) if (value) count += 1;
  return count;
};

export const extractSurfaceFeatures = (
  mesh: SurfaceMeshData,
  differential: MeshDifferentialGeometryResult,
  requested: Partial<SurfaceFeatureExtractionParameters> = {}
): SurfaceFeatureExtractionResult => {
  const parameters: SurfaceFeatureExtractionParameters = {
    ...DEFAULT_SURFACE_FEATURE_PARAMETERS,
    ...requested,
    version: SURFACE_FEATURE_EXTRACTION_VERSION,
    curvatureThreshold: Math.max(0, Number(requested.curvatureThreshold ?? DEFAULT_SURFACE_FEATURE_PARAMETERS.curvatureThreshold)),
    gaussianZeroTolerance: Math.max(0, Number(requested.gaussianZeroTolerance ?? DEFAULT_SURFACE_FEATURE_PARAMETERS.gaussianZeroTolerance)),
    umbilicTolerance: Math.max(0, Number(requested.umbilicTolerance ?? DEFAULT_SURFACE_FEATURE_PARAMETERS.umbilicTolerance)),
    uncertaintyRelativeBand: clamp(Number(requested.uncertaintyRelativeBand ?? DEFAULT_SURFACE_FEATURE_PARAMETERS.uncertaintyRelativeBand), 0, 1),
    sharpEdgeAngleDeg: clamp(Number(requested.sharpEdgeAngleDeg ?? DEFAULT_SURFACE_FEATURE_PARAMETERS.sharpEdgeAngleDeg), 0, 180),
  };
  const vertexCount = Math.min(Math.floor(mesh.positions.length / 3), differential.K.length);
  const triangles = readTriangles(mesh, vertexCount);
  const masks = Object.fromEntries(
    SURFACE_FEATURE_CLASSES.map((featureClass) => [featureClass, new Uint8Array(vertexCount)])
  ) as Record<SurfaceFeatureClass, Uint8Array>;
  const uncertaintyMask = new Uint8Array(vertexCount);
  const curvatureStrength = new Float32Array(vertexCount);
  const gaussianMagnitude = new Float32Array(vertexCount);
  const umbilicStrength = new Float32Array(vertexCount);
  const confidence = new Float32Array(vertexCount);
  let validVertexCount = 0;
  let uncertainVertexCount = 0;
  const relativeBand = parameters.uncertaintyRelativeBand;

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const K = Number(differential.K[vertex]);
    const k1 = Number(differential.k1[vertex]);
    const k2 = Number(differential.k2[vertex]);
    if (!differential.validMask[vertex] || ![K, k1, k2].every(Number.isFinite)) {
      uncertaintyMask[vertex] = SURFACE_FEATURE_UNCERTAINTY.DIFFERENTIAL_WARNING;
      uncertainVertexCount += 1;
      continue;
    }
    validVertexCount += 1;
    const curvature = Math.max(Math.abs(k1), Math.abs(k2));
    const gaussianAbs = Math.abs(K);
    const separation = Math.abs(k1 - k2);
    curvatureStrength[vertex] = curvature;
    gaussianMagnitude[vertex] = gaussianAbs;
    umbilicStrength[vertex] = 1 / (1 + separation);

    masks["high-curvature"][vertex] = curvature >= parameters.curvatureThreshold ? 1 : 0;
    masks.elliptic[vertex] = K > parameters.gaussianZeroTolerance ? 1 : 0;
    masks.hyperbolic[vertex] = K < -parameters.gaussianZeroTolerance ? 1 : 0;
    masks.parabolic[vertex] = gaussianAbs <= parameters.gaussianZeroTolerance ? 1 : 0;
    masks.umbilic[vertex] = separation <= parameters.umbilicTolerance ? 1 : 0;

    let uncertainty = differential.warningMask[vertex]
      ? SURFACE_FEATURE_UNCERTAINTY.DIFFERENTIAL_WARNING
      : 0;
    const withinBand = (value: number, threshold: number) => {
      const width = Math.max(1e-12, threshold * relativeBand);
      return Math.abs(value - threshold) <= width;
    };
    if (withinBand(gaussianAbs, parameters.gaussianZeroTolerance)) {
      uncertainty |= SURFACE_FEATURE_UNCERTAINTY.GAUSSIAN_THRESHOLD;
    }
    if (withinBand(curvature, parameters.curvatureThreshold)) {
      uncertainty |= SURFACE_FEATURE_UNCERTAINTY.CURVATURE_THRESHOLD;
    }
    if (withinBand(separation, parameters.umbilicTolerance)) {
      uncertainty |= SURFACE_FEATURE_UNCERTAINTY.UMBILIC_THRESHOLD;
    }
    uncertaintyMask[vertex] = uncertainty;
    if (uncertainty) uncertainVertexCount += 1;

    const normalizedGaussianDistance = parameters.gaussianZeroTolerance > 0
      ? Math.abs(gaussianAbs - parameters.gaussianZeroTolerance) / parameters.gaussianZeroTolerance
      : gaussianAbs > 0 ? 1 : 0;
    const normalizedCurvatureDistance = parameters.curvatureThreshold > 0
      ? Math.abs(curvature - parameters.curvatureThreshold) / parameters.curvatureThreshold
      : curvature > 0 ? 1 : 0;
    const normalizedUmbilicDistance = parameters.umbilicTolerance > 0
      ? Math.abs(separation - parameters.umbilicTolerance) / parameters.umbilicTolerance
      : separation > 0 ? 1 : 0;
    confidence[vertex] = differential.warningMask[vertex]
      ? 0
      : clamp(Math.min(normalizedGaussianDistance, normalizedCurvatureDistance, normalizedUmbilicDistance), 0, 1);
  }

  const faceRegionMasks = Object.fromEntries(
    SURFACE_FEATURE_CLASSES.map((featureClass) => [featureClass, new Uint8Array(triangles.length)])
  ) as Record<SurfaceFeatureClass, Uint8Array>;
  triangles.forEach((triangle, face) => {
    for (const featureClass of SURFACE_FEATURE_CLASSES) {
      const memberCount = triangle.reduce((count, vertex) => count + (masks[featureClass][vertex] ? 1 : 0), 0);
      if (memberCount >= 2) faceRegionMasks[featureClass][face] = 1;
    }
  });

  const edges = buildEdges(triangles);
  const normals = triangles.map((triangle) => faceNormal(mesh, triangle));
  const boundary: SurfaceFeatureEdge[] = [];
  const nonManifold: SurfaceFeatureEdge[] = [];
  const sharp: SurfaceFeatureEdge[] = [];
  const sharpThreshold = parameters.sharpEdgeAngleDeg * Math.PI / 180;
  for (const edge of edges.values()) {
    const pair: SurfaceFeatureEdge = [edge.a, edge.b];
    if (edge.faces.length === 1) boundary.push(pair);
    else if (edge.faces.length !== 2) nonManifold.push(pair);
    if (edge.faces.length === 2) {
      const left = normals[edge.faces[0]];
      const right = normals[edge.faces[1]];
      if (left && right) {
        const cosine = clamp(Math.abs(left[0] * right[0] + left[1] * right[1] + left[2] * right[2]), -1, 1);
        if (Math.acos(cosine) >= sharpThreshold) sharp.push(pair);
      }
    }
  }
  const featureByKey = new Map<string, SurfaceFeatureEdge>();
  for (const pair of [...boundary, ...nonManifold, ...sharp]) featureByKey.set(edgeKey(pair[0], pair[1]), pair);
  const feature = [...featureByKey.values()];
  const toPolylines = (pairs: readonly SurfaceFeatureEdge[]): SurfaceFeaturePolyline[] => pairs.map(([a, b]) => [
    readPoint(mesh.positions, a),
    readPoint(mesh.positions, b),
  ]);
  const parabolic = triangles
    .map((triangle) => parabolicSegment(mesh, triangle, differential.K, differential.validMask, parameters.gaussianZeroTolerance))
    .filter((segment): segment is SurfaceFeaturePolyline => segment != null);

  const vertexSets = Object.fromEntries(
    SURFACE_FEATURE_CLASSES.map((featureClass) => [featureClass, indicesFromMask(masks[featureClass])])
  ) as Record<SurfaceFeatureClass, Uint32Array>;
  const classCounts = Object.fromEntries(
    SURFACE_FEATURE_CLASSES.map((featureClass) => [featureClass, countMask(masks[featureClass])])
  ) as Record<SurfaceFeatureClass, number>;

  return {
    parameters,
    vertexMasks: masks,
    vertexSets,
    faceRegionMasks,
    edgeSets: { boundary, nonManifold, sharp, feature },
    polylines: {
      parabolic,
      sharp: toPolylines(sharp),
      feature: toPolylines(feature),
    },
    scalars: { curvatureStrength, gaussianMagnitude, umbilicStrength, confidence },
    uncertaintyMask,
    summary: {
      vertexCount,
      faceCount: triangles.length,
      validVertexCount,
      uncertainVertexCount,
      classCounts,
      boundaryEdgeCount: boundary.length,
      nonManifoldEdgeCount: nonManifold.length,
      sharpEdgeCount: sharp.length,
      featureEdgeCount: feature.length,
      parabolicSegmentCount: parabolic.length,
    },
  };
};
