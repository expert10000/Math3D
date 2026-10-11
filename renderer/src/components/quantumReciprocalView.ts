import type { GeometryScene } from "../geometry/types";
import type { QuantumPrimitive } from "./quantumPrimitiveMeshes";

export type ReciprocalDefinition = {
  directBasis: [number, number, number][];
  basis: [number, number, number][];
  directUnit: string;
  reciprocalUnit: string;
  pointObject: string;
  points: { id: string; label: string; position: [number, number, number] }[];
  paths: { object: string; label: string; points: string[] }[];
  boundaryObjects: string[];
};

type SourceObject = { id: string; label: string; kind: string; style: { color: string; opacity: number; size: number } };
export type ReciprocalPointSelection = { id: string; label: string; position: [number, number, number];
  sourceObjectId: string; sourceSampleIndex: number };
export type ReciprocalPathSelection = { objectId: string; label: string; segmentIndex: number;
  fromId: string; toId: string };

/** Keep supplied k-space objects separate from real-space and energy geometry. */
export function buildQuantumReciprocalView(geometry: GeometryScene, reciprocal: ReciprocalDefinition,
  objects: SourceObject[], mappedObjectIds: readonly string[]) {
  const ids = new Set([reciprocal.pointObject, ...reciprocal.paths.map(path => path.object),
    ...reciprocal.boundaryObjects]);
  const mapped = mappedObjectIds.filter(id => ids.has(id));
  const active = new Set(mapped);
  const points = (geometry.points ?? []).filter(point => [...active].some(id => point.id?.startsWith(`${id}:site:`)));
  const segments = (geometry.segments ?? []).filter(segment =>
    [...active].some(id => segment.a.id?.startsWith(`${id}:link:`)));
  // Display guides are literal supplied basis vectors, not a new reciprocal calculation.
  const basisGuides = reciprocal.basis.map((b, index) => ({
    a: { x: 0, y: 0, z: 0, id: `reciprocal:guide:${index}:origin` },
    b: { x: b[0], y: b[1], z: b[2], id: `reciprocal:guide:${index}:tip` },
    color: 0x5995f0, opacity: 1,
  }));
  return { geometry: { points, segments: [...segments, ...basisGuides], triangles: [] } as GeometryScene,
    objects: objects.filter(object => active.has(object.id)), mappedObjectIds: mapped,
    labels: [...reciprocal.points.map(point => ({ text: point.label,
      position: { x: point.position[0], y: point.position[1], z: point.position[2] } })),
      ...reciprocal.basis.map((b, index) => ({ text: `b${index + 1}`,
        position: { x: b[0], y: b[1], z: b[2] } }))] };
}

export function reciprocalPointFromPrimitive(reciprocal: ReciprocalDefinition,
  primitive: QuantumPrimitive | null): ReciprocalPointSelection | null {
  if (!primitive || primitive.kind !== "site" || primitive.objectId !== reciprocal.pointObject) return null;
  const point = reciprocal.points[primitive.index];
  return point ? { ...point, sourceObjectId: primitive.objectId, sourceSampleIndex: primitive.index } : null;
}

export function reciprocalPathFromPrimitive(reciprocal: ReciprocalDefinition,
  primitive: QuantumPrimitive | null): ReciprocalPathSelection | null {
  if (!primitive || primitive.kind !== "link") return null;
  const path = reciprocal.paths.find(candidate => candidate.object === primitive.objectId);
  if (!path || primitive.index + 1 >= path.points.length) return null;
  return { objectId: path.object, label: path.label, segmentIndex: primitive.index,
    fromId: path.points[primitive.index], toId: path.points[primitive.index + 1] };
}
