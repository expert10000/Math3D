import { describe, expect, it, vi } from "vitest";
vi.mock("expo-file-system", () => ({ Paths: { document: "test://documents" } }));
import { promoteGraph2DToCurve, revolveGraph2DProfile, extrudeGraph2DProfile, graph2DPromotionStatus,
  parseMixedWorkspaceDocument, applyGraph2DAuthoring, evaluateGraph2DPromotionGeometry, serializeMixedWorkspaceDocument,
  createMixedWorkspaceDocument, createGraph2DWorkspaceProject, createSurfaceDocument } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { createMobileGraph, readMobileGraph, storeMobileGraph, readMobileGraphWorkspace, updateStoredMobileGraph, importMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { readMobileGraphPromotions, commitMobileGraphPromotion } from "../../apps/mobile/src/models/mobileGraphPromotions";
import { mobileGraphFunctionDraft, mobileGraphAuthoringAction } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { renameMobileProject, duplicateMobileProject } from "../../apps/mobile/src/models/mobileProjectOperations";
import { serializeMobileProjectHandoff, createMobileHandoffExportName } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { snapshotFromMobileProbe } from "../../apps/mobile/src/services/mobilePlatformCapabilities";
import { projectMobilePromotion } from "../../apps/mobile/src/viewer/mobilePromotionProjection";
import { parseWorkspaceProjectHandoff } from "@math3d/core";

const platform = snapshotFromMobileProbe({ persistentStorage: true, network: false, touchInput: true });
describe("MOB-G10 native portable promotions", () => {
  it("previews/cancels without touching Graph history, storage or source", () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph("Preview", true, "preview-g10")), source = adapter.document();
    const project = storeMobileGraph(source);
    for (const promotion of [promoteGraph2DToCurve(source, "function_1"), revolveGraph2DProfile(source, "function_1", { axis: "y", orientation: "negative" }),
      extrudeGraph2DProfile(source, "function_1", { direction: [0, 0, 1], length: 3, caps: "none" })]) {
      const geometry = evaluateGraph2DPromotionGeometry(promotion.document);
      expect(geometry.positions.every(Number.isFinite)).toBe(true); expect(geometry.positions.length / 3).toBeLessThanOrEqual(6321);
      const lines = projectMobilePromotion(promotion.document, { width: 320, height: 180 }, Math.PI / 6);
      expect(lines.length).toBeGreaterThan(0); expect(lines.length).toBeLessThanOrEqual(768);
      if (promotion.trace.operation === "graph2d.extrude-surface")
        expect(lines.some((line) => Math.abs(line.a.x - line.b.x) < 1e-6 && Math.abs(line.a.y - line.b.y) > 0.5)).toBe(true);
      expect(lines.every((l) => [l.a.x, l.a.y, l.b.x, l.b.y].every(Number.isFinite))).toBe(true);
    }
    expect(readMobileGraph(project)).toEqual(source); expect(adapter.history().undoDepth).toBe(0); expect(readMobileGraphWorkspace(project)).toBeNull();
  });
  it("creates all three ordinary target types and keeps exact source lineage across save/export/reopen", () => {
    const source = createMobileGraph("Portable", true, "portable-g10"); let project = storeMobileGraph(source, 1);
    const created = [promoteGraph2DToCurve(source, "function_1"), revolveGraph2DProfile(source, "function_1", { axis: "x", orientation: "positive" }),
      extrudeGraph2DProfile(source, "function_1", { direction: [0, 0, 2], length: 3, caps: "none" })];
    for (const promotion of created) project = commitMobileGraphPromotion(project, source, promotion, platform, 2);
    const workspace = parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(project)).project;
    expect(workspace.entries.map((e) => e.module)).toEqual(["graph2d", "curve", "surface", "surface"]);
    expect(workspace.relations).toEqual(created.map((p) => p.relation));
    expect(readMobileGraph(project).identity).toEqual(source.identity); expect(readMobileGraphPromotions(project)).toEqual(created);
    expect(createMobileHandoffExportName(project)).toMatch(/handoff\.json$/);
    const reopened = importMobileGraph(serializeMobileProjectHandoff(project), [], "portable.workspace.json");
    expect(readMobileGraphPromotions(reopened)).toEqual(created);
    project = updateStoredMobileGraph(project, { ...source, display: { ...source.display, axes: { ...source.display.axes, grid: false } } });
    expect(readMobileGraphWorkspace(project)?.entries.slice(1)).toEqual(workspace.entries.slice(1));
    expect(readMobileGraphPromotions(project).every((p) => graph2DPromotionStatus(p, source) === "current")).toBe(true);
    expect(() => commitMobileGraphPromotion(project, source, created[0]!, platform)).toThrow(/already exists/);
  });
  it("marks edited sources stale without replacing their targets, and rejects stale preview creation", () => {
    const adapter = new Graph2DCommandAdapter(createMobileGraph("Stale", true, "stale-g10")), source = adapter.document();
    const preview = promoteGraph2DToCurve(source, "function_1"), project = commitMobileGraphPromotion(undefined, source, preview, platform);
    const action = mobileGraphAuthoringAction({ objectId: "function_1", draft: { ...mobileGraphFunctionDraft(source, "function_1"), expression: "x^2" } });
    adapter.commitScene(applyGraph2DAuthoring(source, action), "edit"); const edited = adapter.document();
    const saved = updateStoredMobileGraph(project, edited), target = readMobileGraphPromotions(saved)[0]!;
    expect(target.document).toEqual(preview.document); expect(graph2DPromotionStatus(target, edited)).toBe("stale");
    expect(() => commitMobileGraphPromotion(project, edited, preview, platform)).toThrow(/stale/);
    const renamed = renameMobileProject(saved, "Renamed", 3); expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(readMobileGraphWorkspace(renamed.project)?.relations).toEqual(readMobileGraphWorkspace(saved)?.relations);
    expect(duplicateMobileProject(saved, [saved]).ok).toBe(false);
    expect(() => importMobileGraph(serializeMobileProjectHandoff(saved), [saved], "collision.json")).toThrow(/companions will not be discarded/);
  });
  it("uses real platform facilities, requires checkpoints, and preserves unrelated companion documents", () => {
    const source = createMobileGraph("Facilities", true, "facilities-g10"), promotion = promoteGraph2DToCurve(source, "function_1");
    const missing = snapshotFromMobileProbe({ persistentStorage: false, network: true, touchInput: true });
    expect(() => commitMobileGraphPromotion(undefined, source, promotion, missing)).toThrow(/persistentStorage/);
    expect(platform.facilities.backgroundWorker.available).toBe(false);
    const companion = createSurfaceDocument({ stableKey: "unrelated", source: revolveGraph2DProfile(source, "function_1", { axis: "x", orientation: "positive" }).document.source });
    const base = createGraph2DWorkspaceProject(source);
    const workspace = createMixedWorkspaceDocument({ ...base, entries: [...base.entries, { module: "surface", checkpoint: companion, expected: companion.identity, replay: null }] });
    const imported = importMobileGraph(serializeMixedWorkspaceDocument(workspace), [], "unrelated.json");
    const result = commitMobileGraphPromotion(imported, source, promotion, platform);
    expect(readMobileGraphWorkspace(result)?.entries[1]?.checkpoint).toEqual(companion);
    const replayed = { ...workspace, entries: workspace.entries.map((entry, i) => i ? { ...entry, replay: { format: "test", payload: {} } } : entry) };
    expect(() => importMobileGraph(serializeMixedWorkspaceDocument(replayed), [], "replay.json")).toThrow(/checkpointed/);
  });
  it("rejects unsupported, discontinuous or invalid-cap profiles without mutation", () => {
    const source = createMobileGraph("Invalid", true, "invalid-g10");
    expect(() => extrudeGraph2DProfile(source, "function_1", { direction: [0, 0, 0], length: 3, caps: "none" })).toThrow();
    expect(() => extrudeGraph2DProfile(source, "function_1", { direction: [0, 0, 1], length: 3, caps: "both" })).toThrow(/closed/);
    expect(() => revolveGraph2DProfile(source, "function_1", { axis: "x", orientation: "positive", angleMin: 1, angleMax: 0 })).toThrow();
    const adapter = new Graph2DCommandAdapter(source);
    adapter.commitScene(applyGraph2DAuthoring(source, mobileGraphAuthoringAction({ objectId: "function_1", draft: { ...mobileGraphFunctionDraft(source, "function_1"), expression: "1/x" } })), "edit");
    const pole = adapter.document(); expect(() => revolveGraph2DProfile(pole, "function_1", { axis: "x", orientation: "positive" })).toThrow(/undefined/);
    expect(readMobileGraphWorkspace(storeMobileGraph(pole))).toBeNull();
  });
});
