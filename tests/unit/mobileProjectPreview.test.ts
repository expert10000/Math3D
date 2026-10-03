import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, instantiateMath3DProjectTemplate, serializeMath3DProject, serializeMixedWorkspaceDocument } from "@math3d/core";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";
import { buildMobileProjectLibraryCards } from "../../apps/mobile/src/models/mobileProjectLibrary";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { selectMobileStartupProject } from "../../apps/mobile/src/models/mobileStartupProject";
import { renameMobileProject, duplicateMobileProject } from "../../apps/mobile/src/models/mobileProjectOperations";
import { createMobileGraph, importMobileGraph, storeMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";

describe("PRJ21 broader saved project previews", () => {
  it.each(["scene-topology-study", "curve-construction-study", "spline-surface-lab"] as const)("retains %s through import, inspection, export and restart without enabling editors", id => {
    const original = instantiateMath3DProjectTemplate(id, "preview"), raw = JSON.stringify(original, null, 4);
    const stored = importMobileProjectPreview(raw, [], "desktop.json", "desktop", 10);
    expect(readMobilePreviewProject(stored)).toEqual(original);
    expect(serializeMobileProjectHandoff(stored)).toBe(raw);
    expect(readMobilePreviewProject(JSON.parse(JSON.stringify(stored)))).toEqual(original);
    expect(buildMobileProjectExplorer(raw).groups.flatMap(group => group.documents).every(document => document.editing === "Saved preview")).toBe(true);
    expect(buildMobileProjectLibraryCards([stored], { section: "all", query: "", sort: "title" })[0]).toMatchObject({ compatible: true, projectType: "project-preview", objectCount: original.workspace.entries.length });
    expect(selectMobileStartupProject([stored], stored.id, false)).toBeNull();
    expect(duplicateMobileProject(stored, [stored])).toMatchObject({ ok: false });
    const renamed = renameMobileProject(stored, "Renamed study", 20);
    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(readMobilePreviewProject(renamed.project).workspace).toEqual(original.workspace);
  });
  it("retains multiple Graphs, archive metadata, scripts and historical records without reducing the workspace to one Graph", () => {
    const a = instantiateMath3DProjectTemplate("derivative-study", "preview-a"), b = instantiateMath3DProjectTemplate("derivative-study", "preview-b");
    const project = createMath3DProject(createMixedWorkspaceDocument({ ...a.workspace, entries: [...a.workspace.entries, ...b.workspace.entries],
      constructions: [{ kind: "scene-script", source: "retained", normalizedSceneScript: {} }] }), { stableKey: "multi-preview" });
    const stored = importMobileProjectPreview(serializeMath3DProject(project), [], "mixed.json");
    expect(readMobilePreviewProject(stored).workspace).toEqual(project.workspace);
    expect(serializeMobileProjectHandoff(stored)).toBe(serializeMath3DProject(project));
    expect(() => importMobileProjectPreview(stored.serializedProject, [stored], "same.json")).toThrow("already exists");
    expect(() => readMobilePreviewProject({ ...stored, title: "wrong" })).toThrow("inconsistent");
    const editable = importMobileGraph(serializeMath3DProject(a), [stored], "graph.json");
    expect(editable.projectType).toBe("graph2d");
  });
  it("wraps raw mixed checkpoints, rejects replay/corruption and preserves existing projects on failure", () => {
    const named = instantiateMath3DProjectTemplate("scene-topology-study", "raw-preview");
    const preview = importMobileProjectPreview(serializeMixedWorkspaceDocument(named.workspace), [], "mixed.json");
    expect(readMobilePreviewProject(preview).workspace).toEqual(named.workspace);
    const projects = [storeMobileGraph(createMobileGraph("My work", true, "existing"))], before = JSON.stringify(projects);
    expect(() => importMobileProjectPreview("{broken", projects, "broken.json")).toThrow();
    const replay = createMath3DProject(createMixedWorkspaceDocument({ ...named.workspace, entries: named.workspace.entries.map(entry => ({ ...entry, replay: { format: "future", payload: {} } })) }), { stableKey: "unexecuted" });
    expect(() => importMobileProjectPreview(serializeMath3DProject(replay), projects, "replay.json")).toThrow("Export checkpoint JSON");
    expect(JSON.stringify(projects)).toBe(before);
  });
});
