import { describe, expect, it, vi } from "vitest";
vi.mock("expo-file-system", () => ({ Directory: class {}, File: class {}, Paths: { document: "test://documents" } }));
import { instantiateMath3DProjectTemplate, serializeMath3DProject, parseMath3DProject, createMath3DProject, createMixedWorkspaceDocument,
  createGraph2DWorkspaceProject, instantiateGraph2DPreset, getGraph2DPresetCatalog, applyGraph2DAuthoring } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { importMobileGraph, readMobileGraph, readMobileGraphWorkspace, updateStoredMobileGraph } from "../../../apps/mobile/src/models/mobileGraphProject";
import { renameMobileProject, duplicateMobileProject } from "../../../apps/mobile/src/models/mobileProjectOperations";
import { serializeMobileProjectHandoff, createMobileHandoffExportName, validateMobileProjectForTransfer } from "../../../apps/mobile/src/models/mobileProjectTransfer";
import { decodeMobileSceneStorage } from "../../../apps/mobile/src/services/mobileSceneStorage";
import { exportProjectFile, previewProjectImport } from "./projectTransfer";
import { inspectProjectDependencies } from "./projectDependencies";
import { planMobileGraphFileImport } from "../../../apps/mobile/src/models/mobileGraphPersonalProjects";

describe("Named project desktop/mobile transfer", () => {
  it("stages the incoming project together with unsaved current work before editor activation", () => {
    const current = instantiateMath3DProjectTemplate("derivative-study", "current"), stored = importMobileGraph(serializeMath3DProject(current), [], "current");
    const adapter = new Graph2DCommandAdapter(readMobileGraph(stored));
    adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "duplicate", objectId: "profile" }), "duplicate");
    const incoming = instantiateMath3DProjectTemplate("catenary-study", "incoming"), before = JSON.stringify(stored);
    const plan = planMobileGraphFileImport([stored], { graph: adapter.document() }, serializeMath3DProject(incoming), "incoming", "desktop", () => false, 200);
    expect(plan.projects).toHaveLength(2); expect(plan.project.title).toBe(incoming.metadata.title);
    expect(readMobileGraph(plan.projects[1]!).source).toEqual(adapter.document().source);
    expect(parseMath3DProject(plan.projects[1]!.serializedProject).metadata).toEqual(current.metadata);
    expect(JSON.stringify(stored)).toBe(before);
  });
  it("retains exact project identity, metadata, companions and evidence through native library restart and export", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "mobile"), bytes = exportProjectFile(project);
    const stored = importMobileGraph(bytes, [], "desktop.project.json", 100, "desktop");
    expect(stored.title).toBe(project.metadata.title);
    expect(stored.source!.sourceProjectId).toBe(project.identity.id);
    const decoded = decodeMobileSceneStorage(JSON.stringify({ schemaVersion: 2, projects: [stored] }));
    if (!decoded.ok) throw new Error(decoded.issues.join(" "));
    expect(decoded.projects[0]).toEqual(stored);
    expect(serializeMobileProjectHandoff(decoded.projects[0]!)).toBe(bytes);
    expect(validateMobileProjectForTransfer(stored)).toMatchObject({ ok: true, serializedProject: bytes });
    expect(createMobileHandoffExportName(stored)).toMatch(/\.math3d\.project\.json$/);
    expect(previewProjectImport(serializeMobileProjectHandoff(stored)).project).toEqual(project);
  });
  it("keeps the container and historical lineage when mobile edits and undo/redo advance the Graph source", () => {
    const project = instantiateMath3DProjectTemplate("derivative-study", "editing"), original = importMobileGraph(serializeMath3DProject(project), [], "study");
    const adapter = new Graph2DCommandAdapter(readMobileGraph(original));
    const changed = adapter.commitScene(applyGraph2DAuthoring(adapter.document(), { type: "duplicate", objectId: "profile" }), "duplicate");
    expect(adapter.undo()!.source).toEqual(readMobileGraph(original).source); expect(adapter.redo()!.source).toEqual(changed.source);
    const saved = updateStoredMobileGraph(original, adapter.document(), 200), incoming = parseMath3DProject(serializeMobileProjectHandoff(saved));
    expect(incoming.identity.id).toBe(project.identity.id); expect(incoming.identity.revision).toBeGreaterThan(project.identity.revision);
    expect(incoming.metadata).toEqual(project.metadata); expect(incoming.workspace.entries[1]).toEqual(project.workspace.entries[1]);
    expect(incoming.workspace.relations).toEqual(project.workspace.relations); expect(incoming.workspace.results).toEqual(project.workspace.results);
    expect(readMobileGraphWorkspace(saved)).toEqual(incoming.workspace);
    expect(inspectProjectDependencies(incoming).results[0]!.freshness).toBe("stale");
    expect(previewProjectImport(serializeMobileProjectHandoff(saved)).project).toEqual(incoming);
    const renamed = renameMobileProject(saved, "Renamed on mobile", 300);
    if (!renamed.ok) throw new Error(renamed.error);
    const renamedEnvelope = parseMath3DProject(renamed.project.serializedProject);
    expect(renamedEnvelope.metadata.title).toBe("Renamed on mobile");
    expect(renamedEnvelope.identity).toEqual(incoming.identity); expect(renamedEnvelope.workspace).toEqual(incoming.workspace);
    expect(duplicateMobileProject(renamed.project, [renamed.project]).ok).toBe(false);
  });
  it("rejects future files, collisions, unsupported editor state and missing source tables before changing local work", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "guards"), bytes = serializeMath3DProject(project), stored = importMobileGraph(bytes, [], "original");
    expect(() => importMobileGraph(bytes, [stored], "collision")).toThrow("already exists");
    expect(() => importMobileGraph(JSON.stringify({ ...project, schemaVersion: 99 }), [], "future")).toThrow();
    const replay = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map((entry) => ({ ...entry, replay: { format: "future.replay", payload: {} } })) }), { stableKey: "replay" });
    expect(() => importMobileGraph(serializeMath3DProject(replay), [], "replay")).toThrow("checkpoint");
    const scripts = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, constructions: [{ kind: "scene-script", source: "saved script", normalizedSceneScript: {} }] }), { stableKey: "scripts" });
    expect(() => importMobileGraph(serializeMath3DProject(scripts), [], "scripts")).toThrow("saved scripts");
    const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "named-data").document;
    const data = createMath3DProject(createGraph2DWorkspaceProject(graph), { stableKey: "named-data" });
    expect(() => importMobileGraph(serializeMath3DProject(data), [], "data")).toThrow("sidecar");
    expect(readMobileGraph(importMobileGraph(serializeMath3DProject(data), [], "data", 100, "desktop", () => true))).toEqual(graph);
    expect(stored.serializedProject).toBe(bytes);
  });
});
