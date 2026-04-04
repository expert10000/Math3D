import { describe, expect, it } from "vitest";
import {
  buildPlannedOperations,
  buildPlannedSteps,
  createDefaultAnimationPlan,
  moveOperationInPlan,
  normalizeAnimationPlan,
  setOperationGroupInPlan,
} from "./animationPlan";
import type { OrientationRelation } from "./types";

const RELATIONS: OrientationRelation[] = [
  { edgeA: "e0", edgeB: "e1", relation: "match" },
  { edgeA: "e1", edgeB: "e2", relation: "reverse" },
  { edgeA: "e2", edgeB: "e3", relation: "match" },
];

describe("topology animation plan", () => {
  it("normalizes order and fills missing operations", () => {
    const normalized = normalizeAnimationPlan(RELATIONS, { order: ["op-2"], groups: {} });
    expect(normalized.order).toEqual(["op-2", "op-0", "op-1"]);
  });

  it("supports reorder and grouping into steps", () => {
    const moved = moveOperationInPlan(RELATIONS, createDefaultAnimationPlan(RELATIONS), "op-2", -1);
    expect(moved.order).toEqual(["op-0", "op-2", "op-1"]);

    const grouped = setOperationGroupInPlan(RELATIONS, moved, "op-0", "A");
    const grouped2 = setOperationGroupInPlan(RELATIONS, grouped, "op-2", "A");

    const operations = buildPlannedOperations(RELATIONS, grouped2);
    expect(operations[0]?.groupId).toBe("A");
    expect(operations[1]?.groupId).toBe("A");

    const steps = buildPlannedSteps(RELATIONS, grouped2);
    expect(steps[0]?.operations.length).toBe(2);
    expect(steps[1]?.operations.length).toBe(1);
  });
});
