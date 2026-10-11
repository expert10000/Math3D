import { describe, expect, it } from "vitest";
import { buildQuantumVectorGlyphMeshes, type VectorGlyphDisplay } from "./quantumVectorGlyphs";

const objects = [{ id: "pseudospin", label: "Pseudospin", style: { color: "#26a0ff", opacity: 1, size: 1 } }];
const display: VectorGlyphDisplay = {
  objectId: "pseudospin", count: 961, positionUnit: "rad/a", vectorUnit: "dimensionless", zeroCount: 0,
  glyphs: Array.from({ length: 128 }, (_, ordinal) => ({
    sampleIndex: Math.round(ordinal * 960 / 127),
    origin: [ordinal / 10, 0, 0] as [number, number, number],
    direction: [0, 1, 0] as [number, number, number],
  })),
};

describe("bounded quantum vector glyphs", () => {
  it("preserves supplied orientation and source sample IDs at every density", () => {
    const geometry = { points: [{ x: 0, y: 0, z: 0 }, { x: 13, y: 0, z: 0 }] };
    for (const density of [16, 64, 128] as const) {
      const [mesh] = buildQuantumVectorGlyphMeshes(geometry, [display], objects, density);
      expect(mesh.id).toBe("pseudospin");
      const indices = [...new Set(mesh.primitivesByFace.map(face => face.index))];
      expect(indices).toHaveLength(density);
      expect(indices[0]).toBe(0);
      expect(indices.at(-1)).toBe(960);
      expect(mesh.primitivesByFace[0].sampleId).toBe("pseudospin:sample:0");
      expect(mesh.primitivesByFace.at(-1)?.sampleId).toBe("pseudospin:sample:960");
      // First shaft points along +y. Its glyph length is a visual constant,
      // independent of the supplied vector magnitude.
      expect(mesh.primitivesByFace[0].endpoints?.[0]).toMatchObject({ x: 0, y: 0, z: 0 });
      expect(mesh.primitivesByFace[0].endpoints?.[1].y).toBeGreaterThan(0);
      expect(mesh.primitivesByFace[0].endpoints?.[1].x).toBe(0);
    }
  });

  it("does not fabricate an oriented glyph for zero-valued samples", () => {
    const empty = { ...display, count: 1, glyphs: [], zeroCount: 1 };
    expect(buildQuantumVectorGlyphMeshes({}, [empty], objects, 16)).toEqual([]);
  });
});
