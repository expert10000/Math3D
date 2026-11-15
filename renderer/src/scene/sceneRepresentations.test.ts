import { describe, expect, it } from "vitest";
import { buildSceneEntities, selectActiveRepresentation } from "./sceneRepresentations";

describe("scene representations", () => {
  it("shows one entity for a Geometry object and its linked mesh", () => {
    const entities = buildSceneEntities({
      geometry: [{ id: "box", name: "Box", revision: 2, parametric: true }],
      meshes: [{ id: "box-mesh", name: "Box mesh", sourceGeometryId: "box", sourceRevision: 2, modified: true, detached: false, invalid: false }],
    });
    expect(entities).toHaveLength(1);
    expect(entities[0].representations).toMatchObject([
      { kind: "parametric" },
      { kind: "editable-mesh", state: "modified-linked" },
    ]);
    expect(selectActiveRepresentation(entities[0], "mesh:box-mesh").id).toBe("mesh:box-mesh");
  });

  it("marks older mesh revisions stale and detached meshes independent", () => {
    const entities = buildSceneEntities({
      geometry: [{ id: "box", name: "Box", revision: 3, parametric: true }],
      meshes: [
        { id: "old", name: "Old", sourceGeometryId: "box", sourceRevision: 2, modified: false, detached: false, invalid: false },
        { id: "free", name: "Free", sourceGeometryId: "box", sourceRevision: 2, modified: false, detached: true, invalid: false },
      ],
    });
    expect(entities.find((entity) => entity.id === "geometry:box")?.representations[1].state).toBe("stale");
    expect(entities.find((entity) => entity.id === "mesh:free")?.representations[0].state).toBe("detached");
  });
});
