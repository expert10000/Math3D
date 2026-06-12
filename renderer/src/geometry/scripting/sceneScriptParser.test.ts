import { describe, expect, it } from "vitest";
import { parseSceneScript } from "./sceneScriptParser";
import type {
  AddObjectCommand,
  ClearCommand,
  DeleteObjectCommand,
  SelectCommand,
  SetObjectCommand,
  VisibilityCommand,
} from "./sceneScriptTypes";

describe("scene script parser", () => {
  it("parses the supported syntax into typed commands", () => {
    const result = parseSceneScript([
      "clear",
      "add box as box1 x=1 y=2 z=3 color=#ff0000",
      "set box1 width=4 opacity=0.5",
      "hide box1",
      "show box1",
      "select box1",
      "delete box1",
    ].join("\n"));

    expect(result.diagnostics).toEqual([]);
    expect(result.commands).toHaveLength(7);

    const clear: ClearCommand = result.commands[0] as ClearCommand;
    const add: AddObjectCommand = result.commands[1] as AddObjectCommand;
    const set: SetObjectCommand = result.commands[2] as SetObjectCommand;
    const hide: VisibilityCommand = result.commands[3] as VisibilityCommand;
    const show: VisibilityCommand = result.commands[4] as VisibilityCommand;
    const select: SelectCommand = result.commands[5] as SelectCommand;
    const remove: DeleteObjectCommand = result.commands[6] as DeleteObjectCommand;

    expect(clear.kind).toBe("clear");
    expect(add).toMatchObject({
      kind: "add",
      objectType: "box",
      id: "box1",
      assignments: [
        { key: "x", value: "1" },
        { key: "y", value: "2" },
        { key: "z", value: "3" },
        { key: "color", value: "#ff0000" },
      ],
    });
    expect(set).toMatchObject({
      kind: "set",
      id: "box1",
      assignments: [
        { key: "width", value: "4" },
        { key: "opacity", value: "0.5" },
      ],
    });
    expect(hide).toMatchObject({ kind: "setVisibility", id: "box1", visible: false });
    expect(show).toMatchObject({ kind: "setVisibility", id: "box1", visible: true });
    expect(select).toMatchObject({ kind: "select", id: "box1" });
    expect(remove).toMatchObject({ kind: "delete", id: "box1" });
  });

  it("preserves existing aliases", () => {
    const result = parseSceneScript("object box as base\nupdate base opacity=0.5\nremove base");

    expect(result.diagnostics).toEqual([]);
    expect(result.commands.map((command) => command.kind)).toEqual(["add", "set", "delete"]);
  });

  it("rejects invalid commands and assignments with source lines", () => {
    const result = parseSceneScript("set\nset box1\nset box1 invalid\nexplode box1");

    expect(result.diagnostics).toEqual([
      {
        severity: "error",
        line: 1,
        code: "missing-object-id",
        message: "missing object id",
      },
      {
        severity: "error",
        line: 2,
        code: "missing-assignment",
        message: "set needs at least one key=value pair",
      },
      {
        severity: "error",
        line: 3,
        code: "invalid-assignment",
        message: "expected key=value, got 'invalid'",
      },
      {
        severity: "error",
        line: 4,
        code: "unknown-command",
        message: "unknown command 'explode'",
      },
    ]);
  });
});
