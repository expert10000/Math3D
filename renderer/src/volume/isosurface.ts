import type { VolumeGrid } from "../scene/datasets";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { gradientVectorAt } from "../scene/volume/sliceVolume";
import type { VolumeIsosurfaceMetadata, VolumeIsosurfaceMetrics, VolumeObject } from "./contracts";
import { analyticVolumeGradientAt } from "./probes";

export type VolumeIsosurfaceGeometry = {
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
};

const vertexKey = (positions: Float32Array, vertex: number): string => {
  const base = vertex * 3;
  return `${Math.round(positions[base] * 1e6)},${Math.round(positions[base + 1] * 1e6)},${Math.round(positions[base + 2] * 1e6)}`;
};

export const computeVolumeIsosurfaceNormals = (
  volume: VolumeObject,
  grid: VolumeGrid,
  positions: Float32Array,
): { normals: Float32Array; method: VolumeIsosurfaceMetadata["normalMethod"]; warnings: string[] } => {
  const normals = new Float32Array(positions.length);
  let valid = 0;
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const base = vertex * 3;
    const point: [number, number, number] = [positions[base], positions[base + 1], positions[base + 2]];
    const gradient = analyticVolumeGradientAt(volume, point) ?? gradientVectorAt(grid, point);
    const length = Math.hypot(gradient[0], gradient[1], gradient[2]);
    if (!(length > 1e-12) || !Number.isFinite(length)) continue;
    normals[base] = gradient[0] / length;
    normals[base + 1] = gradient[1] / length;
    normals[base + 2] = gradient[2] / length;
    valid += 1;
  }
  if (valid === positions.length / 3) return { normals, method: "gradient-derived", warnings: [] };
  return {
    normals: computeFaceAverageNormals(positions),
    method: "face-average-fallback",
    warnings: [`Gradient normals were undefined at ${(positions.length / 3) - valid} vertices; used face-average normals.`],
  };
};

const computeFaceAverageNormals = (positions: Float32Array): Float32Array => {
  const normals = new Float32Array(positions.length);
  for (let base = 0; base + 8 < positions.length; base += 9) {
    const abx = positions[base + 3] - positions[base];
    const aby = positions[base + 4] - positions[base + 1];
    const abz = positions[base + 5] - positions[base + 2];
    const acx = positions[base + 6] - positions[base];
    const acy = positions[base + 7] - positions[base + 1];
    const acz = positions[base + 8] - positions[base + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz) || 1;
    for (let offset = 0; offset < 9; offset += 3) {
      normals[base + offset] = nx / length;
      normals[base + offset + 1] = ny / length;
      normals[base + offset + 2] = nz / length;
    }
  }
  return normals;
};

export const analyzeVolumeIsosurface = (geometry: Pick<VolumeIsosurfaceGeometry, "positions" | "indices">): VolumeIsosurfaceMetrics => {
  const { positions, indices } = geometry;
  const vertexCount = Math.floor(positions.length / 3);
  const faceCount = Math.floor(indices.length / 3);
  if (!vertexCount || !faceCount) return { vertexCount, faceCount, bounds: null, connectedComponents: 0, boundaryEdgeCount: 0, nonManifoldEdgeCount: 0, surfaceArea: 0, enclosedVolume: null, watertight: false };
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const canonicalByKey = new Map<string, number>();
  const canonical = new Uint32Array(vertexCount);
  let canonicalCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const base = vertex * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[base + axis]);
      max[axis] = Math.max(max[axis], positions[base + axis]);
    }
    const key = vertexKey(positions, vertex);
    let id = canonicalByKey.get(key);
    if (id == null) { id = canonicalCount++; canonicalByKey.set(key, id); }
    canonical[vertex] = id;
  }
  const edges = new Map<string, number>();
  const adjacency = Array.from({ length: canonicalCount }, () => new Set<number>());
  let surfaceArea = 0;
  let signedVolume = 0;
  for (let face = 0; face < faceCount; face += 1) {
    const vertices = [indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2]];
    const ids = vertices.map((vertex) => canonical[vertex]);
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      const left = Math.min(ids[a], ids[b]); const right = Math.max(ids[a], ids[b]);
      const key = `${left}:${right}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
      adjacency[left].add(right); adjacency[right].add(left);
    }
    const a = vertices[0] * 3; const b = vertices[1] * 3; const c = vertices[2] * 3;
    const abx = positions[b] - positions[a]; const aby = positions[b + 1] - positions[a + 1]; const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a]; const acy = positions[c + 1] - positions[a + 1]; const acz = positions[c + 2] - positions[a + 2];
    surfaceArea += 0.5 * Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    signedVolume += (positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c]) + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])) / 6;
  }
  let connectedComponents = 0;
  const visited = new Uint8Array(canonicalCount);
  for (let seed = 0; seed < canonicalCount; seed += 1) {
    if (visited[seed]) continue;
    connectedComponents += 1;
    const stack = [seed]; visited[seed] = 1;
    while (stack.length) for (const next of adjacency[stack.pop() ?? seed]) if (!visited[next]) { visited[next] = 1; stack.push(next); }
  }
  const boundaryEdgeCount = [...edges.values()].filter((count) => count === 1).length;
  const nonManifoldEdgeCount = [...edges.values()].filter((count) => count > 2).length;
  const watertight = boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0;
  return { vertexCount, faceCount, bounds: { min, max }, connectedComponents, boundaryEdgeCount, nonManifoldEdgeCount, surfaceArea, enclosedVolume: watertight ? Math.abs(signedVolume) : null, watertight };
};

export const createVolumeIsosurfaceMesh = (args: {
  resultId: string;
  label: string;
  sourceVolumeId: string;
  sourceVolumeRevision: number;
  sourceSampledGridRevision: number;
  metadata: VolumeIsosurfaceMetadata;
  geometry: VolumeIsosurfaceGeometry;
  role: "live" | "snapshot" | "detached";
}): SurfaceMeshData => ({
  label: args.label,
  positions: new Float32Array(args.geometry.positions),
  indices: new Uint32Array(args.geometry.indices),
  normals: new Float32Array(args.geometry.normals),
  source: {
    kind: "derivedVolume",
    role: args.role,
    resultId: args.resultId,
    sourceVolumeId: args.sourceVolumeId,
    sourceVolumeRevision: args.sourceVolumeRevision,
    sourceSampledGridRevision: args.sourceSampledGridRevision,
    isoValue: args.metadata.isoValue,
    algorithm: args.metadata.algorithm,
    backend: args.metadata.backend,
    correspondenceId: args.metadata.correspondence.id,
    createdAt: Date.now(),
  },
  adjacency: null,
  meanEdgeLength: null,
  validation: null,
});
