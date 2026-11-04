import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { advanceDocumentIdentity, applyGraph2DAuthoring, createGraph2DDocument,
  createMixedWorkspaceDocument, createProjectProfileGraphOrigin,
  deriveFieldOutput, findProjectProfileSelection, Graph2DPointTableStore, parseGraph2DDocument,
  parseMath3DProject, projectProfileGraphRows, projectProfileGraphStatus,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeGraph2DDocument, serializeMath3DProject, structuralHash, vectorFieldDerivedShape,
  vectorField3DExpression, type Math3DProject } from "@math3d/core";
import { createDerivedFieldProfileJob, Graph2DCommandAdapter } from "@math3d/kernel";

const fixture = new URL("../../../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d", import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));
const verify = (source: import("@math3d/core").VectorField3DDocument) =>
  source.source.field.kind === "expressions";
const sourceChange = (project: Math3DProject) => replaceMath3DProjectWorkspace(project,
  createMixedWorkspaceDocument({ ...project.workspace, entries: project.workspace.entries.map(entry => {
    if (entry.module !== "vector3d" || entry.checkpoint.format !== "math3d.vector-field3d-document") return entry;
    const field = entry.checkpoint.source.field;
    if (field.kind !== "expressions") throw new TypeError("Wrong fixture.");
    const changed = reviseVectorField3DDocument(entry.checkpoint, { ...entry.checkpoint.source,
      field: { ...field, components: [vectorField3DExpression("2*x", "m/s"),
        field.components[1], field.components[2]] } });
    return { ...entry, checkpoint: changed, expected: changed.identity };
  }) }));
const reverifyRecipe = (project: Math3DProject) => {
  const source = project.workspace.entries.find(item => item.module === "vector3d")!.checkpoint;
  if (source.format !== "math3d.vector-field3d-document") throw new TypeError("Wrong fixture.");
  let input: import("@math3d/core").DerivedFieldInput = { kind: "vector3d",
    documentId: source.identity.id, revision: source.identity.revision,
    structuralHash: source.identity.structuralHash, shape: vectorFieldDerivedShape(source) };
  const derivedFields = project.workspace.derivedFields!.map(previous => {
    const output = deriveFieldOutput(input.shape, previous.operation);
    const current = { ...previous, input, output,
      identity: advanceDocumentIdentity(previous.identity, { input, operation: previous.operation, output }) };
    input = { kind: "derived", documentId: current.identity.id,
      revision: current.identity.revision, structuralHash: current.identity.structuralHash,
      shape: current.output };
    return current;
  });
  return replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
    ...project.workspace, derivedFields }));
};

describe("GF-07 saved Graph profile handoff", () => {
  it("round-trips exact source, recipe and selection references and withholds stale rows", async () => {
    let project = load();
    const profileId = project.workspace.derivedFields![2]!.identity.id;
    const selection = findProjectProfileSelection(project, profileId);
    expect(selection?.identity.kind).toBe("authored");
    expect(selection?.geometry).toMatchObject({ kind: "axis-line", varyingAxis: 0,
      fixedCoordinates: [null, 2, 3] });
    const job = createDerivedFieldProfileJob({ project: () => project, verifySource: verify });
    const result = (await job.submit(profileId).promise).result!;
    const origin = createProjectProfileGraphOrigin(project, profileId, result, verify);
    expect(origin).toMatchObject({ projectId: project.identity.id, profileId,
      source: result.source, selection: { id: (selection!.identity as { id: string }).id,
        structuralHash: structuralHash(selection) }, cacheKey: result.cacheKey,
      axis: { name: "x", unit: "m", min: -2, max: 2 }, unit: "m/s" });
    expect(origin.recipe.map(item => item.documentId)).toEqual(project.workspace.derivedFields!.map(item => item.identity.id));
    const graph = project.workspace.entries.find(item => item.module === "graph2d")!.checkpoint;
    if (graph.format !== "math3d.graph2d-document") throw new TypeError("Wrong fixture.");
    const tables = new Graph2DPointTableStore(), rows = projectProfileGraphRows(result);
    const scene = applyGraph2DAuthoring(graph, { type: "create-point-series", draft: {
      label: "Magnitude profile", table: tables.publish(rows), mode: "line",
      domain: { min: -2, max: 2, includeMin: true, includeMax: true },
      projectProfileOrigin: origin,
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true },
    } });
    const savedGraph = createGraph2DDocument({ ...scene, stableKey: "gf07",
      identity: advanceDocumentIdentity(graph.identity, scene.source), title: graph.metadata.title });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(entry =>
        entry.module === "graph2d" ? { ...entry, checkpoint: savedGraph,
          expected: savedGraph.identity } : entry),
    }));
    project = parseMath3DProject(serializeMath3DProject(project));
    const reopenedEntry = project.workspace.entries.find(item => item.module === "graph2d")!;
    const reopenedGraph = reopenedEntry.checkpoint.format === "math3d.graph2d-document" ?
      parseGraph2DDocument(serializeGraph2DDocument(reopenedEntry.checkpoint)) : null;
    if (!reopenedGraph) throw new TypeError("Graph row was not saved in Project.");
    const linked = reopenedGraph.source.objects.find(item => item.kind === "point-series" &&
      item.projectProfileOrigin?.profileId === profileId);
    if (!linked || linked.kind !== "point-series" || !linked.projectProfileOrigin) throw new Error("Missing saved row.");
    expect(tables.resolve(linked.table)).toEqual(rows);
    expect(projectProfileGraphStatus(project, linked.projectProfileOrigin, verify))
      .toEqual({ status: "current", reason: null });
    expect(projectProfileGraphStatus(project, linked.projectProfileOrigin, () => false))
      .toEqual({ status: "withheld", reason: "source-unverified" });
    expect(projectProfileGraphStatus(null, linked.projectProfileOrigin, verify))
      .toEqual({ status: "withheld", reason: "project-missing" });
    expect(projectProfileGraphStatus({ ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.filter(entry => entry.module !== "vector3d") } },
    linked.projectProfileOrigin, verify)).toEqual({ status: "withheld", reason: "source-missing" });
    project = sourceChange(project);
    expect(projectProfileGraphStatus(project, linked.projectProfileOrigin, verify))
      .toEqual({ status: "withheld", reason: "source-changed" });
    project = reverifyRecipe(project);
    const refreshedResult = (await job.submit(profileId).promise).result!;
    const refreshedOrigin = createProjectProfileGraphOrigin(project, profileId, refreshedResult, verify);
    const refreshedTable = tables.publish(projectProfileGraphRows(refreshedResult));
    expect(refreshedTable.id).not.toBe(linked.table.id);
    const adapter = new Graph2DCommandAdapter(reopenedGraph);
    const display = adapter.document().display.objects.find(item => item.objectId === linked.id)!;
    const edited = applyGraph2DAuthoring(adapter.document(), { type: "edit-point-series",
      objectId: linked.id, draft: { label: linked.label, table: refreshedTable,
        mode: linked.mode, domain: linked.domain, projectProfileOrigin: refreshedOrigin,
        style: { color: display.color, lineWidth: display.lineWidth,
          lineStyle: display.lineStyle, visible: display.visible } } });
    adapter.commitScene(edited, "edit-point-series");
    expect((adapter.document().source.objects.find(item => item.id === linked.id) as typeof linked)
      .projectProfileOrigin?.source.revision).toBe(refreshedResult.source.revision);
    expect((adapter.undo()?.source.objects.find(item => item.id === linked.id) as typeof linked)
      .table.id).toBe(linked.table.id);
    expect((adapter.redo()?.source.objects.find(item => item.id === linked.id) as typeof linked)
      .table.id).toBe(refreshedTable.id);
    expect(projectProfileGraphStatus(project, refreshedOrigin, verify))
      .toEqual({ status: "current", reason: null });
    job.dispose();
  });
});
