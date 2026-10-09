import type { GeometryScene } from "../geometry/types";

type Vec3 = { x: number; y: number; z: number };
type SourceObject = { id: string; label: string; kind: string; style: { color: string; opacity: number; size: number } };
export type QuantumPrimitive = {
  objectId: string; objectLabel: string; sampleId: string; kind: "site" | "link";
  index: number; position: Vec3; endpoints?: [Vec3, Vec3];
};
export type QuantumPrimitiveMesh = {
  id: string; label: string; positions: Float32Array; indices: null;
  source: { kind: "polyhedronPreset"; label: string };
  color: number; opacity: number; flatShading: true;
  primitivesByFace: QuantumPrimitive[];
};

// Source object IDs are portable; sample IDs are deterministic local addresses
// within the verified position dataset. No atomic species or bond order is inferred.
export const MAX_PICKABLE_PRIMITIVES_PER_OBJECT = 512;
const addFace = (out: number[], a: Vec3, b: Vec3, c: Vec3) =>
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
const plus = (a: Vec3, b: Vec3, s = 1): Vec3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s });

function addSite(out: number[], center: Vec3, radius: number): number {
  const x = { x: radius, y: 0, z: 0 }, y = { x: 0, y: radius, z: 0 }, z = { x: 0, y: 0, z: radius };
  const px = plus(center, x), nx = plus(center, x, -1);
  const py = plus(center, y), ny = plus(center, y, -1);
  const pz = plus(center, z), nz = plus(center, z, -1);
  for (const [a, b, c] of [[px, py, pz], [py, nx, pz], [nx, ny, pz], [ny, px, pz],
    [py, px, nz], [nx, py, nz], [ny, nx, nz], [px, ny, nz]] as [Vec3, Vec3, Vec3][]) addFace(out, a, b, c);
  return 8;
}

function addLink(out: number[], a: Vec3, b: Vec3, radius: number): number {
  const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (length < 1e-12) return addSite(out, a, radius);
  const d = { x: (b.x - a.x) / length, y: (b.y - a.y) / length, z: (b.z - a.z) / length };
  const seed = Math.abs(d.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const cross = { x: d.y * seed.z - d.z * seed.y, y: d.z * seed.x - d.x * seed.z, z: d.x * seed.y - d.y * seed.x };
  const norm = Math.hypot(cross.x, cross.y, cross.z);
  const u = { x: cross.x * radius / norm, y: cross.y * radius / norm, z: cross.z * radius / norm };
  const v = { x: d.y * u.z - d.z * u.y, y: d.z * u.x - d.x * u.z, z: d.x * u.y - d.y * u.x };
  const ring = (center: Vec3) => [plus(center, u), plus(center, v), plus(center, u, -1), plus(center, v, -1)];
  const start = ring(a), end = ring(b);
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    addFace(out, start[i], end[i], end[next]);
    addFace(out, start[i], end[next], start[next]);
  }
  addFace(out, start[0], start[1], start[2]); addFace(out, start[0], start[2], start[3]);
  addFace(out, end[0], end[2], end[1]); addFace(out, end[0], end[3], end[2]);
  return 12;
}

export function buildQuantumPrimitiveMeshes(
  geometry: GeometryScene, objects: SourceObject[], mappedObjectIds: readonly string[],
): QuantumPrimitiveMesh[] {
  const mapped = new Set(mappedObjectIds);
  const sourcePoints = geometry.points ?? [], sourceSegments = geometry.segments ?? [];
  const all = [...sourcePoints, ...sourceSegments.flatMap(segment => [segment.a, segment.b])];
  const extent = all.length ? Math.hypot(
    Math.max(...all.map(p => p.x)) - Math.min(...all.map(p => p.x)),
    Math.max(...all.map(p => p.y)) - Math.min(...all.map(p => p.y)),
    Math.max(...all.map(p => p.z)) - Math.min(...all.map(p => p.z)),
  ) : 1;
  const scale = Math.max(0.05, Math.min(100, extent || 1));
  return objects.flatMap(object => {
    if (!mapped.has(object.id) || !["point-cloud", "segments"].includes(object.kind)) return [];
    const positions: number[] = [], primitivesByFace: QuantumPrimitive[] = [];
    const radius = Math.min(scale * 0.08, Math.max(scale * 0.008, scale * 0.018 * object.style.size));
    if (object.kind === "point-cloud") {
      const points = sourcePoints.filter(point => point.id?.startsWith(`${object.id}:site:`));
      if (points.length > MAX_PICKABLE_PRIMITIVES_PER_OBJECT) return [];
      points.forEach((point, index) => {
        const primitive: QuantumPrimitive = { objectId: object.id, objectLabel: object.label,
          sampleId: point.id!, kind: "site", index, position: { x: point.x, y: point.y, z: point.z } };
        const faces = addSite(positions, point, radius);
        for (let face = 0; face < faces; face++) primitivesByFace.push(primitive);
      });
    } else {
      const segments = sourceSegments.filter(segment => segment.a.id?.startsWith(`${object.id}:link:`));
      if (segments.length > MAX_PICKABLE_PRIMITIVES_PER_OBJECT) return [];
      segments.forEach((segment, index) => {
        const a = segment.a, b = segment.b;
        const primitive: QuantumPrimitive = { objectId: object.id, objectLabel: object.label,
          sampleId: `${object.id}:link:${index}`, kind: "link", index,
          position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
          endpoints: [a, b] };
        const faces = addLink(positions, a, b, radius * 0.5);
        for (let face = 0; face < faces; face++) primitivesByFace.push(primitive);
      });
    }
    if (!positions.length) return [];
    return [{ id: object.id, label: object.label, positions: Float32Array.from(positions), indices: null,
      source: { kind: "polyhedronPreset" as const, label: object.label },
      color: Number.parseInt(object.style.color.slice(1), 16), opacity: object.style.opacity,
      flatShading: true as const, primitivesByFace }];
  });
}
