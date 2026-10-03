import { describe, expect, it } from "vitest";
import { canonicalJsonStringify, createEmptyGraph2DDocument, Graph2DPointTableStore, createGraph2DWorkspaceProject, createMath3DProject, createMixedWorkspaceDocument, getGraph2DPresetCatalog,
  instantiateGraph2DPreset, serializeMath3DProject } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { inspectProjectCompatibility, previewProjectImport } from "./projectTransfer";
import { captureProjectResources, exportProjectPackage, parseProjectPackage, projectResourceInventory } from "./projectResources";

const graph = (key: string) => instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, key).document;
describe("PRJ19 independent Graph sessions and portable history", () => {
  it("opens two graphs and restores each independent undo/redo cursor after serialization", () => {
    const a = new Graph2DCommandAdapter(graph("a")), b = new Graph2DCommandAdapter(graph("b"));
    a.commitViewport({ ...a.document().display.viewport, xMin: -20 });
    b.commitViewport({ ...b.document().display.viewport, xMax: 30 }); b.undo();
    const project = createMath3DProject(createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(a.document()),
      entries: [a, b].map(adapter => { const replay = adapter.exportReplay(); return { module: "graph2d" as const,
        checkpoint: replay.checkpoint.document, expected: adapter.document().identity, replay: { format: "math3d.graph2d-replay.v1", payload: replay as never } }; }) }), { stableKey: "two-graphs" });
    expect(inspectProjectCompatibility(project).canOpenWorkspace).toBe(true);
    const returned = previewProjectImport(serializeMath3DProject(project)).project;
    const restored = returned.workspace.entries.map(entry => Graph2DCommandAdapter.restore(entry.replay!.payload as never));
    expect(restored.map(adapter => adapter.document())).toEqual([a.document(), b.document()]);
    expect(restored[0]!.undo()!.display.viewport.xMin).not.toBe(-20);
    expect(restored[1]!.redo()!.display.viewport.xMax).toBe(30);
    expect(restored[0]!.document().identity.id).not.toBe(restored[1]!.document().identity.id);
  });
  it("retains source revision after undo, branch editing and bounded history, and rejects tampered replay", () => {
    const adapter = new Graph2DCommandAdapter(graph("source"));
    const clear = () => adapter.commitScene({ source: { ...adapter.document().source, objects: [] }, display: { ...adapter.document().display, objects: [] }, selection: { objectId: null, probe: null } }, "delete");
    clear(); adapter.undo(); adapter.redo(); adapter.undo(); clear();
    for (let i = 0; i < 105; i++) adapter.commitViewport({ ...adapter.document().display.viewport, xMax: 50 + i });
    const replay = adapter.exportReplay(), restored = Graph2DCommandAdapter.restore(replay);
    expect(replay.transactions).toHaveLength(100); expect(restored.document()).toEqual(adapter.document());
    expect(() => Graph2DCommandAdapter.restore({ ...replay, cursor: -1 })).toThrow();
    expect(() => Graph2DCommandAdapter.restore({ ...replay, transactions: replay.transactions.map((transaction, i) => i ? transaction : { ...transaction, stateHash: "bad" as never }) })).toThrow("verification");
  });
  it("transfers a point table referenced only by hidden undo history and blocks opening when those bytes are missing", () => {
    const original = createEmptyGraph2DDocument("historical-data"), adapter = new Graph2DCommandAdapter(original);
    const data = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "transient-data");
    adapter.commitScene({ source: data.document.source, display: data.document.display, selection: data.document.selection }, "create-point-series");
    adapter.commitScene({ source: original.source, display: original.display, selection: original.selection }, "delete");
    const replay = adapter.exportReplay();
    const project = createMath3DProject(createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(adapter.document()), entries: [{ module: "graph2d", checkpoint: replay.checkpoint.document, expected: adapter.document().identity, replay: { format: "math3d.graph2d-replay.v1", payload: replay as never } }] }), { stableKey: "historical-tables" });
    expect(projectResourceInventory(project)).toHaveLength(1);
    expect(inspectProjectCompatibility(project).canOpenWorkspace).toBe(false);
    const tables = new Graph2DPointTableStore(); for (const sidecar of data.sidecars) tables.publish(sidecar.rows);
    const resources = captureProjectResources(project, item => new TextEncoder().encode(canonicalJsonStringify(tables.resolve(item.reference as never)!)));
    const returned = parseProjectPackage(exportProjectPackage(project, resources));
    expect(inspectProjectCompatibility(returned.project, { resources: returned.resources }).canOpenWorkspace).toBe(true);
    const restored = Graph2DCommandAdapter.restore(returned.project.workspace.entries[0]!.replay!.payload as never);
    expect(restored.undo()!.source.objects.some(object => object.kind === "point-series")).toBe(true);
    expect(returned.resources.sidecars()).toEqual(resources.sidecars());
  });
});
