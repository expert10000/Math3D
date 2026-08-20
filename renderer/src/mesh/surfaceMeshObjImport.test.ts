import { describe, expect, it } from "vitest";

import { loadSurfaceMeshFromFile, type SurfaceMeshImportTelemetry } from "./surfaceMesh";

describe("surface mesh OBJ import", () => {
  const loadObj = async (obj: string) => {
    const stages: SurfaceMeshImportTelemetry[] = [];
    const mesh = await loadSurfaceMeshFromFile([new File([obj], "quad.obj")], {
      mergeVertices: false,
      onStage: (entry) => stages.push(entry),
    });
    return { mesh, stages };
  };

  it("uses the indexed simple OBJ path without eager normal generation when merge is off", async () => {
    const obj = [
      "# simple indexed quad",
      "",
      "v 0 0 0",
      "v 1 0 0",
      "v 1 1 0",
      "v 0 1 0",
      "f 1 2 3 4",
    ].join("\r\n");

    const { mesh, stages } = await loadObj(obj);

    expect(mesh.positions.length / 3).toBe(4);
    expect(mesh.indices ? mesh.indices.length / 3 : 0).toBe(2);
    expect(mesh.normals).toBeNull();
    expect(stages.map((entry) => entry.stage)).toEqual([
      "fileRead",
      "parse",
      "fastObjParse",
      "normalize",
      "meshExtract",
    ]);
  });

  it.each([
    ["vertex normals", "vn 0 0 1\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1//1 2//1 3//1"],
    ["texture coordinates", "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3"],
    ["negative indices", "v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1"],
    ["unsupported directives", "g grouped\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3"],
  ])("falls back to the general OBJ loader for %s", async (_label, obj) => {
    const { mesh, stages } = await loadObj(obj);

    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(stages.map((entry) => entry.stage)).toContain("objLoaderFallback");
    expect(stages.map((entry) => entry.stage)).not.toContain("fastObjParse");
  });
});
