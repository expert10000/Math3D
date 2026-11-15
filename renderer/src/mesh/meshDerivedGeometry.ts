import type { SurfaceMeshData } from "./surfaceMesh";

export type MeshDerivedGeometryKind =
  | "vertex-point" | "edge-line" | "edge-loop-polyline" | "face-plane"
  | "face-region-surface" | "bounding-box" | "principal-axes" | "symmetry-plane";

export type MeshDerivedGeometryLineage = {
  readonly sourceMeshLabel: string;
  readonly sourceComponentIds: readonly string[];
  readonly sourceRevision: number;
  readonly kind: MeshDerivedGeometryKind;
};

export function meshVertex(mesh: SurfaceMeshData, index: number): { x: number; y: number; z: number } | null {
  const start = index * 3;
  if (!Number.isInteger(index) || index < 0 || start + 2 >= mesh.positions.length) return null;
  const [x, y, z] = [mesh.positions[start], mesh.positions[start + 1], mesh.positions[start + 2]];
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
}

export function meshFaceVertices(mesh: SurfaceMeshData, index: number): readonly [number, number, number] | null {
  const start = index * 3;
  if (!Number.isInteger(index) || index < 0) return null;
  const indices = mesh.indices;
  const count = indices?.length ?? mesh.positions.length / 3;
  if (start + 2 >= count) return null;
  return indices ? [indices[start], indices[start + 1], indices[start + 2]] : [start, start + 1, start + 2];
}

export function extractMeshFaceRegion(mesh: SurfaceMeshData, faceIndices: readonly number[]): SurfaceMeshData | null {
  const unique = [...new Set(faceIndices)];
  const faces = unique.map((index) => meshFaceVertices(mesh, index));
  if (!faces.length || faces.some((face) => !face || face.some((index) => !meshVertex(mesh, index)))) return null;
  return {
    ...mesh,
    label: `${mesh.label} / face region`,
    positions: Float32Array.from(mesh.positions),
    indices: Uint32Array.from(faces.flatMap((face) => [...face!])),
    normals: mesh.normals ? Float32Array.from(mesh.normals) : null,
    uvs: mesh.uvs ? Float32Array.from(mesh.uvs) : null,
  };
}

export function meshEdgeLoopVertices(edges: readonly (readonly [number, number])[]): readonly number[] | null {
  if (!edges.length) return null;
  const remaining = edges.map((edge) => [edge[0], edge[1]] as [number, number]);
  const first = remaining.shift()!;
  const ordered = [first[0], first[1]];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    const index = remaining.findIndex(([a, b]) => a === last || b === last);
    if (index < 0) return null;
    const [a, b] = remaining.splice(index, 1)[0];
    ordered.push(a === last ? b : a);
  }
  return ordered;
}
