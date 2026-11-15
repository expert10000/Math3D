import { describe, expect, it } from "vitest";
import { buildMeshComponentSelectionGraph, growSceneComponents, shrinkSceneComponents, selectScreenRegion, saveNamedSceneSelection, restoreNamedSceneSelection } from "./robustSceneSelection";
import type { SceneSelection } from "./sceneSelection";

const selection: SceneSelection = { objectId: "geometry:box", representationId: "mesh:box", kind: "face", componentIds: ["face:2"], worldPoint: null, normal: null, sourceWorkspace: "mesh" };

describe("robust scene selection", () => {
  it("keeps a named selection and explicitly remaps its component", () => {
    const [set] = saveNamedSceneSelection([], "Rim", selection, 3, "rim");
    expect(restoreNamedSceneSelection(set, "geometry:box", [{ oldId: "face:2", newIds: ["face:7"], status: "preserved" }]).selection.componentIds).toEqual(["face:7"]);
    expect(restoreNamedSceneSelection(set, "geometry:box", []).selection.kind).toBe("object");
  });
  it("grows and shrinks by adjacency", () => {
    const graph = new Map([["face:1", ["face:2"]], ["face:2", ["face:1", "face:3"]], ["face:3", ["face:2"]]]);
    expect(growSceneComponents(["face:1"], graph)).toEqual(["face:1", "face:2"]);
    expect(shrinkSceneComponents(["face:1", "face:2"], graph)).toEqual(["face:1"]);
  });
  it("builds face adjacency from shared mesh edges", () => {
    const mesh = { label: "square", positions: new Float32Array([0,0,0,1,0,0,1,1,0,0,1,0]), indices: new Uint32Array([0,1,2,0,2,3]), source: { kind: "detachedMesh" as const } };
    expect(growSceneComponents(["face:0"], buildMeshComponentSelectionGraph(mesh, "face"))).toContain("face:1");
  });
  it("supports box and lasso candidate selection with frontmost or through modes", () => {
    const candidates = [{ id: "front", x: 4, y: 4, depth: 1 }, { id: "behind", x: 4, y: 4, depth: 2 }];
    const box = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
    expect(selectScreenRegion(candidates, box, "frontmost")).toEqual(["front"]);
    expect(selectScreenRegion(candidates, box, "through")).toEqual(["front", "behind"]);
    expect(selectScreenRegion(candidates, box, "xray")).toEqual(["front", "behind"]);
    expect(selectScreenRegion(candidates, [[20, 20], [30, 20], [30, 30]], "xray")).toEqual([]);
  });
});
