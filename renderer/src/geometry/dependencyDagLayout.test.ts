import { describe, expect, it } from "vitest";
import { layoutDependencyDag } from "./dependencyDagLayout";

describe("layoutDependencyDag", () => {
  it("places dependencies in ordered layers without overlapping nodes", () => {
    const nodes = [
      "point-a",
      "point-b",
      "point-c",
      "line-ab",
      "line-bc",
      "midpoint",
      "circle",
      "perpendicular",
      "intersection",
      "sphere",
      "volume",
    ].map((id) => ({ id }));
    const edges = [
      ["point-a", "line-ab"],
      ["point-b", "line-ab"],
      ["point-b", "line-bc"],
      ["point-c", "line-bc"],
      ["line-ab", "midpoint"],
      ["midpoint", "circle"],
      ["circle", "perpendicular"],
      ["perpendicular", "intersection"],
      ["intersection", "sphere"],
      ["sphere", "volume"],
    ].map(([sourceId, targetId]) => ({ sourceId, targetId }));

    const layout = layoutDependencyDag(nodes, edges);
    const position = (id: string) => layout.positions.get(id)!;

    expect(position("point-a").y).toBeLessThan(position("line-ab").y);
    expect(position("line-ab").y).toBeLessThan(position("midpoint").y);
    expect(position("midpoint").y).toBeLessThan(position("circle").y);
    expect(position("sphere").y).toBeLessThan(position("volume").y);

    const positioned = [...layout.positions.values()];
    for (let index = 0; index < positioned.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < positioned.length; otherIndex += 1) {
        const a = positioned[index];
        const b = positioned[otherIndex];
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("lays out a large procedural graph without manual coordinates", () => {
    const nodes = Array.from({ length: 120 }, (_, index) => ({ id: `node-${index}` }));
    const edges = nodes.slice(1).flatMap((node, index) => [
      { sourceId: `node-${index}`, targetId: node.id },
      ...(index > 1 && index % 4 === 0
        ? [{ sourceId: `node-${index - 2}`, targetId: node.id }]
        : []),
    ]);

    const layout = layoutDependencyDag(nodes, edges);

    expect(layout.positions.size).toBe(120);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(layout.positions.get("node-0")!.y).toBeLessThan(layout.positions.get("node-119")!.y);
  });
});
