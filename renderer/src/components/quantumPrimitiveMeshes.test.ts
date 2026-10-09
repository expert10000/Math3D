import { describe, expect, it } from "vitest";
import { buildQuantumPrimitiveMeshes, MAX_PICKABLE_PRIMITIVES_PER_OBJECT } from "./quantumPrimitiveMeshes";

const objects = [
  { id: "nucleus", label: "Supplied center", kind: "point-cloud", style: { color: "#22aaff", opacity: 1, size: 1 } },
  { id: "links", label: "Supplied links", kind: "segments", style: { color: "#ff8800", opacity: 0.8, size: 1 } },
];

describe("verified quantum scene primitive picking", () => {
  it("maps every site and link face to a portable object ID and exact dataset sample", () => {
    const geometry = {
      points: [{ x: 0, y: 0, z: 0, id: "nucleus:site:0" },
        { x: 2, y: 0, z: 0, id: "nucleus:site:1" }],
      segments: [{ a: { x: 0, y: 0, z: 0, id: "links:link:0:a" },
        b: { x: 2, y: 0, z: 0, id: "links:link:0:b" } }],
    };
    const [sites, links] = buildQuantumPrimitiveMeshes(geometry, objects, ["nucleus", "links"]);
    expect(sites.positions.length).toBe(2 * 8 * 9);
    expect(sites.primitivesByFace).toHaveLength(16);
    expect(sites.primitivesByFace[8]).toMatchObject({ objectId: "nucleus", sampleId: "nucleus:site:1",
      index: 1, position: { x: 2, y: 0, z: 0 } });
    expect(links.positions.length).toBe(12 * 9);
    expect(links.primitivesByFace[11]).toMatchObject({ objectId: "links", sampleId: "links:link:0",
      kind: "link", endpoints: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }] });
    expect([...sites.positions, ...links.positions].every(Number.isFinite)).toBe(true);
  });

  it("leaves hidden, deferred, and over-budget objects unpickable", () => {
    const geometry = { points: Array.from({ length: MAX_PICKABLE_PRIMITIVES_PER_OBJECT + 1 }, (_, index) =>
      ({ x: index, y: 0, z: 0, id: `nucleus:site:${index}` })) };
    expect(buildQuantumPrimitiveMeshes(geometry, objects, ["nucleus"])).toEqual([]);
    expect(buildQuantumPrimitiveMeshes({ points: geometry.points.slice(0, 1) }, objects, [])).toEqual([]);
  });

  it("keeps degenerate links selectable without non-finite geometry", () => {
    const geometry = { segments: [{ a: { x: 1, y: 1, z: 1, id: "links:link:0:a" },
      b: { x: 1, y: 1, z: 1, id: "links:link:0:b" } }] };
    const [link] = buildQuantumPrimitiveMeshes(geometry, objects, ["links"]);
    expect(link.primitivesByFace).toHaveLength(8);
    expect([...link.positions].every(Number.isFinite)).toBe(true);
  });
});
