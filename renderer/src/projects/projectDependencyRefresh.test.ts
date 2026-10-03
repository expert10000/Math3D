import { describe, expect, it } from "vitest";
import { createMath3DProject, instantiateMath3DProjectTemplate } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { ProjectCommandAdapter } from "./projectCommandAdapter";
import { projectDependencyRefreshOptions, refreshProjectDependency, projectAnalysisRefreshOptions, recomputeProjectAnalysis } from "./projectDependencyRefresh";
import { inspectProjectDependencies } from "./projectDependencies";

const fixture = () => {
  const original = instantiateMath3DProjectTemplate("catenary-study", "refresh");
  const graph = original.workspace.entries[0]!.checkpoint;
  if (graph.format !== "math3d.graph2d-document") throw new Error("Missing Graph fixture");
  const adapter = new Graph2DCommandAdapter(graph);
  const next = adapter.commitScene({ source: { ...graph.source, variables: [...graph.source.variables, { name: "a", value: 2 }] }, display: graph.display, selection: graph.selection }, "parameter-create");
  return createMath3DProject({ ...original.workspace, entries: original.workspace.entries.map(entry => entry.module === "graph2d" ? { ...entry, checkpoint: next, expected: next.identity } : entry) }, { stableKey: "edited-refresh" });
};
describe("PRJ20 explicit dependency refresh", () => {
  it("creates current Curve and Surface copies, retaining old sources, lineage and historical analysis", () => {
    const project = fixture(), options = projectDependencyRefreshOptions(project);
    expect(options.filter(option => option.canRefresh)).toHaveLength(2);
    let next = project;
    for (const option of options) next = refreshProjectDependency(next, option.relationId);
    expect(next.workspace.entries.slice(0, 3)).toEqual(project.workspace.entries);
    expect(next.workspace.results).toEqual(project.workspace.results);
    expect(next.workspace.relations.slice(0, project.workspace.relations.length)).toEqual(project.workspace.relations);
    expect(inspectProjectDependencies(next).relations.slice(-2).every(relation => relation.freshness === "current")).toBe(true);
    expect(() => refreshProjectDependency(next, options[0]!.relationId)).toThrow("already exists");
    const history = new ProjectCommandAdapter(project); history.commit(next); expect(history.undo().workspace).toEqual(project.workspace); expect(history.redo().workspace).toEqual(next.workspace);
  });
  it("rejects a missing source object without modifying the project", () => {
    const project = fixture(); const graph = project.workspace.entries[0]!.checkpoint;
    if (graph.format !== "math3d.graph2d-document") return;
    const adapter = new Graph2DCommandAdapter(graph), next = adapter.commitScene({ source: { ...graph.source, objects: [] }, display: { ...graph.display, objects: [] }, selection: { objectId: null, probe: null } }, "delete");
    const missing = createMath3DProject({ ...project.workspace, entries: project.workspace.entries.map(entry => entry.module === "graph2d" ? { ...entry, checkpoint: next, expected: next.identity } : entry) }, { stableKey: "missing" });
    const options = projectDependencyRefreshOptions(missing); expect(options.every(option => !option.canRefresh)).toBe(true);
    expect(() => refreshProjectDependency(missing, options[0]!.relationId)).toThrow("cannot be refreshed"); expect(missing.workspace.entries).toHaveLength(3);
  });
  it("publishes a new current derivative record while retaining historical provenance and rejecting duplicate publication", () => {
    const project = fixture(), option = projectAnalysisRefreshOptions(project)[0]!;
    expect(option.canRecompute).toBe(true);
    const next = recomputeProjectAnalysis(project, option.resultId);
    expect(next.workspace.entries).toEqual(project.workspace.entries);
    expect(next.workspace.results.slice(0, -1)).toEqual(project.workspace.results);
    expect(next.workspace.results.at(-1)!.provenance.source.revision).toBe(project.workspace.entries[0]!.expected.revision);
    expect(inspectProjectDependencies(next).results.at(-1)!.sourceFreshness).toBe("current");
    expect(() => recomputeProjectAnalysis(next, option.resultId)).toThrow("already exists");
    const history = new ProjectCommandAdapter(project); history.commit(next); expect(history.undo().workspace).toEqual(project.workspace);
  });
});
