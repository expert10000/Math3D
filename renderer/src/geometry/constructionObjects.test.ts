import { describe, expect, it } from "vitest";
import {
  buildDerivedConstructionDependencyGraph,
  evaluateDerivedConstructionObjects,
  getAffectedDerivedConstructionIds,
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

  it("builds an affected recompute chain from source points through dependent constructions", () => {
    const definitions: DerivedConstructionObjectDefinition[] = [
      { id: "M", type: "midpoint", sourceObjectIds: ["A", "B"] },
      { id: "c", type: "circle", sourceObjectIds: ["M", "B"] },
      { id: "t", type: "tangent", sourceObjectIds: ["B"], sourceConstructionId: "c" },
    ];

    const graph = buildDerivedConstructionDependencyGraph(definitions);
    expect(getAffectedDerivedConstructionIds(graph, ["A"])).toEqual(["M", "c", "t"]);
    expect(getAffectedDerivedConstructionIds(graph, ["M"])).toEqual(["c", "t"]);
  });

  it("recomputes downstream construction chains when an upstream source point moves", () => {
    const definitions: DerivedConstructionObjectDefinition[] = [
      { id: "M", type: "midpoint", sourceObjectIds: ["A", "B"] },
      { id: "c", type: "circle", sourceObjectIds: ["M", "B"] },
      { id: "t", type: "tangent", sourceObjectIds: ["B"], sourceConstructionId: "c" },
    ];

    const initial = evaluateDerivedConstructionObjects(definitions, {
      A: point(0, 0),
      B: point(4, 0),
    });
    const moved = evaluateDerivedConstructionObjects(definitions, {
      A: point(2, 2),
      B: point(4, 0),
    });

    const initialMidpoint = initial.byId.get("M")?.value;
    const movedMidpoint = moved.byId.get("M")?.value;
    const initialCircle = initial.byId.get("c")?.value;
    const movedCircle = moved.byId.get("c")?.value;
    const initialTangent = initial.byId.get("t")?.value;
    const movedTangent = moved.byId.get("t")?.value;

    expect(initial.errors).toEqual([]);
    expect(moved.errors).toEqual([]);
    expect(initialMidpoint?.kind).toBe("point");
    expect(movedMidpoint?.kind).toBe("point");
    expect(initialCircle?.kind).toBe("circle");
    expect(movedCircle?.kind).toBe("circle");
    expect(initialTangent?.kind).toBe("line");
    expect(movedTangent?.kind).toBe("line");
    if (
      initialMidpoint?.kind !== "point" ||
      movedMidpoint?.kind !== "point" ||
      initialCircle?.kind !== "circle" ||
      movedCircle?.kind !== "circle" ||
      initialTangent?.kind !== "line" ||
      movedTangent?.kind !== "line"
    ) {
      return;
    }

    expect(initialMidpoint.point).toMatchObject({ x: 2, y: 0, z: 0 });
    expect(movedMidpoint.point).toMatchObject({ x: 3, y: 1, z: 0 });
    expect(initialCircle.circle.center).toMatchObject({ x: 2, y: 0, z: 0 });
    expect(movedCircle.circle.center).toMatchObject({ x: 3, y: 1, z: 0 });
    expect(initialCircle.circle.radius).toBeCloseTo(2);
    expect(movedCircle.circle.radius).toBeCloseTo(Math.SQRT2);
    expect(initialTangent.line.origin).toMatchObject({ x: 4, y: 0, z: 0 });
    expect(movedTangent.line.origin.x).toBeCloseTo(4);
    expect(movedTangent.line.origin.y).toBeCloseTo(0);
  });

  it("applies parallel and perpendicular relationships as source lines move", () => {
    const definitions: DerivedConstructionObjectDefinition[] = [
      { id: "L1", type: "line", sourceObjectIds: ["A", "B"] },
      { id: "L2", type: "line", sourceObjectIds: ["C", "D"] },
      { id: "L3", type: "line", sourceObjectIds: ["E", "F"] },
    ];

    const initial = evaluateDerivedConstructionObjects(
      definitions,
      {
        A: point(0, 0),
        B: point(2, 0),
        C: point(0, 1),
        D: point(0, 3),
        E: point(1, 0),
        F: point(1, 2),
      },
      [
        { id: "parallel-L2-L1", type: "parallel", sourceId: "L1", targetId: "L2" },
        { id: "perpendicular-L3-L1", type: "perpendicular", sourceId: "L1", targetId: "L3" },
      ]
    );
    const moved = evaluateDerivedConstructionObjects(
      definitions,
      {
        A: point(0, 0),
        B: point(0, 2),
        C: point(0, 1),
        D: point(0, 3),
        E: point(1, 0),
        F: point(1, 2),
      },
      [
        { id: "parallel-L2-L1", type: "parallel", sourceId: "L1", targetId: "L2" },
        { id: "perpendicular-L3-L1", type: "perpendicular", sourceId: "L1", targetId: "L3" },
      ]
    );

    const initialL2 = initial.byId.get("L2")?.value;
    const initialL3 = initial.byId.get("L3")?.value;
    const movedL2 = moved.byId.get("L2")?.value;
    const movedL3 = moved.byId.get("L3")?.value;
    expect(initialL2?.kind).toBe("line");
    expect(initialL3?.kind).toBe("line");
    expect(movedL2?.kind).toBe("line");
    expect(movedL3?.kind).toBe("line");
    if (initialL2?.kind !== "line" || initialL3?.kind !== "line" || movedL2?.kind !== "line" || movedL3?.kind !== "line") {
      return;
    }

    expect(initialL2.line.direction).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(Math.abs(initialL3.line.direction.y)).toBeCloseTo(1);
    expect(Math.abs(movedL2.line.direction.y)).toBeCloseTo(1);
    expect(Math.abs(movedL3.line.direction.x)).toBeCloseTo(1);
  });

  it("applies circle relationships for equal radius, concentric, and tangent", () => {
    const definitions: DerivedConstructionObjectDefinition[] = [
      { id: "c1", type: "circle", sourceObjectIds: ["A", "B"] },
      { id: "c2", type: "circle", sourceObjectIds: ["C", "D"] },
      { id: "c3", type: "circle", sourceObjectIds: ["E", "F"] },
      { id: "t", type: "line", sourceObjectIds: ["G", "H"] },
    ];

    const result = evaluateDerivedConstructionObjects(
      definitions,
      {
        A: point(0, 0),
        B: point(2, 0),
        C: point(4, 0),
        D: point(5, 0),
        E: point(8, 0),
        F: point(9, 0),
        G: point(0, 3),
        H: point(2, 3),
      },
      [
        { id: "same-radius", type: "equal-radius", sourceId: "c1", targetId: "c2" },
        { id: "same-center", type: "concentric", sourceId: "c1", targetId: "c2" },
        { id: "circle-tangent", type: "tangent", sourceId: "c1", targetId: "c3" },
        { id: "line-tangent", type: "tangent", sourceId: "c1", targetId: "t" },
      ]
    );

    const c2 = result.byId.get("c2")?.value;
    const c3 = result.byId.get("c3")?.value;
    const t = result.byId.get("t")?.value;
    expect(c2?.kind).toBe("circle");
    expect(c3?.kind).toBe("circle");
    expect(t?.kind).toBe("line");
    if (c2?.kind !== "circle" || c3?.kind !== "circle" || t?.kind !== "line") return;

    expect(c2.circle.center).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(c2.circle.radius).toBeCloseTo(2);
    expect(c3.circle.center.x).toBeCloseTo(3);
    expect(c3.circle.radius).toBeCloseTo(1);
    expect(Math.hypot(t.line.origin.x, t.line.origin.y, t.line.origin.z)).toBeCloseTo(2);
    expect(
      t.line.origin.x * t.line.direction.x +
        t.line.origin.y * t.line.direction.y +
        t.line.origin.z * t.line.direction.z
    ).toBeCloseTo(0);
  });
});
