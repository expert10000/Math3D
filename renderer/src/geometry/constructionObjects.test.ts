import { describe, expect, it } from "vitest";
import {
  evaluateDerivedConstructionObjects,
  type DerivedConstructionObjectDefinition,
  type Point3,
} from "@math3d/core";

const point = (x: number, y: number, z = 0): Point3 => ({ x, y, z });

describe("derived construction objects", () => {
  it("recomputes a midpoint when a source point moves", () => {
    const definitions: DerivedConstructionObjectDefinition[] = [
      { id: "M", type: "midpoint", sourceObjectIds: ["A", "B"] },
    ];

    const initial = evaluateDerivedConstructionObjects(definitions, {
      A: point(0, 0),
      B: point(4, 2),
    });
    const moved = evaluateDerivedConstructionObjects(definitions, {
      A: point(2, 4),
      B: point(4, 2),
    });

    const initialMidpoint = initial.byId.get("M")?.value;
    const movedMidpoint = moved.byId.get("M")?.value;
    expect(initialMidpoint?.kind).toBe("point");
    expect(movedMidpoint?.kind).toBe("point");
    if (initialMidpoint?.kind !== "point" || movedMidpoint?.kind !== "point") return;

    expect(initialMidpoint.point).toMatchObject({ x: 2, y: 1, z: 0 });
    expect(movedMidpoint.point).toMatchObject({ x: 3, y: 3, z: 0 });
  });

  it("evaluates lines, parallels, perpendiculars, circles, and tangents from dependencies", () => {
    const definitions: DerivedConstructionObjectDefinition[] = [
      { id: "AB", type: "line", sourceObjectIds: ["A", "B"] },
      { id: "p", type: "parallel", sourceObjectIds: ["P"], sourceConstructionId: "AB" },
      { id: "q", type: "perpendicular", sourceObjectIds: ["P"], sourceConstructionId: "AB" },
      { id: "c", type: "circle", sourceObjectIds: ["A"], radius: 2 },
      { id: "t", type: "tangent", sourceObjectIds: ["B"], sourceConstructionId: "c" },
    ];

    const result = evaluateDerivedConstructionObjects(definitions, {
      A: point(0, 0),
      B: point(2, 0),
      P: point(0, 1),
    });

    expect(result.errors).toEqual([]);
    expect(result.byId.get("AB")?.value?.kind).toBe("line");
    expect(result.byId.get("p")?.value?.kind).toBe("line");
    expect(result.byId.get("q")?.value?.kind).toBe("line");
    expect(result.byId.get("c")?.value?.kind).toBe("circle");
    expect(result.byId.get("t")?.value?.kind).toBe("line");

    const parallel = result.byId.get("p")?.value;
    const perpendicular = result.byId.get("q")?.value;
    const tangent = result.byId.get("t")?.value;
    if (parallel?.kind !== "line" || perpendicular?.kind !== "line" || tangent?.kind !== "line") return;

    expect(parallel.line.direction).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(Math.abs(perpendicular.line.direction.y)).toBeCloseTo(1);
    expect(tangent.line.origin).toMatchObject({ x: 2, y: 0, z: 0 });
    expect(Math.abs(tangent.line.direction.y)).toBeCloseTo(1);
  });

  it("marks downstream objects invalid when their construction dependency is unavailable", () => {
    const result = evaluateDerivedConstructionObjects(
      [{ id: "p", type: "parallel", sourceObjectIds: ["P"], sourceConstructionId: "missingLine" }],
      { P: point(0, 1) }
    );

    expect(result.byId.get("p")?.status).toBe("invalid");
    expect(result.errors[0]).toContain("Parallel line needs");
  });

  it("resolves source construction dependencies regardless of definition order", () => {
    const result = evaluateDerivedConstructionObjects(
      [
        { id: "p", type: "parallel", sourceObjectIds: ["P"], sourceConstructionId: "AB" },
        { id: "AB", type: "line", sourceObjectIds: ["A", "B"] },
      ],
      {
        A: point(0, 0),
        B: point(4, 0),
        P: point(1, 2),
      }
    );

    const parallel = result.byId.get("p")?.value;
    expect(result.errors).toEqual([]);
    expect(parallel?.kind).toBe("line");
    if (parallel?.kind !== "line") return;
    expect(parallel.line.origin).toMatchObject({ x: 1, y: 2, z: 0 });
    expect(parallel.line.direction).toMatchObject({ x: 1, y: 0, z: 0 });
  });

  it("returns a perpendicular bisector direction for a straight angle", () => {
    const result = evaluateDerivedConstructionObjects(
      [{ id: "bisector", type: "angle-bisector", sourceObjectIds: ["A", "B", "C"] }],
      {
        A: point(-1, 0),
        B: point(0, 0),
        C: point(1, 0),
      }
    );

    const bisector = result.byId.get("bisector")?.value;
    expect(result.errors).toEqual([]);
    expect(bisector?.kind).toBe("line");
    if (bisector?.kind !== "line") return;
    expect(Math.abs(bisector.line.direction.y)).toBeCloseTo(1);
  });
});
