import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { advanceDocumentIdentity, applyGraph2DAuthoring, createGraph2DDocument,
  createMixedWorkspaceDocument, findProjectProfileSelection, Graph2DPointTableStore,
  linkProjectFieldProfileGraph, matchesScientificSourceGeneration, parseMath3DProject,
  projectOpenInActions, projectOpenInReturn, replaceMath3DProjectWorkspace,
  serializeMath3DProject, structuralHash, viewerSourceFromDocument,
  type Graph2DProjectProfileOrigin } from "@math3d/core";

const fixture = () => {
  const base = parseMath3DProject(readFileSync(new URL("../fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url), "utf8"));
  const field = base.workspace.entries.find(item => item.module === "vector3d")!;
  const graphEntry = base.workspace.entries.find(item => item.module === "graph2d")!;
  if (graphEntry.checkpoint.format !== "math3d.graph2d-document") throw new Error("Expected Graph fixture.");
  const profile = base.workspace.derivedFields!.at(-1)!;
  const selection = findProjectProfileSelection(base, profile.identity.id)!;
  if (selection.identity.kind !== "authored") throw new Error("Expected authored line.");
  const rows = [{ id: "row_1", x: -1, y: 1 }, { id: "row_2", x: 1, y: 2 }];
  const origin: Graph2DProjectProfileOrigin = { kind: "project-derived-profile/v1",
    projectId: base.identity.id, profileId: profile.identity.id,
    source: viewerSourceFromDocument(field.checkpoint),
    recipe: base.workspace.derivedFields!.map(item => ({ documentId: item.identity.id,
      revision: item.identity.revision, structuralHash: item.identity.structuralHash })),
    selection: { id: selection.identity.id, structuralHash: structuralHash(selection) },
    cacheKey: structuralHash("profile-cache"), rowsSha256: structuralHash(rows),
    method: "analytic-expression", axis: { name: "x", unit: "m", min: -1, max: 1 }, unit: "m/s" };
  const table = new Graph2DPointTableStore().publish(rows);
  const scene = applyGraph2DAuthoring(graphEntry.checkpoint, { type: "create-point-series", draft: {
    label: "Field line", table, mode: "line", domain: { min: -1, max: 1, includeMin: true, includeMax: true },
    projectProfileOrigin: origin,
    style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } });
  const graph = createGraph2DDocument({ ...scene, stableKey: "open-in-field-graph",
    identity: advanceDocumentIdentity(graphEntry.checkpoint.identity, scene.source),
    title: graphEntry.checkpoint.metadata.title });
  const project = replaceMath3DProjectWorkspace(base, createMixedWorkspaceDocument({ ...base.workspace,
    entries: base.workspace.entries.map(entry => entry.expected.id === graphEntry.expected.id ?
      { ...entry, checkpoint: graph, expected: graph.identity } : entry) }));
  return { project, fieldId: field.expected.id, graphId: graph.identity.id };
};

describe("Project Field profile Open in Graphs", () => {
  it("qualifies only a saved exact row and records return without recomputing values", () => {
    const { project, fieldId, graphId } = fixture();
    expect(projectOpenInActions(project, fieldId)).toMatchObject([{ enabled: false,
      disabledReason: expect.stringContaining("navigation") }]);
    const action = projectOpenInActions(project, fieldId,
      { fieldGraph: { available: true, reason: null } })[0]!;
    expect(action).toMatchObject({ id: "vector3d.open-profile-graph", enabled: true,
      targetDocumentId: graphId });
    const linked = linkProjectFieldProfileGraph(project, action);
    expect(linked.existing).toBe(false);
    expect(linked.project.workspace.relations.at(-1)).toMatchObject({ operation: "vector3d.open-profile-graph" });
    expect(linkProjectFieldProfileGraph(linked.project, action).existing).toBe(true);
    const reopened = parseMath3DProject(serializeMath3DProject(linked.project));
    expect(projectOpenInReturn(reopened, graphId)).toMatchObject({ sourceDocumentId: fieldId,
      sourceModule: "vector3d", exact: true });
    expect(matchesScientificSourceGeneration(action.source,
      viewerSourceFromDocument(reopened.workspace.entries.find(item => item.expected.id === fieldId)!.checkpoint))).toBe(true);
  });

  it("refuses a forged or stale source choice before changing Project", () => {
    const { project, fieldId } = fixture();
    const action = projectOpenInActions(project, fieldId,
      { fieldGraph: { available: true, reason: null } })[0]!;
    const before = serializeMath3DProject(project);
    expect(() => linkProjectFieldProfileGraph(project, { ...action,
      source: { ...action.source, generation: action.source.generation + 1 } })).toThrow(/changed/);
    expect(() => linkProjectFieldProfileGraph(project, { ...action, sourceObjectId: "wrong" })).toThrow(/qualified/);
    expect(serializeMath3DProject(project)).toBe(before);
  });
});
