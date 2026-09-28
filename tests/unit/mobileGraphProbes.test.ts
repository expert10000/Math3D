import { describe, expect, it } from "vitest";
import { inspectGraph2DCompatibility, parseGraph2DDocument, serializeGraph2DDocument, normalizeGraph2DDocument,
  createGraph2DWorkspaceProject, parseMixedWorkspaceDocument, serializeMixedWorkspaceDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph, storeMobileGraph, readMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { editMobileGraphProbes, compareMobileGraphProbes } from "../../apps/mobile/src/models/mobileGraphProbes";

const setup = () => {
  const adapter = new Graph2DCommandAdapter(createMobileGraph("Probes", true, "probes"));
  adapter.commitSelection({ objectId: "function_1", probe: { objectId: "function_1", x: 1, y: 1 } });
  const act = (action: Parameters<typeof editMobileGraphProbes>[1]) => {
    const document = adapter.document();
    return adapter.commitScene({ source: document.source, selection: document.selection,
      display: { ...document.display, pinnedProbes: editMobileGraphProbes(document, action) } }, "pinned-probes");
  };
  return { adapter, act };
};
describe("MOB-G05 portable bounded probes", () => {
  it("persists deterministic annotated probes with unchanged mathematical identity and capabilities", () => {
    const { adapter, act } = setup(); const before = adapter.document().identity;
    const document = act({ type: "pin", label: "A" });
    expect(document.identity).toEqual(before); expect(document.requiredCapabilities).toContain("graph2d.probes.v1");
    expect(inspectGraph2DCompatibility(document).status).toBe("current");
    expect(parseGraph2DDocument(serializeGraph2DDocument(document))).toEqual(document);
    expect(readMobileGraph(storeMobileGraph(document))).toEqual(document);
    const mixed = parseMixedWorkspaceDocument(serializeMixedWorkspaceDocument(createGraph2DWorkspaceProject(document)));
    expect(parseGraph2DDocument(JSON.stringify(mixed.entries[0]?.checkpoint))).toEqual(document);
    expect(adapter.undo()?.display.pinnedProbes).toBeUndefined(); expect(adapter.redo()).toEqual(document);
  });
  it("compares ordered probes, renames, reorders, deletes, and enforces eight without mutation", () => {
    const { adapter, act } = setup(); act({ type: "pin", label: "A" });
    adapter.commitSelection({ objectId: "function_1", probe: { objectId: "function_1", x: 3, y: 3 } });
    act({ type: "pin", label: "B" }); expect(compareMobileGraphProbes(adapter.document())).toContain("Δx=2.00000");
    act({ type: "rename", id: "probe_1", label: "Alpha" }); act({ type: "reorder", id: "probe_2", toIndex: 0 });
    expect(compareMobileGraphProbes(adapter.document())).toContain("Δx=-2.00000");
    act({ type: "delete", id: "probe_1" });
    for (let i = 0; i < 7; i++) act({ type: "pin", label: `P${i}` });
    const before = adapter.document(); expect(() => act({ type: "pin", label: "Overflow" })).toThrow(/At most 8/);
    expect(adapter.document()).toEqual(before); expect(() => act({ type: "reorder", id: "probe_2", toIndex: -1 })).toThrow(/position/);
    expect(() => act({ type: "rename", id: "probe_2", label: " " })).toThrow(/label/);
  });
  it("rejects nonfinite, dangling, duplicate and oversized annotations, preserving legacy documents", () => {
    const { act } = setup(), document = act({ type: "pin", label: "A" });
    for (const changes of [{ x: Infinity }, { objectId: "missing" }, { label: "x".repeat(81) }, { sourceHash: "bad" }])
      expect(normalizeGraph2DDocument({ ...document, display: { ...document.display,
        pinnedProbes: [{ ...document.display.pinnedProbes![0], ...changes }] } }).ok).toBe(false);
    expect(normalizeGraph2DDocument({ ...document, display: { ...document.display,
      pinnedProbes: [document.display.pinnedProbes![0], document.display.pinnedProbes![0]] } }).ok).toBe(false);
    expect(inspectGraph2DCompatibility(createMobileGraph("Legacy", true, "legacy")).status).toBe("current");
    expect(compareMobileGraphProbes({ ...document, identity: { ...document.identity, structuralHash: "changed" },
      display: { ...document.display, pinnedProbes: [...document.display.pinnedProbes!, { ...document.display.pinnedProbes![0], id: "probe_2" }] } })).toMatch(/stale/);
  });
});
