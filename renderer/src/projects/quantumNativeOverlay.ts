import type { ProjectCoordinateFrameRead } from "@math3d/core";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import type { OverlayPointSet, OverlayPolylineGroup } from "../components/SurfaceViewer";

export type QuantumOverlayCoordinates = { axes: readonly string[]; units: readonly string[]; handedness: string };

/** Only an identity transform is admitted: all physical axes and units must agree exactly. */
export function qualifyQuantumNativeOverlay(quantum: QuantumOverlayCoordinates, native: ProjectCoordinateFrameRead,
  assertedFrame: string): { ok: true; frame: string; unit: string } | { ok: false; reason: string } {
  if (native.status !== "declared" || !native.value)
    return { ok: false, reason: "Native document needs a declared coordinate frame." };
  if (!assertedFrame.trim() || assertedFrame !== native.value.frame)
    return { ok: false, reason: "Confirm the native frame name for the quantum source." };
  if (quantum.axes.length !== 3 || quantum.units.length !== 3 ||
      quantum.axes.some((axis, index) => axis !== native.value!.axes[index]) ||
      quantum.units.some(unit => unit !== native.value!.unit) ||
      quantum.handedness !== native.value.handedness)
    return { ok: false, reason: "Axes, units or handedness differ; no coordinate transform is defined for this overlay." };
  return { ok: true, frame: assertedFrame, unit: native.value.unit };
}

type Point = { x: number; y: number; z: number };
function clipPolygon(polygon: Point[], threshold: number, keepAbove: boolean): Point[] {
  const inside = (point: Point) => keepAbove ? point.z >= threshold : point.z <= threshold;
  const result: Point[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!, b = polygon[(index + 1) % polygon.length]!;
    if (inside(a)) result.push(a);
    if (inside(a) !== inside(b)) {
      const ratio = (threshold - a.z) / (b.z - a.z);
      result.push({ x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, z: threshold });
    }
  }
  return result;
}
export function clipOverlayMesh(mesh: SurfaceMeshData, minimum: number, maximum: number): SurfaceMeshData {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum)
    throw new TypeError("Invalid overlay clipping slab.");
  const positions: number[] = [], index = mesh.indices;
  const point = (vertex: number): Point => ({ x: mesh.positions[vertex * 3]!, y: mesh.positions[vertex * 3 + 1]!, z: mesh.positions[vertex * 3 + 2]! });
  const count = (index?.length ?? mesh.positions.length / 3) / 3;
  for (let face = 0; face < count; face++) {
    const vertices = [0, 1, 2].map(offset => point(index ? index[face * 3 + offset]! : face * 3 + offset));
    const clipped = clipPolygon(clipPolygon(vertices, minimum, true), maximum, false);
    for (let vertex = 1; vertex + 1 < clipped.length; vertex++)
      for (const value of [clipped[0]!, clipped[vertex]!, clipped[vertex + 1]!]) positions.push(value.x, value.y, value.z);
  }
  return { ...mesh, positions: Float32Array.from(positions), indices: null, normals: null, uvs: null, adjacency: null };
}
export function clipOverlayPoints(groups: readonly OverlayPointSet[], minimum: number, maximum: number): OverlayPointSet[] {
  return groups.map(group => ({ ...group, points: group.points.filter(point => point.z >= minimum && point.z <= maximum) }));
}
export function clipOverlayLines(groups: readonly OverlayPolylineGroup[], minimum: number, maximum: number): OverlayPolylineGroup[] {
  const clip = (a: Point, b: Point): [Point, Point] | null => {
    if (a.z === b.z) return a.z >= minimum && a.z <= maximum ? [a, b] : null;
    const at = (z: number): Point => { const t = (z - a.z) / (b.z - a.z); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z }; };
    const low = a.z < minimum ? at(minimum) : a.z > maximum ? at(maximum) : a;
    const high = b.z < minimum ? at(minimum) : b.z > maximum ? at(maximum) : b;
    if ((a.z < minimum && b.z < minimum) || (a.z > maximum && b.z > maximum)) return null;
    return [low, high];
  };
  return groups.map(group => ({ ...group, lines: group.lines.flatMap(segment => {
    const result = clip(segment[0], segment[1]); return result ? [result] : [];
  }) }));
}
