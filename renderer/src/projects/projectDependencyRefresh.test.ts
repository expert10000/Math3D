import { describe, expect, it } from "vitest";
import { createMath3DProject, instantiateMath3DProjectTemplate, replaceCurveDocumentSource, createSurfaceDocument, createDocumentRelation,
  viewerSourceFromDocument, analyzeGraph2DIntegral, analyzeGraph2DArcLength, analyzeGraph2DCriticalPoints, analyzeGraph2DIntersections,
  createGraph2DDocument, createCurveDocument, parseGraph2DExpression, advanceDocumentIdentity } from "@math3d/core";
import { Graph2DCommandAdapter } from "@math3d/kernel";
import { ProjectCommandAdapter } from "./projectCommandAdapter";
import { projectDependencyRefreshOptions, refreshProjectDependency, projectAnalysisRefreshOptions, recomputeProjectAnalysis } from "./projectDependencyRefresh";
import { inspectProjectDependencies } from "./projectDependencies";
import { additionalRepresentationView } from "./additionalProjectRepresentations";

const fixture = () => {
  const original = instantiateMath3DProjectTemplate("catenary-study", "refresh");
  const graph = original.workspace.entries[0]!.checkpoint;
  if (graph.format !== "math3d.graph2d-document") throw new Error("Missing Graph fixture");
  const adapter = new Graph2DCommandAdapter(graph);
  const next = adapter.commitScene({ source: { ...graph.source, variables: [...graph.source.variables, { name: "a", value: 2 }] }, display: graph.display, selection: graph.selection }, "parameter-create");
  return createMath3DProject({ ...original.workspace, entries: original.workspace.entries.map(entry => entry.module === "graph2d" ? { ...entry, checkpoint: next, expected: next.identity } : entry) }, { stableKey: "edited-refresh" });
};
describe("PRJ20 explicit dependency refresh", () => {
  it.each(["extrusion", "revolution", "sweep", "tube-surface", "ruled-surface", "loft"])("refreshes %s from ordered current Curves, preserves originals and reopens the new numerical construction", kind => {
    const original = instantiateMath3DProjectTemplate("curve-construction-study", `refresh-${kind}`);
    const parent = original.workspace.entries[0]!.checkpoint, old = original.workspace.entries[1]!.checkpoint;
    if (parent.format !== "math3d.curve-document" || old.format !== "math3d.surface-document") throw new Error("Fixture");
    const second = createCurveDocument({ stableKey: `${kind}-second`, source: parent.source, metadata: parent.metadata });
    const parents = ["ruled-surface", "loft"].includes(kind) ? [parent, second] : [parent];
    const target = createSurfaceDocument({ stableKey: kind, source: { ...old.source, definition: { familyId: kind, sourceIds: parents.map(p => p.identity.id) },
      parameters: { ...old.source.parameters, sourceGenerations: parents.map(viewerSourceFromDocument), radius: 0.2 } } });
    const relation = createDocumentRelation({ kind: "generated-by", sources: parents.map(viewerSourceFromDocument), sourceOrder: "ordered",
      target: { type: "document", generation: viewerSourceFromDocument(target) }, operation: `curve.construct.${kind}`, parameters: {} });
    const changed = replaceCurveDocumentSource(parent, { ...parent.source, definition: { ...parent.source.definition, points: [[2,0,0],[2,0,0.5],[2,0,1]] } });
    const project = createMath3DProject({ ...original.workspace, entries: [{ module: "curve", checkpoint: changed, expected: changed.identity, replay: null },
      ...parents.slice(1).map(p => ({ module: "curve" as const, checkpoint: p, expected: p.identity, replay: null })),
      { module: "surface", checkpoint: target, expected: target.identity, replay: null }], activeDocumentIds: [changed.identity.id], relations: [relation] }, { stableKey: `construction-${kind}` });
    expect(projectDependencyRefreshOptions(project)[0]!.canRefresh).toBe(true);
    const next = refreshProjectDependency(project, relation.relationId), copy = next.workspace.entries.at(-1)!.checkpoint;
    expect(next.workspace.entries.slice(0, -1)).toEqual(project.workspace.entries);
    expect(next.workspace.relations[0]).toEqual(relation);
    expect(inspectProjectDependencies(next).relations.at(-1)!.freshness).toBe("current");
    if (copy.format !== "math3d.surface-document") throw new Error("Copy");
    expect(additionalRepresentationView(copy, { documents: new Map(next.workspace.entries.map(e => [e.expected.id, e.checkpoint])) }).meshes[0]!.positions.length).toBeGreaterThan(0);
    expect(projectDependencyRefreshOptions(next)[0]!.canRefresh).toBe(false);
    const history = new ProjectCommandAdapter(project); history.commit(next); expect(history.undo().workspace).toEqual(project.workspace); expect(history.redo().workspace).toEqual(next.workspace);
  });
  it("refreshes the existing Curve construction starter's operation aliases", () => {
    const original = instantiateMath3DProjectTemplate("curve-construction-study", "refresh-starter"), parent = original.workspace.entries[0]!.checkpoint;
    if (parent.format !== "math3d.curve-document") throw new Error("Curve");
    const changed = replaceCurveDocumentSource(parent, { ...parent.source, definition: { ...parent.source.definition, points: [[2,0,0],[2,0,1]] , pointCount: 2 } });
    const project = createMath3DProject({ ...original.workspace, entries: original.workspace.entries.map(e => e.expected.id === parent.identity.id ? { ...e, checkpoint: changed, expected: changed.identity } : e) }, { stableKey: "starter-change" });
    expect(projectDependencyRefreshOptions(project).filter(option => option.canRefresh)).toHaveLength(2);
  });
  it.each(["integral", "arc-length", "critical-points", "intersections"])("recomputes %s with recorded bounds and tolerance, retaining historical authority", kind => {
    const original = instantiateMath3DProjectTemplate("derivative-study", `analysis-${kind}`), graph = original.workspace.entries[0]!.checkpoint;
    if (graph.format !== "math3d.graph2d-document") throw new Error("Graph");
    const ast = parseGraph2DExpression("x", ["x"]); if (!ast.ok) throw new Error("AST");
    const source = { ...graph.source, objects: [...graph.source.objects, { ...graph.source.objects[0]!, id: "second", kind: "explicit-cartesian" as const,
      expression: { source: "x", variable: "x" as const, ast: ast.ast }, domain: { min: -3, max: 3, includeMin: true, includeMax: true } }] };
    const current = createGraph2DDocument({ source, identity: advanceDocumentIdentity(graph.identity, source), title: graph.metadata.title });
    const request = { document: current, objectId: current.source.objects[0]!.id, interval: { min: -2, max: 2 }, tolerance: 1e-5 };
    const result = kind === "integral" ? analyzeGraph2DIntegral({ ...request, mode: "signed" }).publication : kind === "arc-length" ? analyzeGraph2DArcLength(request).publication :
      kind === "critical-points" ? analyzeGraph2DCriticalPoints(request).publication : analyzeGraph2DIntersections({ document: current, firstObjectId: request.objectId, secondObjectId: "second", interval: request.interval }).publication;
    const editedSource = { ...current.source, variables: [...current.source.variables, { name: "a", value: 2 }] };
    const edited = createGraph2DDocument({ source: editedSource, identity: advanceDocumentIdentity(current.identity, editedSource), title: current.metadata.title });
    const project = createMath3DProject({ ...original.workspace, entries: [{ module: "graph2d", checkpoint: edited, expected: edited.identity, replay: null }], results: [result], relations: [], activeDocumentIds: [edited.identity.id] }, { stableKey: kind });
    expect(projectAnalysisRefreshOptions(project)[0]!.canRecompute).toBe(true);
    const next = recomputeProjectAnalysis(project, result.resultId);
    expect(next.workspace.results[0]).toEqual(result);
    expect(next.workspace.results.at(-1)!.provenance.numericContext.tolerance).toEqual(result.provenance.numericContext.tolerance);
    expect(inspectProjectDependencies(next).results.at(-1)!.sourceFreshness).toBe("current");
    expect(() => recomputeProjectAnalysis(next, result.resultId)).toThrow("already exists");
    const history = new ProjectCommandAdapter(project); history.commit(next); expect(history.undo().workspace).toEqual(project.workspace);
  });
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
