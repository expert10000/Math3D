import { describe, expect, it } from "vitest";
import { createGraph2DDocument, serializeGraph2DDocument, structuralHash, parseGraph2DDocument,
  createGraph2DWorkspaceProject, serializeMixedWorkspaceDocument, parseGraph2DExpression } from "@math3d/core";
import { createMobileGraph, storeMobileGraph, readMobileGraph, importMobileGraph, mobileGraphCapabilities } from "../../apps/mobile/src/models/mobileGraphProject";
import { buildMobileProjectLibraryCards } from "../../apps/mobile/src/models/mobileProjectLibrary";
import { renameMobileProject, duplicateMobileProject } from "../../apps/mobile/src/models/mobileProjectOperations";
import { serializeMobileProjectHandoff, createMobileHandoffExportName } from "../../apps/mobile/src/models/mobileProjectTransfer";

describe("mobile Graph projects use the portable core document", () => {
  it("creates empty and starter projects in the ordinary project library", () => {
    const empty = storeMobileGraph(createMobileGraph("Empty graph", false, "empty"), 1);
    const starter = storeMobileGraph(createMobileGraph("Line", true, "starter"), 2);
    expect(readMobileGraph(empty).source.objects).toHaveLength(0);
    expect(readMobileGraph(starter).source.objects).toHaveLength(1);
    const cards = buildMobileProjectLibraryCards([empty, starter], { query: "", section: "my", sort: "updated" });
    expect(cards).toHaveLength(2); expect(cards.every((card) => card.compatible && card.projectType === "graph2d")).toBe(true);
    expect(cards[0]?.compatibilityMessage).toMatch(/probe/);
  });
  it("imports core and mixed checkpoints, rejects future/unsafe schemas, and never replaces collisions", () => {
    const graph = createMobileGraph("Desktop", true, "desktop");
    const raw = serializeGraph2DDocument(graph);
    const first = importMobileGraph(raw, [], "desktop.json", 3);
    expect(readMobileGraph(first).identity).toEqual(graph.identity);
    const copy = importMobileGraph(raw, [first], "desktop.json", 4);
    expect(copy.id).not.toBe(first.id); expect(readMobileGraph(copy).source).toEqual(graph.source);
    const mixed = importMobileGraph(serializeMixedWorkspaceDocument(createGraph2DWorkspaceProject(graph)), [], "workspace.json");
    expect(readMobileGraph(mixed).identity).toEqual(graph.identity);
    expect(() => importMobileGraph(JSON.stringify({ ...graph, schemaVersion: 99 }), [], "future")).toThrow(/Future/);
    expect(() => importMobileGraph(JSON.stringify({ ...graph, requiredCapabilities: ["unsafe.host-eval"] }), [], "unsafe")).toThrow(/unavailable/);
    expect(() => readMobileGraph({ ...first, id: "wrong" })).toThrow(/identity/);
  });
  it("renames, duplicates, and exports without changing mathematical source or hashes", () => {
    const graph = createMobileGraph("Source", true, "rename"), stored = storeMobileGraph(graph);
    const renamed = renameMobileProject(stored, "Renamed");
    expect(renamed.ok).toBe(true); if (!renamed.ok) return;
    expect(readMobileGraph(renamed.project).identity).toEqual(graph.identity);
    const duplicate = duplicateMobileProject(stored, [stored]); expect(duplicate.ok).toBe(true); if (!duplicate.ok) return;
    expect(duplicate.project.id).not.toBe(stored.id);
    expect(readMobileGraph(duplicate.project).identity.structuralHash).toBe(graph.identity.structuralHash);
    expect(readMobileGraph(importMobileGraph(serializeMobileProjectHandoff(stored), [], "handoff.json"))).toEqual(graph);
    expect(createMobileHandoffExportName(stored)).toMatch(/\.math3d\.handoff\.json$/);
  });
  it("preserves advanced definitions but advertises their mobile limitations", () => {
    const ast = parseGraph2DExpression("t", ["t"]); if (!ast.ok) throw new Error("parse failed");
    const graph = createGraph2DDocument({ stableKey: "advanced", source: { objects: [{ id: "p", kind: "parametric", label: "p",
      xExpression: { source: "t", variable: "t", ast: ast.ast }, yExpression: { source: "t", variable: "t", ast: ast.ast },
      domain: { min: 0, max: 1, includeMin: true, includeMax: true } }], variables: [], assumptions: [] } });
    const imported = importMobileGraph(serializeGraph2DDocument(graph), [], "advanced.json");
    expect(structuralHash(readMobileGraph(imported).source)).toBe(graph.identity.structuralHash);
    expect(mobileGraphCapabilities(graph)).toMatch(/parametric.*authoring and probes/);
  });
});
