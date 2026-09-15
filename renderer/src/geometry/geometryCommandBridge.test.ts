import { describe, expect, it } from "vitest";
import { GEOMETRY_COMMAND_TYPES, geometryDocumentFromSceneDocument, type SceneDocument } from "@math3d/core";
import { GeometryDocumentAdapter } from "./geometryDocumentAdapter";
import {
  applySceneScriptToGeometryAdapter,
  dispatchGeometryGuiBatch,
  geometryDocumentScratchGraph,
  geometryObjectUpsertCommand,
  geometrySelectionCommand,
  replaceGeometryScratchGraph,
  sceneScriptToScratchGraph,
  scratchGraphToSceneScript,
  serializeGeometryAdapterSnapshot,
  type ScratchConstructionGraph,
} from "./geometryCommandBridge";
import { createGeometryObject } from "./proceduralObjects";

const adapter = () => new GeometryDocumentAdapter(geometryDocumentFromSceneDocument({
  id: "scene:gk05", title: "GK05", createdAt: 1, updatedAt: 1, objects: [],
} satisfies SceneDocument));

const graph: ScratchConstructionGraph = {
  nodes: [
    { id: "A", type: "freePoint", label: "A", point: { x: 0, y: 0, z: 0 } },
    { id: "B", type: "freePoint", label: "B", point: { x: 2, y: 0, z: 0 } },
    { id: "M", type: "midpoint", label: "M", a: "A", b: "B" },
  ],
  checkDefs: [{ id: "check-1", type: "collinear", points: ["A", "M", "B"] }],
  constraints: [{ id: "constraint-1", type: "coincident", sourceId: "M", targetId: "M" }],
  selectedNodeId: "M",
  scriptText: "point A 0 0 0\npoint B 2 0 0\nmidpoint A B as M",
};

describe("GK05 Geometry command bridge", () => {
  it("produces identical canonical structure for equivalent GUI and Scene Script edits", () => {
    const gui = adapter();
    const box = createGeometryObject("box", "box1");
    box.params.width = 4; box.transform.position.x = 1; box.material.color = 0xff0000;
    dispatchGeometryGuiBatch(gui, [geometryObjectUpsertCommand(box), geometrySelectionCommand(["box1"])]);

    const script = adapter();
    const result = applySceneScriptToGeometryAdapter(script, "add box as box1 width=4 x=1 color=#ff0000");
    expect(result.ok).toBe(true);
    expect(script.document().source).toEqual(gui.document().source);
    expect(script.document().display).toEqual(gui.document().display);
    expect(script.committedSelectionIds()).toEqual(gui.committedSelectionIds());
    expect(script.document().identity.structuralHash).toBe(gui.document().identity.structuralHash);
  });

  it("keeps heterogeneous script batches atomic and preview gestures transient", () => {
    const target = adapter();
    const before = target.document();
    const failed = applySceneScriptToGeometryAdapter(target, "add box as box1 width=4\nadd sphere as marker radius=nope");
    expect(failed.ok).toBe(false);
    expect(target.document()).toEqual(before);
    expect(target.history().undoDepth).toBe(0);

    for (let index = 0; index < 20; index += 1) target.previewSource({ ...target.document().source, parameters: { dragX: index } });
    expect(target.history().undoDepth).toBe(0);
  });

  it("exports a snapshot and compact operation log that replay to the same scene", () => {
    const target = adapter();
    expect(applySceneScriptToGeometryAdapter(target, "add sphere as s radius=2\nhide s\nselect s").ok).toBe(true);
    const snapshot = serializeGeometryAdapterSnapshot(target);
    const snapshotReplay = adapter();
    expect(applySceneScriptToGeometryAdapter(snapshotReplay, snapshot).ok).toBe(true);
    expect(snapshotReplay.document().source).toEqual(target.document().source);
    expect(snapshotReplay.document().display).toEqual(target.document().display);

    const operationReplay = GeometryDocumentAdapter.restore(JSON.parse(JSON.stringify(target.exportReplay())));
    expect(operationReplay.document()).toEqual(target.document());
    expect(operationReplay.committedSelectionIds()).toEqual(["s"]);
  });

  it("round-trips the advertised Scratch construction subset without losing IDs or constraints", () => {
    const first = scratchGraphToSceneScript(graph);
    const restored = sceneScriptToScratchGraph(first.script);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.graph).toEqual(graph);
    expect(scratchGraphToSceneScript(restored.graph).script).toBe(first.script);

    const target = adapter();
    replaceGeometryScratchGraph(target, graph);
    expect(geometryDocumentScratchGraph(target)).toEqual({ ok: true, graph, diagnostics: [] });
    expect(target.committedSelectionIds()).toEqual(["M"]);
  });

  it("returns actionable diagnostics for unsupported conversion without mutating authority", () => {
    const target = adapter();
    const before = target.document();
    const result = sceneScriptToScratchGraph("add box as box1");
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: "unsupported-scene-script-subset" }] });
    expect(target.document()).toEqual(before);
  });

  it("rejects a malformed mixed GUI batch without partial mutation", () => {
    const target = adapter();
    const box = createGeometryObject("box", "box1");
    const before = target.document();
    expect(() => target.dispatch([
      geometryObjectUpsertCommand(box),
      { type: GEOMETRY_COMMAND_TYPES.setVisibility, payload: { objectId: "missing", visible: false } },
    ])).toThrow(/does not exist/);
    expect(target.document()).toEqual(before);
    expect(target.history().undoDepth).toBe(0);
  });
});
