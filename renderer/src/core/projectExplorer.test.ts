import { describe, expect, it } from "vitest";
import { buildProjectExplorer, createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject,
  createMixedWorkspaceDocument, instantiateGraph2DPreset, getGraph2DPresetCatalog, promoteGraph2DToCurve,
  analyzeGraph2DDerivative, PROJECT_EXPLORER_MODULES, type MixedWorkspaceEntry } from "@math3d/core";

describe("PRJ02 read-only project explorer", () => {
  it("groups multiple documents without conflating analysis with source documents", () => {
    const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("parabola-tangent")!, "explorer").document;
    const empty = createEmptyGraph2DDocument("second-graph", "Second graph");
    const curve = promoteGraph2DToCurve(graph, graph.source.objects[0]!.id);
    const result = analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0]!.id, x: 1, order: 1 }).publication;
    const workspace = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(graph),
      entries: [...createGraph2DWorkspaceProject(graph).entries, { module: "graph2d", checkpoint: empty, expected: empty.identity, replay: null },
        { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null }], results: [result], relations: [curve.relation] });
    const project = createMath3DProject(workspace, { stableKey: "explorer" }), before = JSON.stringify(project);
    const explorer = buildProjectExplorer(project);
    expect(explorer.groups.map((group) => group.module)).toEqual(PROJECT_EXPLORER_MODULES);
    expect(explorer.groups[0]!.documents.map((document) => document.id)).toEqual([graph.identity.id, empty.identity.id]);
    expect(explorer.groups.find((group) => group.module === "curve")!.documents[0]!.id).toBe(curve.document.identity.id);
    expect(explorer.groups.reduce((count, group) => count + group.documents.length, 0)).toBe(3);
    expect(explorer.analysis).toEqual([{ id: result.resultId, title: result.provenance.operation.type, authority: result.status,
      sourceDocumentId: graph.identity.id, sourceRevision: graph.identity.revision }]);
    expect(JSON.stringify(project)).toBe(before);
  });
  it("requires the expected resolved identity when a document has a replay log", () => {
    const document = createEmptyGraph2DDocument("replayed");
    const entry: MixedWorkspaceEntry = { ...createGraph2DWorkspaceProject(document).entries[0]!, replay: { format: "test.only", payload: {} } };
    const workspace = createMixedWorkspaceDocument({ ...createGraph2DWorkspaceProject(document), entries: [entry] });
    const project = createMath3DProject(workspace, { stableKey: "replay-required" });
    expect(() => buildProjectExplorer(project)).toThrow(/verified replay/);
    const unrelated = createEmptyGraph2DDocument("unrelated");
    expect(() => buildProjectExplorer(project, new Map([[document.identity.id, unrelated]]))).toThrow(/verified replay/);
    expect(buildProjectExplorer(project, new Map([[document.identity.id, document]])).groups[0]!.documents[0]!.id).toBe(document.identity.id);
  });
});
