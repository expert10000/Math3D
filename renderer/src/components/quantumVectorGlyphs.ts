import type { GeometryScene } from "../geometry/types";
import { buildQuantumPrimitiveMeshes, type QuantumPrimitiveMesh } from "./quantumPrimitiveMeshes";

export type VectorGlyphDisplay = {
  objectId: string; count: number; positionUnit: string; vectorUnit: string; zeroCount: number;
  glyphs: { sampleIndex: number; origin: [number, number, number]; direction: [number, number, number] }[];
};
type VectorObject = { id: string; label: string; style: { color: string; opacity: number; size: number } };
const asPoint = (values: [number, number, number]) => ({ x: values[0], y: values[1], z: values[2] });

function displayExtent(geometry: GeometryScene, displays: VectorGlyphDisplay[]): number {
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const add = (point: { x: number; y: number; z: number }) => {
    [point.x, point.y, point.z].forEach((value, axis) => {
      bounds.min[axis] = Math.min(bounds.min[axis], value);
      bounds.max[axis] = Math.max(bounds.max[axis], value);
    });
  };
  geometry.points?.forEach(add);
  geometry.segments?.forEach(segment => { add(segment.a); add(segment.b); });
  geometry.triangles?.forEach(face => { add(face.a); add(face.b); add(face.c); });
  displays.forEach(display => display.glyphs.forEach(glyph => add(asPoint(glyph.origin))));
  const spans = bounds.min.map((minimum, axis) => bounds.max[axis] - minimum);
  const extent = Math.hypot(...spans);
  return Number.isFinite(extent) && extent > 0 ? extent : 1;
}

/** Uniform display-only arrow lengths; direction is supplied, magnitude is inspected separately. */
export function buildQuantumVectorGlyphMeshes(geometry: GeometryScene, displays: VectorGlyphDisplay[],
  objects: VectorObject[], maxGlyphs: 16 | 64 | 128): QuantumPrimitiveMesh[] {
  const length = Math.max(0.04, Math.min(10, displayExtent(geometry, displays) * 0.075));
  return displays.flatMap(display => {
    const object = objects.find(candidate => candidate.id === display.objectId);
    if (!object) return [];
    const selected = display.glyphs.length <= maxGlyphs ? display.glyphs :
      Array.from({ length: maxGlyphs }, (_, ordinal) => display.glyphs[
        Math.round(ordinal * (display.glyphs.length - 1) / (maxGlyphs - 1))]);
    const segments: NonNullable<GeometryScene["segments"]> = [];
    selected.forEach(glyph => {
      const [dx, dy, dz] = glyph.direction;
      const origin = asPoint(glyph.origin);
      const tip = { x: origin.x + dx * length, y: origin.y + dy * length, z: origin.z + dz * length };
      const seed = Math.abs(dz) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      const normal = [dy * seed[2] - dz * seed[1], dz * seed[0] - dx * seed[2], dx * seed[1] - dy * seed[0]];
      const norm = Math.hypot(...normal);
      for (const [a, b] of [[origin, tip],
        [tip, { x: tip.x - dx * length * 0.25 + normal[0] / norm * length * 0.11,
          y: tip.y - dy * length * 0.25 + normal[1] / norm * length * 0.11,
          z: tip.z - dz * length * 0.25 + normal[2] / norm * length * 0.11 }],
        [tip, { x: tip.x - dx * length * 0.25 - normal[0] / norm * length * 0.11,
          y: tip.y - dy * length * 0.25 - normal[1] / norm * length * 0.11,
          z: tip.z - dz * length * 0.25 - normal[2] / norm * length * 0.11 }]] as const) {
        const segmentIndex = segments.length;
        segments.push({ a: { ...a, id: `${object.id}:link:${segmentIndex}:a` },
          b: { ...b, id: `${object.id}:link:${segmentIndex}:b` },
          color: Number.parseInt(object.style.color.slice(1), 16), opacity: object.style.opacity });
      }
    });
    const meshes = buildQuantumPrimitiveMeshes({ segments }, [{ ...object, kind: "segments" }], [object.id]);
    return meshes.map(mesh => ({ ...mesh, primitivesByFace: mesh.primitivesByFace.map(primitive => {
      const sampleIndex = selected[Math.floor(primitive.index / 3)].sampleIndex;
      return { ...primitive, index: sampleIndex, sampleId: `${object.id}:sample:${sampleIndex}` };
    }) }));
  });
}
