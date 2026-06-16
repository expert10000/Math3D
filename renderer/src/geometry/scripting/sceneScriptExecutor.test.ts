import { describe, expect, it } from "vitest";
import { createGeometryObject } from "../proceduralObjects";
import { executeSceneScript } from "./sceneScriptExecutor";

describe("scene script executor", () => {
  it("adds an object", () => {
    const result = executeSceneScript({
      script: "add box as box1 x=1 color=#ff0000",
      objects: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0]).toMatchObject({
      id: "box1",
      type: "box",
      transform: { position: { x: 1, y: 0, z: 0 } },
      material: { color: 0xff0000 },
    });
    expect(result.selectedObjectId).toBe("box1");
    expect(result.stats).toEqual({ created: 1, updated: 0, deleted: 0 });
    expect(result.changes).toEqual({
      createdObjectIds: ["box1"],
      updatedObjectIds: [],
      deletedObjectIds: [],
    });
  });

  it("sets object fields", () => {
    const result = executeSceneScript({
      script: "set box1 width=4 opacity=0.5",
      objects: [createGeometryObject("box", "box1")],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objects[0]).toMatchObject({
      params: { width: 4 },
      material: { opacity: 0.5 },
    });
  });

  it("accepts cube as a script-friendly box alias", () => {
    const result = executeSceneScript({
      script: "add cube as cube1 size=2",
      objects: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objects[0]).toMatchObject({
      id: "cube1",
      type: "box",
      name: "Cube",
      params: { width: 2, height: 2, depth: 2 },
    });
  });

  it("deletes an object", () => {
    const result = executeSceneScript({
      script: "delete box1",
      objects: [createGeometryObject("box", "box1"), createGeometryObject("sphere", "sphere1")],
      selectedObjectId: "box1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objects.map((object) => object.id)).toEqual(["sphere1"]);
    expect(result.selectedObjectId).toBe("sphere1");
    expect(result.changes.deletedObjectIds).toEqual(["box1"]);
  });

  it("shows and hides an object", () => {
    const result = executeSceneScript({
      script: "hide box1\nshow box1",
      objects: [createGeometryObject("box", "box1")],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objects[0].visible).toBe(true);
    expect(result.stats.updated).toBe(2);
  });

  it("selects an object", () => {
    const result = executeSceneScript({
      script: "select sphere1",
      objects: [createGeometryObject("box", "box1"), createGeometryObject("sphere", "sphere1")],
      selectedObjectId: "box1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selectedObjectId).toBe("sphere1");
  });

  it("rolls back the entire transaction on error", () => {
    const original = createGeometryObject("box", "box1");
    const result = executeSceneScript({
      script: "set box1 width=4\nadd sphere as marker radius=nope\ndelete box1",
      objects: [original],
      selectedObjectId: "box1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      line: 2,
      code: "invalid-number",
      message: "invalid number for radius",
    });
    expect(original.params.width).toBe(1.6);
  });

  it("preserves coercion, clamping, generated ids, and dataset id reservations", () => {
    const result = executeSceneScript({
      script: "add cylinder openEnded=yes radiusTop=99 sx=0 opacity=2 visible=off\nshow obj_3",
      objects: [createGeometryObject("box", "existing")],
      datasetObjectIds: ["obj_2"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.objects.find((object) => object.id === "obj_3")).toMatchObject({
      params: { openEnded: true, radiusTop: 10 },
      transform: { scale: { x: 0.001, y: 1, z: 1 } },
      material: { opacity: 1 },
      visible: true,
    });
  });

  it("preserves semantic error precedence over malformed assignments", () => {
    const result = executeSceneScript({
      script: "set missing invalid-assignment",
      objects: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      line: 1,
      code: "object-not-found",
      message: "object 'missing' not found",
    });
  });
});
