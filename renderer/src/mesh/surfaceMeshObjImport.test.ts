import { describe, expect, it } from "vitest";

import { loadSurfaceMeshFromFile, type SurfaceMeshImportTelemetry } from "./surfaceMesh";

describe("surface mesh OBJ import", () => {
  it("uses the indexed simple OBJ path without eager normal generation when merge is off", async () => {
    const obj = [
      "# simple indexed quad",
      "v 0 0 0",
      "v 1 0 0",
      "v 1 1 0",
      "v 0 1 0",
      "f 1 2 3 4",
    ].join("\n");
    const stages: SurfaceMeshImportTelemetry[] = [];

    const mesh = await loadSurfaceMeshFromFile([new File([obj], "quad.obj")], {
      mergeVertices: false,
      onStage: (entry) => stages.push(entry),
    });

    expect(mesh.positions.length / 3).toBe(4);
    expect(mesh.indices ? mesh.indices.length / 3 : 0).toBe(2);
    expect(mesh.normals).toBeNull();
    expect(stages.map((entry) => entry.stage)).toEqual(["fileRead", "parse", "normalize", "meshExtract"]);
  });
});
