import { buildVertexAdjacency } from "../math/ridgeValley";
import { stitchRidgeValleyCurves } from "../math/ridgeValleyStitch";
import {
  MESH_CURVATURE_WARNING,
  type MeshDifferentialGeometryResult,
} from "./meshDifferentialGeometry";
import type { SurfaceMeshData } from "./surfaceMesh";

export const RIDGE_VALLEY_EXTRACTION_VERSION = 1;

export type RidgeValleyPrincipalFamily = "k1" | "k2";

export type RidgeValleyExtractionParameters = {
  version: number;
  ridgeFamily: RidgeValleyPrincipalFamily;
  valleyFamily: RidgeValleyPrincipalFamily;
  minAbsCurvature: number;
  minDirectionalContrast: number;
  minDirectionCos: number;
  neighborhoodRings: number;
  smoothingIterations: number;
  minLineLength: number;
  minConfidence: number;
  maxCurves: number;
  sampleStride: number;
  decimateSpacing: number;
};

export const DEFAULT_RIDGE_VALLEY_PARAMETERS: RidgeValleyExtractionParameters = {
  version: RIDGE_VALLEY_EXTRACTION_VERSION,
  ridgeFamily: "k1",
  valleyFamily: "k2",
  minAbsCurvature: 0.05,
  minDirectionalContrast: 0.01,
  minDirectionCos: 0.3,
  neighborhoodRings: 1,
  smoothingIterations: 0,
  minLineLength: 0,
  minConfidence: 0,
  maxCurves: 200,
  sampleStride: 1,
  decimateSpacing: 0.002,
};

export type RidgeValleyPolyline = Float32Array;

export type RidgeValleyExtractionResult = {
  parameters: RidgeValleyExtractionParameters;
  directionalDerivatives: { ridge: Float32Array; valley: Float32Array };
  candidateMasks: { ridge: Uint8Array; valley: Uint8Array };
  confidence: { ridge: Float32Array; valley: Float32Array };
  uncertaintyMask: Uint8Array;
  segments: { ridge: Float32Array; valley: Float32Array };
  polylines: { ridge: RidgeValleyPolyline[]; valley: RidgeValleyPolyline[] };
  summary: {
    vertexCount: number;
    validDirectionVertexCount: number;
    uncertainVertexCount: number;
    ridgeCandidateCount: number;
    valleyCandidateCount: number;
    ridgeLineCount: number;
    valleyLineCount: number;
    ridgeTotalLength: number;
    valleyTotalLength: number;
    ready: boolean;
  };
  provenance: {
    method: string;
    dependencies: readonly ["normals", "curvature", "principal-directions"];
    principalCurvatureConvention: string;
    uncertaintyPolicy: string;
    version: number;
  };
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalizeParameters = (
  parameters: RidgeValleyExtractionParameters
): RidgeValleyExtractionParameters => ({
  version: RIDGE_VALLEY_EXTRACTION_VERSION,
  ridgeFamily: parameters.ridgeFamily === "k2" ? "k2" : "k1",
  valleyFamily: parameters.valleyFamily === "k1" ? "k1" : "k2",
  minAbsCurvature: Math.max(0, Number(parameters.minAbsCurvature) || 0),
  minDirectionalContrast: Math.max(0, Number(parameters.minDirectionalContrast) || 0),
  minDirectionCos: clamp(Number(parameters.minDirectionCos) || 0, 0, 0.999),
  neighborhoodRings: clamp(Math.round(Number(parameters.neighborhoodRings) || 1), 1, 4),
  smoothingIterations: clamp(Math.round(Number(parameters.smoothingIterations) || 0), 0, 8),
  minLineLength: Math.max(0, Number(parameters.minLineLength) || 0),
  minConfidence: Math.max(0, Number(parameters.minConfidence) || 0),
  maxCurves: Math.max(0, Math.round(Number(parameters.maxCurves) || 0)),
  sampleStride: Math.max(1, Math.round(Number(parameters.sampleStride) || 1)),
  decimateSpacing: Math.max(0, Number(parameters.decimateSpacing) || 0),
});

const expandNeighborhoods = (adjacency: number[][], rings: number): number[][] => {
  if (rings <= 1) return adjacency;
  return adjacency.map((direct, vertex) => {
    const found = new Set<number>(direct);
    let frontier = direct.slice();
    for (let ring = 1; ring < rings; ring += 1) {
      const next: number[] = [];
      for (const current of frontier) {
        for (const neighbor of adjacency[current] ?? []) {
          if (neighbor === vertex || found.has(neighbor)) continue;
          found.add(neighbor);
          next.push(neighbor);
        }
      }
      frontier = next;
    }
    return [...found];
  });
};

const smoothScalar = (
  source: Float32Array,
  adjacency: number[][],
  validMask: Uint8Array,
  iterations: number
): Float32Array => {
  let current = new Float32Array(source);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = new Float32Array(current);
    for (let vertex = 0; vertex < current.length; vertex += 1) {
      if (!validMask[vertex] || !Number.isFinite(current[vertex])) continue;
      let sum = current[vertex] * 2;
      let weight = 2;
      for (const neighbor of adjacency[vertex] ?? []) {
        if (!validMask[neighbor] || !Number.isFinite(current[neighbor])) continue;
        sum += current[neighbor];
        weight += 1;
      }
      next[vertex] = sum / weight;
    }
    current = next;
  }
  return current;
};

type DirectionalPair = { plus: number; minus: number; plusDistance: number; minusDistance: number };

const pickDirectionalPair = (
  positions: Float32Array,
  neighbors: number[][],
  vertex: number,
  directions: Float32Array,
  minCos: number,
  stableMask: Uint8Array
): DirectionalPair | null => {
  const base = vertex * 3;
  let dx = directions[base];
  let dy = directions[base + 1];
  let dz = directions[base + 2];
  const directionLength = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(directionLength) || directionLength <= 1e-12) return null;
  dx /= directionLength;
  dy /= directionLength;
  dz /= directionLength;
  const px = positions[base];
  const py = positions[base + 1];
  const pz = positions[base + 2];
  let plus = -1;
  let minus = -1;
  let plusScore = minCos;
  let minusScore = minCos;
  let plusDistance = 0;
  let minusDistance = 0;
  for (const neighbor of neighbors[vertex] ?? []) {
    if (!stableMask[neighbor]) continue;
    const neighborBase = neighbor * 3;
    const vx = positions[neighborBase] - px;
    const vy = positions[neighborBase + 1] - py;
    const vz = positions[neighborBase + 2] - pz;
    const distance = Math.hypot(vx, vy, vz);
    if (!Number.isFinite(distance) || distance <= 1e-12) continue;
    const score = (vx * dx + vy * dy + vz * dz) / distance;
    if (score > plusScore) {
      plus = neighbor;
      plusScore = score;
      plusDistance = distance;
    }
    if (-score > minusScore) {
      minus = neighbor;
      minusScore = -score;
      minusDistance = distance;
    }
  }
  return plus >= 0 && minus >= 0 ? { plus, minus, plusDistance, minusDistance } : null;
};

const polylineLength = (line: Float32Array): number => {
  let total = 0;
  for (let offset = 3; offset + 2 < line.length; offset += 3) {
    total += Math.hypot(
      line[offset] - line[offset - 3],
      line[offset + 1] - line[offset - 2],
      line[offset + 2] - line[offset - 1]
    );
  }
  return total;
};

const averageEdgeLength = (positions: Float32Array, adjacency: number[][]): number => {
  let total = 0;
  let count = 0;
  for (let vertex = 0; vertex < adjacency.length; vertex += 1) {
    const base = vertex * 3;
    for (const neighbor of adjacency[vertex] ?? []) {
      if (neighbor <= vertex) continue;
      const other = neighbor * 3;
      total += Math.hypot(
        positions[other] - positions[base],
        positions[other + 1] - positions[base + 1],
        positions[other + 2] - positions[base + 2]
      );
      count += 1;
    }
  }
  return count ? total / count : 0;
};

const severeWarningMask =
  MESH_CURVATURE_WARNING.NON_MANIFOLD |
  MESH_CURVATURE_WARNING.DEGENERATE |
  MESH_CURVATURE_WARNING.NEARLY_FLAT |
  MESH_CURVATURE_WARNING.UMBILIC |
  MESH_CURVATURE_WARNING.INCONSISTENT_ORIENTATION |
  MESH_CURVATURE_WARNING.INSUFFICIENT_NEIGHBORHOOD |
  MESH_CURVATURE_WARNING.CURVATURE_IDENTITY;

export const extractRidgesAndValleys = (
  mesh: SurfaceMeshData,
  differential: MeshDifferentialGeometryResult,
  rawParameters: RidgeValleyExtractionParameters
): RidgeValleyExtractionResult => {
  const parameters = normalizeParameters(rawParameters);
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const adjacency = buildVertexAdjacency(mesh.indices, vertexCount);
  const neighborhoods = expandNeighborhoods(adjacency, parameters.neighborhoodRings);
  const uncertaintyMask = new Uint8Array(vertexCount);
  const stableMask = new Uint8Array(vertexCount);
  let validDirectionVertexCount = 0;
  let uncertainVertexCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const stable =
      differential.validMask[vertex] === 1 &&
      differential.directionValidMask[vertex] === 1 &&
      (differential.warningMask[vertex] & severeWarningMask) === 0;
    stableMask[vertex] = stable ? 1 : 0;
    if (stable) validDirectionVertexCount += 1;
    else {
      uncertaintyMask[vertex] = 1;
      uncertainVertexCount += 1;
    }
  }

  const smoothedFields = {
    k1: smoothScalar(differential.k1, adjacency, stableMask, parameters.smoothingIterations),
    k2: smoothScalar(differential.k2, adjacency, stableMask, parameters.smoothingIterations),
  };
  const ridgeField = smoothedFields[parameters.ridgeFamily];
  const valleyField = smoothedFields[parameters.valleyFamily];
  const ridgeExtremumDirection = differential[parameters.ridgeFamily === "k1" ? "d1" : "d2"];
  const valleyExtremumDirection = differential[parameters.valleyFamily === "k1" ? "d1" : "d2"];
  const ridgeTraceDirection = differential[parameters.ridgeFamily === "k1" ? "d2" : "d1"];
  const valleyTraceDirection = differential[parameters.valleyFamily === "k1" ? "d2" : "d1"];
  const ridgeDerivative = new Float32Array(vertexCount).fill(Number.NaN);
  const valleyDerivative = new Float32Array(vertexCount).fill(Number.NaN);
  const ridgeMask = new Uint8Array(vertexCount);
  const valleyMask = new Uint8Array(vertexCount);
  const ridgeConfidence = new Float32Array(vertexCount);
  const valleyConfidence = new Float32Array(vertexCount);
  const ridgeSegments: number[] = [];
  const valleySegments: number[] = [];
  const segmentHalfLength = averageEdgeLength(mesh.positions, adjacency) * 0.45;
  const stride = parameters.sampleStride;

  const evaluate = (
    field: Float32Array,
    direction: Float32Array,
    traceDirection: Float32Array,
    kind: "ridge" | "valley",
    vertex: number
  ) => {
    const center = field[vertex];
    if (!Number.isFinite(center) || Math.abs(center) < parameters.minAbsCurvature) return;
    const pair = pickDirectionalPair(
      mesh.positions,
      neighborhoods,
      vertex,
      direction,
      parameters.minDirectionCos,
      stableMask
    );
    if (!pair) return;
    const plusValue = field[pair.plus];
    const minusValue = field[pair.minus];
    if (!Number.isFinite(plusValue) || !Number.isFinite(minusValue)) return;
    const derivative = 0.5 * (
      (plusValue - center) / pair.plusDistance +
      (center - minusValue) / pair.minusDistance
    );
    const contrast = kind === "ridge"
      ? Math.min(center - plusValue, center - minusValue)
      : Math.min(plusValue - center, minusValue - center);
    (kind === "ridge" ? ridgeDerivative : valleyDerivative)[vertex] = derivative;
    if (contrast < parameters.minDirectionalContrast) return;
    const confidence = contrast * Math.abs(center);
    if (confidence < parameters.minConfidence) return;
    const mask = kind === "ridge" ? ridgeMask : valleyMask;
    const confidenceField = kind === "ridge" ? ridgeConfidence : valleyConfidence;
    mask[vertex] = 1;
    confidenceField[vertex] = confidence;
    if (segmentHalfLength <= 0) return;
    const base = vertex * 3;
    let tx = traceDirection[base];
    let ty = traceDirection[base + 1];
    let tz = traceDirection[base + 2];
    const length = Math.hypot(tx, ty, tz);
    if (!Number.isFinite(length) || length <= 1e-12) return;
    tx /= length;
    ty /= length;
    tz /= length;
    const px = mesh.positions[base];
    const py = mesh.positions[base + 1];
    const pz = mesh.positions[base + 2];
    (kind === "ridge" ? ridgeSegments : valleySegments).push(
      px - tx * segmentHalfLength,
      py - ty * segmentHalfLength,
      pz - tz * segmentHalfLength,
      px + tx * segmentHalfLength,
      py + ty * segmentHalfLength,
      pz + tz * segmentHalfLength
    );
  };

  for (let vertex = 0; vertex < vertexCount; vertex += stride) {
    if (!stableMask[vertex]) continue;
    evaluate(ridgeField, ridgeExtremumDirection, ridgeTraceDirection, "ridge", vertex);
    evaluate(valleyField, valleyExtremumDirection, valleyTraceDirection, "valley", vertex);
  }

  const trace = (
    mask: Uint8Array,
    confidence: Float32Array,
    direction: Float32Array
  ): Float32Array[] => stitchRidgeValleyCurves({
    featureMask: mask,
    positions: mesh.positions,
    normals: differential.normals,
    dirField: direction,
    neighbors: adjacency,
    minCosLink: parameters.minDirectionCos,
    confidence,
    minConf: parameters.minConfidence,
    maxCurves: parameters.maxCurves,
    decimateEps: parameters.decimateSpacing,
    smoothIterations: parameters.smoothingIterations,
  }).polylines.filter((line) => polylineLength(line) >= parameters.minLineLength);

  const ridgePolylines = trace(ridgeMask, ridgeConfidence, ridgeTraceDirection);
  const valleyPolylines = trace(valleyMask, valleyConfidence, valleyTraceDirection);
  const ridgeTotalLength = ridgePolylines.reduce((total, line) => total + polylineLength(line), 0);
  const valleyTotalLength = valleyPolylines.reduce((total, line) => total + polylineLength(line), 0);
  let ridgeCandidateCount = 0;
  let valleyCandidateCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    ridgeCandidateCount += ridgeMask[vertex];
    valleyCandidateCount += valleyMask[vertex];
  }

  return {
    parameters,
    directionalDerivatives: { ridge: ridgeDerivative, valley: valleyDerivative },
    candidateMasks: { ridge: ridgeMask, valley: valleyMask },
    confidence: { ridge: ridgeConfidence, valley: valleyConfidence },
    uncertaintyMask,
    segments: { ridge: new Float32Array(ridgeSegments), valley: new Float32Array(valleySegments) },
    polylines: { ridge: ridgePolylines, valley: valleyPolylines },
    summary: {
      vertexCount,
      validDirectionVertexCount,
      uncertainVertexCount,
      ridgeCandidateCount,
      valleyCandidateCount,
      ridgeLineCount: ridgePolylines.length,
      valleyLineCount: valleyPolylines.length,
      ridgeTotalLength,
      valleyTotalLength,
      ready: vertexCount > 0 && validDirectionVertexCount > 0,
    },
    provenance: {
      method: "principal-curvature directional extrema with reciprocal-neighbor tracing",
      dependencies: ["normals", "curvature", "principal-directions"],
      principalCurvatureConvention: differential.conventions.principalCurvatureOrder,
      uncertaintyPolicy: "suppress invalid, non-manifold, degenerate, flat, umbilic, inconsistent, and underfit directions",
      version: RIDGE_VALLEY_EXTRACTION_VERSION,
    },
  };
};
