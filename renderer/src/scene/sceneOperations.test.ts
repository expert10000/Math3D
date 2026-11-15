import { describe, expect, it } from "vitest";
import { mergeSceneOperations, nextUndoableSceneOperation, type SceneOperationSource } from "./sceneOperations";

const operation = (id: string, at: number): SceneOperationSource => ({
  id, at, objectId: "geometry:box", objectLabel: "Box", componentLabel: "Face 2",
  action: "Subdivide", parameters: "mode=fan", sourceRepresentation: "evaluated",
  outputRepresentation: "editable-mesh", revisionBefore: 1, revisionAfter: 2,
  beforeAvailable: true, afterAvailable: true,
});

describe("scene operation history", () => {
  it("orders Geometry and Mesh edits in one timeline and skips undone commands", () => {
    const operations = mergeSceneOperations([operation("g1", 10)], [operation("m1", 20)]);
    expect(operations.map((entry) => entry.id)).toEqual(["mesh:m1", "geometry:g1"]);
    expect(nextUndoableSceneOperation(operations, new Set(["mesh:m1"]))?.id).toBe("geometry:g1");
  });
  it("keeps one object identity while undo moves from the Mesh edit to its Geometry source edit", () => {
    const operations = mergeSceneOperations([operation("resize", 10)], [operation("bevel", 20)]);
    expect(new Set(operations.map((entry) => entry.objectId))).toEqual(new Set(["geometry:box"]));
    expect(nextUndoableSceneOperation(operations, new Set())?.id).toBe("mesh:bevel");
    expect(nextUndoableSceneOperation(operations, new Set(["mesh:bevel"]))?.id).toBe("geometry:resize");
    expect(nextUndoableSceneOperation(operations, new Set(["mesh:bevel", "geometry:resize"]))).toBeNull();
  });
});
