import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, parseGraph2DDocument, serializeGraph2DDocument, sampleGraph2DScene } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { mobileGraphFunctionDraft, mobileGraphAuthoringAction, applyMobileGraphAuthoring } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { editMobileGraphProbes } from "../../apps/mobile/src/models/mobileGraphProbes";
import { projectMobileGraphLines, MOBILE_GRAPH_MAX_LINE_VIEWS } from "../../apps/mobile/src/viewer/mobileGraphProjection";

describe("MOB-G06 shared native authoring", () => {
  it("uses the desktop scene commands for create/edit/rename/style/duplicate/reorder/visibility/delete with undo", () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph("Authoring", false, "authoring"));
    const apply = (action: Parameters<typeof applyMobileGraphAuthoring>[1]) => {
      const document = adapter.document();
      expect(applyMobileGraphAuthoring(document, action)).toEqual(applyGraph2DAuthoring(document, action));
      return adapter.commitScene(applyMobileGraphAuthoring(document, action), action.type);
    };
    let draft = mobileGraphFunctionDraft(adapter.document(), null);
    apply(mobileGraphAuthoringAction({ objectId: null, draft: { ...draft, expression: "x^2" } }));
    draft = mobileGraphFunctionDraft(adapter.document(), "function_1");
    apply(mobileGraphAuthoringAction({ objectId: "function_1", draft: { ...draft, label: "Parabola", color: "#dd3300", lineStyle: "dashed" } }));
    expect(adapter.document().source.objects[0]?.label).toBe("Parabola");
    apply({ type: "duplicate", objectId: "function_1" }); const id = adapter.document().selection.objectId!;
    apply({ type: "reorder", objectId: id, toIndex: 0 }); apply({ type: "visibility", objectId: id });
    expect(adapter.document().display.objects[0]?.visible).toBe(false);
    const before = adapter.document(); apply({ type: "delete", objectId: id }); expect(adapter.undo()?.source).toEqual(before.source);
    expect(parseGraph2DDocument(serializeGraph2DDocument(adapter.document()))).toEqual(adapter.document());
  });
  it("keeps invalid raw drafts untouched and rejects without history or source changes", () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph("Draft", true, "draft"));
    const original = adapter.document(), draft = mobileGraphFunctionDraft(original, "function_1");
    for (const changed of [{ expression: "sin(" }, { min: "" }, { min: "-" }, { max: "-20" }, { width: "0" }, { color: "red" }, { label: " " }]) {
      const editor = { objectId: "function_1", draft: { ...draft, ...changed } };
      expect(() => applyMobileGraphAuthoring(original, mobileGraphAuthoringAction(editor))).toThrow();
      expect(editor.draft).toEqual({ ...draft, ...changed });
    }
    expect(adapter.document()).toEqual(original); expect(adapter.history().undoDepth).toBe(0);
  });
  it("marks pins stale on edit and deletes dependent pins atomically with reversible history", () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph("Pin", true, "pin-edit"));
    adapter.commitSelection({ objectId: "function_1", probe: { objectId: "function_1", x: 1, y: 1 } });
    const before = adapter.document(); adapter.commitScene({ source: before.source, selection: before.selection,
      display: { ...before.display, pinnedProbes: editMobileGraphProbes(before, { type: "pin", label: "A" }) } }, "pinned-probes");
    const pinned = adapter.document();
    adapter.commitScene(applyMobileGraphAuthoring(pinned, mobileGraphAuthoringAction({ objectId: "function_1",
      draft: { ...mobileGraphFunctionDraft(pinned, "function_1"), expression: "2*x" } })), "edit");
    expect(adapter.document().display.pinnedProbes![0]?.sourceHash).not.toBe(adapter.document().identity.structuralHash);
    adapter.commitScene(applyMobileGraphAuthoring(adapter.document(), { type: "delete", objectId: "function_1" }), "delete");
    expect(adapter.document().display.pinnedProbes).toEqual([]); expect(adapter.undo()?.display.pinnedProbes).toHaveLength(1);
  });
  it("renders actual dashed/dotted styles with finite clipped bounded native geometry", () => {
    const base = createMobileGraph("Style", true, "style"), size = { width: 320, height: 320 };
    for (const lineStyle of ["solid", "dashed", "dotted"] as const) {
      const document = { ...base, display: { ...base.display, objects: base.display.objects.map((style) => ({ ...style, lineStyle })) } };
      const lines = projectMobileGraphLines(sampleGraph2DScene({ document, viewport: document.display.viewport, ...size }), document.display.viewport, size);
      expect(lines.length).toBeGreaterThan(0); expect(lines.length).toBeLessThanOrEqual(MOBILE_GRAPH_MAX_LINE_VIEWS);
      if (lineStyle !== "solid") expect(lines.every((line) => Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) <= (lineStyle === "dotted" ? 2 : 8) + 1e-7)).toBe(true);
      expect(lines.every((line) => [line.a.x, line.a.y, line.b.x, line.b.y].every(Number.isFinite))).toBe(true);
    }
  });
});
