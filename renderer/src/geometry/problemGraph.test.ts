import { describe, expect, it } from "vitest";
import {
  evaluateConstructionGraph,
  type ConstructionConstraintDef,
  type ConstructionNode,
} from "./problemGraph";

const pointNode = (id: string, x: number, y: number, z = 0): ConstructionNode => ({
  id,
  label: id,
  type: "freePoint",
  point: { x, y, z },
});

describe("construction graph constraints", () => {
  it("updates target line direction for parallel and perpendicular constraints when the source line moves", () => {
    const nodes: ConstructionNode[] = [
      pointNode("A", 0, 0),
      pointNode("B", 2, 0),
      pointNode("C", 0, 1),
      pointNode("D", 0, 3),
      pointNode("E", 1, 0),
      pointNode("F", 1, 2),
      { id: "L1", type: "lineThroughPoints", a: "A", b: "B" },
      { id: "L2", type: "lineThroughPoints", a: "C", b: "D" },
      { id: "L3", type: "lineThroughPoints", a: "E", b: "F" },
    ];
    const constraints: ConstructionConstraintDef[] = [
      { id: "parallel-L2-L1", type: "parallel", targetId: "L2", sourceId: "L1" },
      { id: "perpendicular-L3-L1", type: "perpendicular", targetId: "L3", sourceId: "L1" },
    ];

    const initial = evaluateConstructionGraph(nodes, constraints);
    const moved = evaluateConstructionGraph(
      nodes.map((node) => (node.id === "B" && node.type === "freePoint" ? pointNode("B", 0, 2) : node)),
      constraints
    );

    expect(initial.errors).toEqual([]);
    expect(moved.errors).toEqual([]);
    expect(initial.lines.L2.direction).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(Math.abs(initial.lines.L3.direction.y)).toBeCloseTo(1);
    expect(Math.abs(moved.lines.L2.direction.y)).toBeCloseTo(1);
    expect(Math.abs(moved.lines.L3.direction.x)).toBeCloseTo(1);
  });

  it("applies equal length and coincident point constraints from source to target", () => {
    const nodes: ConstructionNode[] = [
      pointNode("A", 0, 0),
      pointNode("B", 3, 0),
      pointNode("C", 0, 2),
      pointNode("D", 0, 3),
      pointNode("P", 5, 5),
      pointNode("Q", -1, -1),
      { id: "L1", type: "lineThroughPoints", a: "A", b: "B" },
      { id: "L2", type: "lineThroughPoints", a: "C", b: "D" },
    ];

    const result = evaluateConstructionGraph(nodes, [
      { id: "equal-L2-L1", type: "equalLength", targetId: "L2", sourceId: "L1" },
      { id: "coincident-Q-P", type: "coincident", targetId: "Q", sourceId: "P" },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.lines.L2.length).toBeCloseTo(3);
    expect(result.points.Q).toMatchObject({ x: 5, y: 5, z: 0, label: "Q" });
  });

  it("applies equal radius, concentric, and tangent circle constraints", () => {
    const nodes: ConstructionNode[] = [
      pointNode("A", 0, 0),
      pointNode("B", 2, 0),
      pointNode("C", 4, 0),
      pointNode("D", 5, 0),
      pointNode("E", 8, 0),
      pointNode("F", 9, 0),
      { id: "c1", type: "circleCenterPoint", center: "A", point: "B" },
      { id: "c2", type: "circleCenterPoint", center: "C", point: "D" },
      { id: "c3", type: "circleCenterPoint", center: "E", point: "F" },
    ];

    const result = evaluateConstructionGraph(nodes, [
      { id: "same-radius", type: "equalRadius", targetId: "c2", sourceId: "c1" },
      { id: "same-center", type: "concentric", targetId: "c2", sourceId: "c1" },
      { id: "circle-tangent", type: "tangent", targetId: "c3", sourceId: "c1" },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.circles.c2.center).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(result.circles.c2.radius).toBeCloseTo(2);
    expect(result.circles.c3.radius).toBeCloseTo(1);
    expect(result.circles.c3.center.x).toBeCloseTo(3);
    expect(result.circles.c3.center.y).toBeCloseTo(0);
  });

  it("applies tangent line constraints against a source circle", () => {
    const nodes: ConstructionNode[] = [
      pointNode("O", 0, 0),
      pointNode("R", 2, 0),
      pointNode("A", 0, 3),
      pointNode("B", 2, 3),
      { id: "c", type: "circleCenterPoint", center: "O", point: "R" },
      { id: "t", type: "lineThroughPoints", a: "A", b: "B" },
    ];

    const result = evaluateConstructionGraph(nodes, [
      { id: "line-tangent", type: "tangent", targetId: "t", sourceId: "c" },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.lines.t.origin).toMatchObject({ x: 0, y: 2, z: 0 });
    expect(Math.abs(result.lines.t.direction.x)).toBeCloseTo(1);
    expect(Math.abs(result.lines.t.direction.y)).toBeCloseTo(0);
  });
});
