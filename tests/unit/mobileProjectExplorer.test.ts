import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, instantiateMath3DProjectTemplate, serializeMath3DProject } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { buildMobileProjectExplorer } from "../../apps/mobile/src/models/mobileProjectExplorer";

describe("PRJ21 read-only named-project explorer", () => {
  it("shows all companions, revisions, relations and analysis without modifying the saved project", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "mobile-explorer");
    const bytes = serializeMath3DProject(project), explorer = buildMobileProjectExplorer(bytes);
    const documents = explorer.groups.flatMap(group => group.documents);
    expect(documents.map(document => document.module)).toEqual(["graph2d", "curve", "surface"]);
    expect(documents.map(document => document.editing)).toEqual(["Graph workspace", "Curve workspace", "Saved preview"]);
    expect(explorer.relations).toHaveLength(project.workspace.relations.length);
    expect(explorer.results).toHaveLength(project.workspace.results.length);
    expect(serializeMath3DProject(project)).toBe(bytes);
  });
  it("rejects malformed bytes and does not pretend unexecuted replay is a current source", () => {
    expect(() => buildMobileProjectExplorer('{"format":"future.project"}')).toThrow();
    const project = instantiateMath3DProjectTemplate("catenary-study", "mobile-explorer-replay");
    const replay = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(entry => ({ ...entry, replay: { format: "future", payload: {} } })) }), { stableKey: "replay" });
    expect(() => buildMobileProjectExplorer(serializeMath3DProject(replay))).toThrow(/Unsupported .* replay format|Export checkpoint JSON/);
  });
  it("labels stale companions and historical analysis after the Graph changes", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "mobile-explorer-stale"), graph = project.workspace.entries[0]!.checkpoint;
    if (graph.format !== "math3d.graph2d-document") throw new Error("Missing Graph");
    const adapter = new Graph2DCommandAdapter(graph);
    const next = adapter.commitScene({ source: { ...graph.source, objects: [] }, display: { ...graph.display, objects: [] }, selection: { objectId: null, probe: null } }, "delete");
    const edited = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(entry => entry.module === "graph2d" ? { ...entry, checkpoint: next, expected: next.identity } : entry) }), { stableKey: "edited-explorer" });
    const explorer = buildMobileProjectExplorer(serializeMath3DProject(edited));
    expect(explorer.groups.filter(group => group.module === "curve" || group.module === "surface").flatMap(group => group.documents).every(document => document.stale && document.editing === (document.module === "curve" ? "Curve workspace" : "Saved preview"))).toBe(true);
    expect(explorer.results.every(result => result.freshness === "stale")).toBe(true);
  });
  it("inspects other checkpointed modules without enabling their mobile editors", () => {
    const project = instantiateMath3DProjectTemplate("scene-topology-study", "mobile-preview");
    const explorer = buildMobileProjectExplorer(serializeMath3DProject(project));
    expect(explorer.groups.filter(group => group.documents.length).map(group => group.module)).toEqual(["geometry", "topology"]);
    expect(explorer.groups.flatMap(group => group.documents).every(document => document.editing === "Saved preview")).toBe(true);
  });
});
