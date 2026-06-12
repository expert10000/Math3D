import { describe, expect, it } from "vitest";
import { createGeometryObject } from "./proceduralObjects";
import {
  executeGeometryProceduralScript,
  parseGeometryProceduralScript,
} from "./proceduralScript";

describe("geometry procedural script", () => {
  it("parses aliases into a typed canonical AST", () => {
    const parsed = parseGeometryProceduralScript([
      "object box as base width=2",
      "update base opacity=0.5",
      "hide base",
      "remove base",
    ].join("\n"));

    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.commands.map((command) => command.kind)).toEqual([
      "add",
      "set",
      "setVisibility",
      "delete",
    ]);
    expect(parsed.commands[0]).toMatchObject({
      kind: "add",
      line: 1,
      objectType: "box",
      id: "base",
      assignments: [{ key: "width", value: "2" }],
    });
  });

  it("executes the existing starter workflow and reports counts", () => {
    const result = executeGeometryProceduralScript({
      script: [
        "clear",
        "add box as base width=2 height=0.6 depth=1.4 y=-0.4 color=#8aa4ff",
        "add sphere as marker radius=0.45 x=1.15 y=0.25 z=0.2 color=#22c55e",
        "set marker opacity=0.9",
      ].join("\n"),
      objects: [createGeometryObject("cone", "old")],
      selectedObjectId: "old",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats).toEqual({ created: 2, updated: 1, deleted: 0 });
    expect(result.selectedObjectId).toBe("marker");
    expect(result.objects.map((object) => object.id)).toEqual(["base", "marker"]);
    expect(result.objects[0]).toMatchObject({
      type: "box",
      params: { width: 2, height: 0.6, depth: 1.4 },
      transform: { position: { x: 0, y: -0.4, z: 0 } },
      material: { color: 0x8aa4ff },
    });
    expect(result.objects[1]).toMatchObject({
      type: "sphere",
      params: { radius: 0.45 },
      visible: true,
      material: { color: 0x22c55e, opacity: 0.9 },
    });
  });

  it("preserves coercion, clamping, visibility, select, and generated id behavior", () => {
    const result = executeGeometryProceduralScript({
      script: [
        "add cylinder openEnded=yes radiusTop=99 sx=0 opacity=2 visible=off",
        "show obj_3",
        "select existing",
      ].join("\n"),
      objects: [createGeometryObject("box", "existing")],
      datasetObjectIds: ["obj_2"],
      selectedObjectId: "existing",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const generated = result.objects.find((object) => object.id === "obj_3");
    expect(generated).toMatchObject({
      params: { openEnded: true, radiusTop: 10 },
      transform: { scale: { x: 0.001, y: 1, z: 1 } },
      material: { opacity: 1 },
      visible: true,
    });
    expect(result.selectedObjectId).toBe("existing");
  });

  it("returns structured diagnostics and leaves input objects untouched on failure", () => {
    const original = createGeometryObject("box", "base");
    const result = executeGeometryProceduralScript({
      script: [
        "set base width=3",
        "add sphere as marker radius=nope",
        "delete base",
      ].join("\n"),
      objects: [original],
      selectedObjectId: "base",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      severity: "error",
      line: 2,
      code: "invalid-number",
      message: "invalid number for radius",
    });
    expect(original.params.width).toBe(1.6);
  });

  it("reports parse diagnostics with source lines", () => {
    const parsed = parseGeometryProceduralScript("add box as b width=2\nset b\nexplode b");

    expect(parsed.commands).toHaveLength(2);
    expect(parsed.diagnostics).toEqual([
      {
        severity: "error",
        line: 2,
        code: "missing-assignment",
        message: "set needs at least one key=value pair",
      },
      {
        severity: "error",
        line: 3,
        code: "unknown-command",
        message: "unknown command 'explode'",
      },
    ]);
  });

  it("preserves semantic error precedence over malformed assignments", () => {
    const result = executeGeometryProceduralScript({
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
