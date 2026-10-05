import { Color } from "three";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { computeMeshDifferentialGeometry, MESH_CURVATURE_WARNING } from "../mesh/meshDifferentialGeometry";

export type CurvatureMapField = "K" | "H";
export const CURVATURE_MAP_COLOURS = { negative: "#2563eb", zero: "#f8fafc", positive: "#dc2626", excluded: "#94a3b8" };
export const savedMeshCurvatureMap = (mesh: SurfaceMeshData, field: CurvatureMapField) => {
  if (mesh.positions.length / 3 > 100_000 || (mesh.indices?.length ?? 0) > 600_000) throw new TypeError("Saved colour maps support up to 100,000 vertices and 200,000 triangles.");
  const report = computeMeshDifferentialGeometry(mesh);
  if (!report) throw new TypeError("A valid triangle Mesh is required for a curvature map.");
  const values = report[field], mask = Uint8Array.from(report.validMask, (valid, i) => valid && !(report.warningMask[i] & MESH_CURVATURE_WARNING.BOUNDARY) && Number.isFinite(values[i]) ? 1 : 0);
  let min = Infinity, max = -Infinity, count = 0;
  for (let i = 0; i < values.length; i++) if (mask[i]) { min = Math.min(min, values[i]); max = Math.max(max, values[i]); count++; }
  const limit = count ? Math.max(Math.abs(min), Math.abs(max)) : 0;
  const colors = new Float32Array(values.length * 3), grey = new Color(CURVATURE_MAP_COLOURS.excluded), neutral = new Color(CURVATURE_MAP_COLOURS.zero);
  for (let i = 0; i < values.length; i++) {
    const colour = !mask[i] ? grey : !limit ? neutral : new Color(values[i] < 0 ? CURVATURE_MAP_COLOURS.negative : CURVATURE_MAP_COLOURS.positive).lerp(neutral, 1 - Math.min(1, Math.abs(values[i]) / limit));
    colour.toArray(colors, i * 3);
  }
  return { field, colors, mask, values, count, excluded: values.length - count, min: count ? min : null, max: count ? max : null, range: { min: -limit, max: limit }, conventions: report.conventions };
};

/** Snap only to vertices of the hit face: coincident sheets retain their own IDs. */
export const pickedMeshVertex = (mesh: SurfaceMeshData, faceIndex: number, point: { x: number; y: number; z: number }): number => {
  const vertexCount = mesh.positions.length / 3, indices = mesh.indices;
  if (!Number.isSafeInteger(faceIndex) || faceIndex < 0 || faceIndex * 3 + 2 >= (indices?.length ?? vertexCount) || ![point.x, point.y, point.z].every(Number.isFinite)) throw new TypeError("Pick a triangle on this saved Mesh.");
  const face = [0, 1, 2].map(offset => indices ? indices[faceIndex * 3 + offset] : faceIndex * 3 + offset);
  if (face.some(index => index >= vertexCount)) throw new TypeError("The picked face has invalid vertex indices.");
  return face.reduce((nearest, index) => {
    const distance = (i: number) => Math.hypot(mesh.positions[3 * i] - point.x, mesh.positions[3 * i + 1] - point.y, mesh.positions[3 * i + 2] - point.z);
    return distance(index) < distance(nearest) ? index : nearest;
  });
};
