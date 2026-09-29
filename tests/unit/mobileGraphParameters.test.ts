import { describe, expect, it } from "vitest";
import { createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createWorkspaceProjectHandoff, serializeWorkspaceProjectHandoff,
  parseWorkspaceProjectHandoff, previewGraph2DParameterValues, defaultGraph2DParameterDraft, getGraph2DPresetCatalog,
  instantiateGraph2DPreset, createGraph2DAnimationPlan, graph2DAnimationFrame, Graph2DAnimationExportBuilder,
  Graph2DAnimationPlayer, structuralHash, type Graph2DAuthoringAction } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { applyMobileGraphAuthoring } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { importMobileGraph, readMobileGraph, updateStoredMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { mobileGraphPanelDestination } from "../../apps/mobile/src/models/mobileGraphLayout";

describe("G2D38 native parameter ownership and deterministic desktop return", () => {
  it("commits controls through the shared adapter and retains ranges/units through real import/save/export", () => {
    const initial = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison")!, "parameter-return").document;
    const handoff = createWorkspaceProjectHandoff(createGraph2DWorkspaceProject(initial), { producer: { platform: "desktop", name: "Math3D", version: "1.5.0" } });
    let stored = importMobileGraph(serializeWorkspaceProjectHandoff(handoff), [], "parameters.handoff.json", 1, "desktop");
    const adapter = new Graph2DCommandAdapter(readMobileGraph(stored));
    const action: Graph2DAuthoringAction = { type: "parameter-configure", name: "a", draft: { name: "a", value: 2, min: -3, max: 3, step: .25, unit: "ratio" } };
    const configured = adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), action), action.type);
    const snapshot = JSON.stringify(stored);
    for (const value of [-3, -.25, 0, 3]) previewGraph2DParameterValues(configured, { a: value });
    expect(JSON.stringify(stored)).toBe(snapshot); expect(adapter.history().undoDepth).toBe(1);
    const committed = adapter.commitScene(applyMobileGraphAuthoring(configured, { type: "parameter-value", name: "a", value: -1.25 }), "parameter-value");
    stored = updateStoredMobileGraph(stored, committed, 2); expect(readMobileGraph(stored)).toEqual(committed);
    const returned = parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(stored));
    const graph = returned.project.entries.find(e => e.module === "graph2d")!.checkpoint;
    expect(graph).toEqual(committed); expect(committed.source.variables[0]).toEqual({ name: "a", value: -1.25, control: { min: -3, max: 3, step: .25, unit: "ratio" } });
    expect(adapter.undo()?.source.variables[0].value).toBe(2); expect(adapter.redo()?.source.variables[0].value).toBe(-1.25);
  });
  it("preserves all seven kinds and immutable catalog templates when configuring controls", () => {
    const kinds = new Set<string>();
    for (const preset of getGraph2DPresetCatalog().entries) {
      const before = structuralHash(preset.template), document = instantiateGraph2DPreset(preset, "native-controls").document;
      const adapter = new Graph2DCommandAdapter(document), existing = document.source.variables.find(p => p.name === "a");
      const action: Graph2DAuthoringAction = existing ? { type: "parameter-configure", name: "a", draft: defaultGraph2DParameterDraft(existing) }
        : { type: "parameter-create", draft: defaultGraph2DParameterDraft() };
      const result = adapter.commitScene(applyMobileGraphAuthoring(document, action), action.type);
      expect(result.source.objects).toEqual(document.source.objects); expect(result.requiredCapabilities).toContain("graph2d.parameters.v1");
      expect(structuralHash(preset.template)).toBe(before); result.source.objects.forEach(o => kinds.add(o.kind));
    }
    expect(kinds.size).toBe(7); expect(mobileGraphPanelDestination("Parameters", false)).toBe("Parameters"); expect(mobileGraphPanelDestination("Parameters", true)).toBe("Parameters");
  });
  it("native yielded frame export matches desktop direct export, with no source/history mutation", () => {
    const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument("native-animation"));
    const action: Graph2DAuthoringAction = { type: "parameter-create", draft: defaultGraph2DParameterDraft() };
    const document = adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), action), action.type);
    const plan = createGraph2DAnimationPlan(document, { parameter: "a", from: -5, to: 5, frames: 3, fps: 5 });
    const native = new Graph2DAnimationExportBuilder({ publication: { document, size: { width: 640, height: 480 } }, plan });
    const desktop = new Graph2DAnimationExportBuilder({ publication: { document, size: { width: 640, height: 480 } }, plan });
    while (!desktop.complete) desktop.appendNext();
    for (let i = 0; i < 3; i++) { const frame = native.appendNext(); expect(frame).toEqual(graph2DAnimationFrame(document, plan, i)); }
    expect(native.finish()).toEqual(desktop.finish()); expect(adapter.document()).toEqual(document); expect(adapter.history().undoDepth).toBe(1);
  });
  it("drops late scheduled frames after cancellation/replacement (background, source change, unmount)", () => {
    const adapter = new Graph2DCommandAdapter(createEmptyGraph2DDocument("cancel-animation")), action: Graph2DAuthoringAction = { type: "parameter-create", draft: defaultGraph2DParameterDraft() };
    const document = adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), action), action.type), plan = createGraph2DAnimationPlan(document, { parameter: "a", from: 0, to: 1, frames: 3, fps: 5 });
    let callback = () => {}, calls: number[] = []; const player = new Graph2DAnimationPlayer(next => { callback = next; return 1; }, () => {});
    player.start(plan, i => calls.push(i), () => {}); player.settled(0); const old = callback; player.stop();
    player.start(plan, i => calls.push(i), () => {}); old(); expect(calls).toEqual([0, 0]); player.settled(0); callback(); expect(calls).toEqual([0, 0, 1]);
    player.stop(); callback(); expect(calls).toEqual([0, 0, 1]);
  });
});
