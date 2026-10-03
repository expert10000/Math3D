import { describe, expect, it } from "vitest";
import { applyGraph2DAuthoring, canonicalJsonStringify, createMixedWorkspaceDocument, Graph2DPointTableStore,
  replaceMath3DProjectWorkspace, serializeMath3DProject, updateMath3DProjectMetadata, type Graph2DDocument } from "@math3d/core";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { MobileProjectGraphSessions } from "../../apps/mobile/src/models/mobileProjectGraphSessions";
import { importMobileProjectPreview, readMobilePreviewProject } from "../../apps/mobile/src/models/mobileProjectPreview";
import { mobileGraphAuthoringAction, mobileGraphFunctionDraft } from "../../apps/mobile/src/models/mobileGraphAuthoring";
import { serializeMobileProjectHandoff } from "../../apps/mobile/src/models/mobileProjectTransfer";
import { mobileProjectResourceContext } from "../../apps/mobile/src/models/mobileProjectResources";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";
import { preserveMobilePersonalGraphWork } from "../../apps/mobile/src/models/mobileGraphPersonalProjects";
import { selectMobileStartupProject } from "../../apps/mobile/src/models/mobileStartupProject";
import { parseProjectPackage } from "../../renderer/src/projects/projectResources";

const edit = (sessions: MobileProjectGraphSessions, id: string, expression: string) => {
  const adapter = sessions.requireEditable(id), document = adapter.document();
  const objectId = document.source.objects.find(object => object.kind === "explicit-cartesian")?.id ?? null;
  const draft = { ...mobileGraphFunctionDraft(document, objectId), expression };
  const action = mobileGraphAuthoringAction({ objectId, draft });
  return adapter.commitScene(applyGraph2DAuthoring(document, action), action.type);
};
describe("PRJ23 independent Graph editing in retained mixed projects", () => {
  it("switches independently, retains other modules/metadata/history, and restores undo/redo after desktop export", () => {
    const fixture = mobileMixedProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "package.json");
    const sessions = new MobileProjectGraphSessions(stored), [a, b] = fixture.graphIds;
    const beforeA = sessions.adapter(a!).document(), beforeB = sessions.adapter(b!).document();
    edit(sessions, a!, "x*x+1"); edit(sessions, b!, "x*x+2");
    expect(sessions.adapter(a!).document().source).not.toEqual(beforeA.source);
    expect(sessions.adapter(b!).undo()!.source).toEqual(beforeB.source);
    expect(sessions.adapter(a!).history().undoDepth).toBe(1);
    const snapshot = sessions.snapshot(b!), project = readMobilePreviewProject(snapshot);
    expect(project.workspace.entries.filter(entry => entry.module !== "graph2d")).toEqual(fixture.project.workspace.entries.filter(entry => entry.module !== "graph2d"));
    expect(project.metadata).toEqual(fixture.project.metadata);
    for (const field of ["constructions", "relations", "results", "artifacts"] as const) expect(project.workspace[field]).toEqual(fixture.project.workspace[field]);
    const returned = parseProjectPackage(serializeMobileProjectHandoff(snapshot));
    expect(returned.resources.sidecars()).toEqual(fixture.resources.sidecars());
    const restored = new MobileProjectGraphSessions(snapshot);
    expect(restored.adapter(b!).history().redoDepth).toBe(1);
    expect(restored.adapter(b!).redo()!.source.objects).toEqual(sessions.adapter(b!).redo()!.source.objects);
    expect(restored.adapter(a!).undo()!.source).toEqual(beforeA.source);
    expect(restored.adapter(b!).document().source).not.toEqual(beforeB.source);
    expect(selectMobileStartupProject([snapshot], snapshot.id, false)).toEqual(snapshot);
  });
  it("keeps current and historical table bytes when replacing a point series and reopening the undo cursor", () => {
    const fixture = mobileMixedProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "package.json");
    const backing = new Map<string, string>(), tables = new Graph2DPointTableStore({ read: id => backing.get(id) ?? null, write: (id, raw) => { backing.set(id, raw); } });
    const sessions = new MobileProjectGraphSessions(stored, tables), id = fixture.graphIds[0]!, adapter = sessions.requireEditable(id), graph = adapter.document();
    const old = graph.source.objects.find(object => object.kind === "point-series")!;
    if (old.kind !== "point-series") throw new Error("Missing data fixture");
    const replacement = tables.publish([{ id: "row_1", x: 1, y: 5 }, { id: "row_2", x: 2, y: 9 }]);
    adapter.commitScene({ display: graph.display, selection: graph.selection, source: { ...graph.source, objects: graph.source.objects.map(object => object.id === old.id ? { ...old, table: replacement } : object) } }, "edit");
    const snapshot = sessions.snapshot(id), returned = parseProjectPackage(serializeMobileProjectHandoff(snapshot));
    expect(returned.resources.sidecars().filter(item => item.kind === "graph-point-table").map(item => item.id).sort()).toEqual([old.table.id, replacement.id].sort());
    const restored = new MobileProjectGraphSessions(snapshot);
    expect(restored.tables().resolve(replacement)).not.toBeNull(); expect(restored.tables().resolve(old.table)).not.toBeNull();
    expect(restored.adapter(id).undo()!.source).toEqual(graph.source);
  });
  it("blocks only the Graph with missing tables and blocks archived Graph editing", () => {
    const fixture = mobileMixedProjectFixture(), missing = importMobileProjectPreview(serializeMath3DProject(fixture.project), [], "plain.json");
    const sessions = new MobileProjectGraphSessions(missing);
    expect(() => sessions.requireEditable(fixture.graphIds[0]!)).toThrow("missing");
    expect(sessions.requireEditable(fixture.graphIds[1]!).document()).toBeDefined();
    const explorer = buildMobileProjectExplorer(missing.serializedProject);
    expect(explorer.groups.find(group => group.module === "graph2d")!.documents.map(document => document.editing)).toEqual(["Saved preview", "Graph workspace"]);
    const archived = updateMath3DProjectMetadata(fixture.project, { ...fixture.project.metadata, documents: { ...fixture.project.metadata.documents,
      [fixture.graphIds[1]!]: { archived: true } } });
    const record = importMobileProjectPreview(serializeMath3DProject(archived), [], "archived.json");
    expect(() => new MobileProjectGraphSessions(record).requireEditable(fixture.graphIds[1]!)).toThrow("archived");
  });
  it("preserves the complete mixed container when launching another Graph instead of creating an orphan document", () => {
    const fixture = mobileMixedProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "package.json"), sessions = new MobileProjectGraphSessions(stored);
    const graph = edit(sessions, fixture.graphIds[1]!, "x+3"), snapshot = sessions.snapshot(graph.identity.id);
    const preserved = preserveMobilePersonalGraphWork([stored], { graph, project: snapshot }, 40);
    expect(preserved).toEqual([snapshot]); expect(preserved.some(project => project.id === graph.identity.id)).toBe(false);
    expect(canonicalJsonStringify(stored)).not.toBe(canonicalJsonStringify(snapshot));
    expect(parseProjectPackage(serializeMobileProjectHandoff(snapshot)).project.workspace.results).toEqual(fixture.project.workspace.results);
  });
  it("rejects corrupt Graph replay and unsupported module replay without mutating retained work", () => {
    const fixture = mobileMixedProjectFixture(), stored = importMobileProjectPreview(fixture.raw, [], "package.json"), sessions = new MobileProjectGraphSessions(stored);
    edit(sessions, fixture.graphIds[1]!, "x+4"); const snapshot = sessions.snapshot();
    const project = readMobilePreviewProject(snapshot), entry = project.workspace.entries.find(entry => entry.expected.id === fixture.graphIds[1])!;
    const replay = JSON.parse(JSON.stringify(entry.replay)); replay.payload.transactions[0].stateHash = "sha256:" + "0".repeat(64);
    const corrupt = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(value => value === entry ? { ...entry, replay } : value) }));
    expect(() => importMobileProjectPreview(serializeMath3DProject(corrupt), [], "bad.json")).toThrow("verification");
    expect(readMobilePreviewProject(stored)).toEqual(fixture.project);
    expect(mobileProjectResourceContext.resolveWorkspace(project.workspace).get(fixture.graphIds[1]!)?.format).toBe("math3d.graph2d-document");
  });
});
