import { describe, expect, it } from "vitest";
import { sceneSelectionFromUnified, transferSceneSelection, type SceneSelection } from "./sceneSelection";
import { unifiedSelectionFromGeometryObject } from "./unifiedSelection";

const edge: SceneSelection = {
  objectId: "geometry:box",
  representationId: "geometry:box",
  kind: "edge",
  componentIds: ["edge:e-42"],
  worldPoint: null,
  normal: null,
  sourceWorkspace: "geometry",
};

describe("scene selection transfer", () => {
  it("uses one logical object identity across workbenches", () => {
    const selection = unifiedSelectionFromGeometryObject({ objectId: "box", objectLabel: "Box", sceneEntityId: "geometry:box" });
    expect(sceneSelectionFromUnified(selection)).toMatchObject({ objectId: "geometry:box", kind: "object" });
    expect(transferSceneSelection(edge, "mesh:box", [{ oldId: "edge:e-42", newIds: ["edge:1-2", "edge:2-3"], status: "split" }]))
      .toMatchObject({ selection: { objectId: "geometry:box", representationId: "mesh:box", componentIds: ["edge:1-2", "edge:2-3"] } });
  });

  it("falls back to the object when a component cannot be mapped", () => {
    const result = transferSceneSelection(edge, "mesh:box");
    expect(result.selection).toMatchObject({ kind: "object", componentIds: [], objectId: "geometry:box" });
    expect(result.notice).toMatch(/no verified match/);
  });
});
