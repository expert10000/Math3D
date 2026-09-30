import { beforeEach, describe, expect, it, vi } from "vitest";
const files = vi.hoisted(() => new Map<string, string>());
const faults = vi.hoisted(() => ({ write: "", move: "" }));
vi.mock("expo-file-system", () => {
  class Directory { uri: string; constructor(...parts: Array<string | { uri: string }>) { this.uri = parts.map(p => typeof p === "string" ? p : p.uri).join("/"); } create() {} }
  class File {
    uri: string; constructor(...parts: Array<string | { uri: string }>) { this.uri = parts.map(p => typeof p === "string" ? p : p.uri).join("/"); }
    get exists() { return files.has(this.uri); } get size() { return new TextEncoder().encode(files.get(this.uri) ?? "").length; }
    create() { files.set(this.uri, ""); } delete() { files.delete(this.uri); }
    write(content: string) { if (faults.write === this.uri) throw new Error("ENOSPC"); files.set(this.uri, content); }
    textSync() { return files.get(this.uri) ?? ""; } async text() { return this.textSync(); }
    copy(destination: File) { files.set(destination.uri, this.textSync()); }
    move(destination: File) {
      if (faults.move === destination.uri) { faults.move = ""; throw new Error("Injected rename failure"); }
      files.set(destination.uri, this.textSync()); files.delete(this.uri); this.uri = destination.uri;
    }
  }
  return { Directory, File, Paths: { document: "documents" } };
});
import { applyGraph2DAuthoring, createGraph2DWorkspaceProject, createMixedWorkspaceDocument, createWorkspaceProjectHandoff, getGraph2DPresetCatalog,
  getGraph2DGuidedConcepts, getGraph2DGuidedPreset, graph2DPinnedProbeState,
  getGraph2DInteractivePreset, getGraph2DInteractivePresetGuidance, previewGraph2DParameterValues, createGraph2DAnimationPlan, graph2DAnimationFrame,
  instantiateGraph2DPreset, parseWorkspaceProjectHandoff, promoteGraph2DToCurve, serializeWorkspaceProjectHandoff, assertWorkspaceHandoffCanReplace } from "@math3d/core";
import { planMobileGraphPresetLaunch, commitMobileGraphPresetLaunch } from "../../apps/mobile/src/models/mobileGraphPresetLaunch";
import { createMobileGraph, importMobileGraph, readMobileGraph, readMobileGraphWorkspace, storeMobileGraph, updateStoredMobileGraph } from "../../apps/mobile/src/models/mobileGraphProject";
import { mobileGraphPointTables, stageMobileGraphPresetSidecars } from "../../apps/mobile/src/services/mobileGraphPointTables";
import { loadStoredSceneProjects, saveStoredSceneProjects } from "../../apps/mobile/src/services/mobileSceneStorage";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { Graph2DCommandAdapter } from "@math3d/kernel";

const catalog = getGraph2DPresetCatalog(), data = catalog.get("piecewise-data-gaps")!;
const commit = (plan: ReturnType<typeof planMobileGraphPresetLaunch>) => commitMobileGraphPresetLaunch(plan, saveStoredSceneProjects, stageMobileGraphPresetSidecars);
const tablePath = `documents/math3d-graph-tables/${data.sidecars[0]!.id.slice(14)}.json`;
describe("ordinary mobile preset creation and atomic current-work preservation", () => {
  beforeEach(() => { files.clear(); faults.write = ""; faults.move = ""; mobileGraphPointTables.clearCache(); });
  it.each(getGraph2DGuidedConcepts())("GGL13 opens $id through ordinary native storage with current saved markers", async concept => {
    const preset = getGraph2DGuidedPreset(concept.id);
    const result = await commit(planMobileGraphPresetLaunch(preset, `native-guide-${concept.id}`, [], {}, 1));
    const loaded = readMobileGraph((await loadStoredSceneProjects()).projects[0]!);
    expect(loaded.source).toEqual(preset.template.source);
    expect(loaded.display.pinnedProbes).toHaveLength(concept.markers.length);
    expect(loaded.display.pinnedProbes!.every(probe => graph2DPinnedProbeState(loaded, probe) === "current")).toBe(true);
    expect(parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(result.project)).project.entries[0]!.checkpoint).toEqual(loaded);
  });
  it.each(catalog.entries.flatMap(p=>{const variant=getGraph2DInteractivePreset(p);return variant?[variant]:[];}))(
    "GGL10 $id launches and returns controls, edited values and suggested playback through ordinary storage", async preset => {
      const result=await commit(planMobileGraphPresetLaunch(preset,`interactive-${preset.id}`,[],{},1));
      const loaded=await loadStoredSceneProjects(),document=readMobileGraph(loaded.projects[0]!);
      expect(document.source).toEqual(preset.template.source);expect(document.metadata.title).toBe(preset.title);
      const guidance=getGraph2DInteractivePresetGuidance(document)!,commands=new Graph2DCommandAdapter(document);
      const snapshot=[...files],plan=createGraph2DAnimationPlan(document,guidance.animation);
      for(let i=0;i<plan.frames;i++)graph2DAnimationFrame(document,plan,i);
      for(const p of document.source.variables)previewGraph2DParameterValues(document,{[p.name]:p.control!.min});
      expect([...files]).toEqual(snapshot);expect(commands.history().undoDepth).toBe(0);
      const action={type:"parameter-value" as const,name:plan.parameter,value:plan.to};
      const edited=commands.commitScene(applyGraph2DAuthoring(document,action),action.type);
      expect(commands.history().undoDepth).toBe(1);expect(commands.undo()!.source).toEqual(document.source);
      expect(commands.redo()!.source).toEqual(edited.source);
      const stored=updateStoredMobileGraph(result.project,edited,2);await saveStoredSceneProjects([stored]);
      const restarted=readMobileGraph((await loadStoredSceneProjects()).projects[0]!);
      const returned=parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(stored)).project.entries[0]!.checkpoint;
      expect(restarted).toEqual(edited);expect(returned).toEqual(edited);expect(getGraph2DInteractivePresetGuidance(restarted)).toEqual(guidance);
      expect(restarted.source.variables).toEqual(edited.source.variables);
    });
  it.each(catalog.entries)("creates $id with exact shared source/display, checked sidecars and normal restart/export", async preset => {
    const plan = planMobileGraphPresetLaunch(preset, `native-${preset.id}`, [], {}, 10), result = await commit(plan);
    const loaded = await loadStoredSceneProjects(); expect(loaded.projects).toEqual(result.projects);
    const document = readMobileGraph(loaded.projects[0]!);
    expect(document.source).toEqual(preset.template.source); expect(document.display).toEqual(preset.template.display);
    expect(document.identity.id).not.toBe(preset.template.identity.id); expect(result.project.source).toBeUndefined();
    const handoff = parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(result.project));
    expect(handoff.baseRevision).toBeNull(); expect(handoff.project.entries[0]!.checkpoint).toEqual(document);
    for (const object of document.source.objects) if (object.kind === "point-series") expect(mobileGraphPointTables.resolve(object.table)).toEqual(preset.sidecars[0]!.rows);
  });
  it("saves current Graph edits and imported companion/source ancestry in the same library write", async () => {
    const graph = instantiateGraph2DPreset(catalog.get("parabola-tangent")!, "old-native").document;
    const curve = promoteGraph2DToCurve(graph, graph.source.objects[0]!.id), workspace = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(graph),
      entries: [...createGraph2DWorkspaceProject(graph).entries, { module: "curve", expected: curve.document.identity, checkpoint: curve.document, replay: null }], relations: [curve.relation] });
    const original = createWorkspaceProjectHandoff(workspace, { producer: { platform: "desktop", name: "Math3D", version: "1" } });
    const stored = importMobileGraph(serializeWorkspaceProjectHandoff(original), [], "original.json", 1, "desktop");
    const object = graph.source.objects[0]!; if (object.kind !== "explicit-cartesian") throw new Error("Expected explicit preset.");
    const edited = new Graph2DCommandAdapter(graph).commitScene(applyGraph2DAuthoring(graph, { type: "edit", objectId: graph.source.objects[0]!.id,
      draft: { label: "Parabola", expression: "2*x^2", domain: object.domain, style: graph.display.objects[0]! } }), "edit");
    const result = await commit(planMobileGraphPresetLaunch(data, "new-native", [stored], { graph: edited }, 2));
    const preserved = result.projects.find(project => project.id === stored.id)!;
    expect(readMobileGraph(preserved)).toEqual(edited); expect(readMobileGraphWorkspace(preserved)?.entries[1]!.checkpoint).toEqual(curve.document);
    expect(readMobileGraphWorkspace(preserved)?.relations).toEqual([curve.relation]); expect(preserved.source).toEqual(stored.source);
    expect(parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(preserved)).baseRevision).toBe(original.projectRevision);
  });
  it("preserves a live ordinary scene and keeps independent copies of a catalog entry", async () => {
    const scene = { id: "native-scene", title: "Current surface", createdAt: 1, updatedAt: 2, surfaces: [] };
    const first = await commit(planMobileGraphPresetLaunch(data, "copy-one", [], { scene }, 3));
    const second = await commit(planMobileGraphPresetLaunch(data, "copy-two", first.projects, { graph: readMobileGraph(first.project) }, 4));
    expect(second.projects).toHaveLength(3); expect(second.project.id).not.toBe(first.project.id);
    expect(JSON.parse(second.projects.find(project => project.id === scene.id)!.serializedProject).scene).toEqual(scene);
    expect(() => planMobileGraphPresetLaunch(data, "copy-two", second.projects, {}, 5)).toThrow(/already exists/);
  });
  it("rolls back new sidecars on a library failure and never overwrites an existing valid table", async () => {
    const old = storeMobileGraph(createMobileGraph("Current", true, "rollback-native"), 1); await saveStoredSceneProjects([old]);
    const before = files.get("documents/math3d-mobile/scene-projects.json");
    faults.move = "documents/math3d-mobile/scene-projects.json";
    await expect(commit(planMobileGraphPresetLaunch(data, "failure", [old], { graph: readMobileGraph(old) }, 2))).rejects.toThrow(/rename/);
    expect(files.get("documents/math3d-mobile/scene-projects.json")).toBe(before); expect(files.has(tablePath)).toBe(false);
    expect((await loadStoredSceneProjects()).projects).toEqual([old]);
    stageMobileGraphPresetSidecars(data.sidecars); const prior = files.get(tablePath);
    faults.write = "documents/math3d-mobile/scene-projects.tmp";
    await expect(commit(planMobileGraphPresetLaunch(data, "failure-again", [old], {}, 3))).rejects.toThrow(/ENOSPC/);
    expect(files.get(tablePath)).toBe(prior);
  });
  it("cleans a failed staged write/rename and refuses corrupt existing tables without changing them", async () => {
    for (const phase of ["write", "move"] as const) {
      faults[phase] = phase === "write" ? tablePath.replace(".json", ".gallery.tmp") : tablePath;
      await expect(commit(planMobileGraphPresetLaunch(data, phase, [], {}, 1))).rejects.toThrow();
      expect(files.size).toBe(0); faults[phase] = "";
    }
    files.set(tablePath, "corrupt"); const before = [...files];
    await expect(commit(planMobileGraphPresetLaunch(data, "corrupt", [], {}, 1))).rejects.toThrow(/corrupt/);
    expect([...files]).toEqual(before);
  });
  it("does not leave a new project or sidecar after the first library commit fails", async () => {
    faults.move = "documents/math3d-mobile/scene-projects.json";
    await expect(commit(planMobileGraphPresetLaunch(data, "first-fail", [], {}, 1))).rejects.toThrow(/rename/);
    expect((await loadStoredSceneProjects()).projects).toEqual([]); expect(files.has(tablePath)).toBe(false);
  });
  it.each(catalog.entries)("GGL09 $id edits/undo/restart and desktop return preserve source, sidecars and ancestry", async preset => {
    const originalTemplate = JSON.stringify(preset), plan = await commit(planMobileGraphPresetLaunch(preset, `return-${preset.id}`, [], {}, 1));
    const commands = new Graph2DCommandAdapter(readMobileGraph(plan.project)), before = commands.document();
    const created = commands.commitScene(applyGraph2DAuthoring(before, { type: "duplicate", objectId: before.source.objects[0]!.id }), "duplicate");
    const undone = commands.undo()!; expect(undone.source).toEqual(before.source); expect(undone.display).toEqual(before.display);
    expect(undone.identity.structuralHash).toBe(before.identity.structuralHash); expect(undone.identity.revision).toBeGreaterThan(before.identity.revision);
    const duplicated = commands.redo()!; expect(duplicated.source).toEqual(created.source); expect(duplicated.display).toEqual(created.display);
    const edited = updateStoredMobileGraph(plan.project, commands.document(), 2); await saveStoredSceneProjects([edited]);
    const restarted = (await loadStoredSceneProjects()).projects[0]!;
    const onDesktop = parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(restarted));
    expect(onDesktop.baseRevision).toBeNull(); expect(onDesktop.project.entries[0]!.checkpoint).toEqual(duplicated);
    const desktopExport = createWorkspaceProjectHandoff(onDesktop.project, { producer: { platform: "desktop", name: "Math3D", version: "1.5.0" } });
    const onMobile = importMobileGraph(serializeWorkspaceProjectHandoff(desktopExport), [], "desktop-return.json", 3, "desktop");
    const returnedCommands = new Graph2DCommandAdapter(readMobileGraph(onMobile));
    returnedCommands.commitViewport({ ...duplicated.display.viewport, xMin: duplicated.display.viewport.xMin + 0.1 });
    const returned = parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(updateStoredMobileGraph(onMobile, returnedCommands.document(), 4)));
    expect(() => assertWorkspaceHandoffCanReplace(returned, onDesktop.project)).not.toThrow();
    expect(returned.project.entries[0]!.checkpoint).toEqual(returnedCommands.document());
    expect(readMobileGraph(onMobile).source).toEqual(duplicated.source); expect(JSON.stringify(preset)).toBe(originalTemplate);
    for (const object of duplicated.source.objects) if (object.kind === "point-series") expect(mobileGraphPointTables.resolve(object.table)).toEqual(preset.sidecars[0]!.rows);
  });
});
