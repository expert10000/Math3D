import { expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
const core = require(resolve("packages/core/src/index.ts"));

const show = async (page: Page) => {
  const panel = page.getByTestId("project-explorer-panel");
  if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  return panel;
};
const select = async (page: Page, id: string) => { await (await show(page)).getByTestId(`project-open-${id}`).click(); };
const expression = (page: Page) => page.getByLabel("Graph functions").locator(".graph2d-function-summary code").first();
const edit = async (page: Page, source: string) => {
  const functions = page.getByLabel("Graph functions");
  await functions.getByRole("button", { name: /^Edit / }).first().click();
  await functions.getByLabel("Function expression").fill(source);
  await functions.getByRole("button", { name: "Save function", exact: true }).click();
};
const history = async (page: Page, key: string) => {
  await page.getByTestId("graphs-workspace").getByTestId("main-viewer").focus();
  await page.keyboard.press(key);
};
export async function exerciseMultipleGraphs(page: Page) {
  const a = core.instantiateMath3DProjectTemplate("derivative-study", "multi-a").workspace.entries[0].checkpoint;
  const b = core.instantiateMath3DProjectTemplate("derivative-study", "multi-b").workspace.entries[0].checkpoint;
  const project = core.createMath3DProject(core.createMixedWorkspaceDocument({ ...core.createGraph2DWorkspaceProject(a),
    entries: [a, b].map(document => ({ module: "graph2d", checkpoint: document, expected: document.identity, replay: null })) }), { stableKey: "multiple-graphs-ui", title: "Two independent Graphs" });
  const panel = await show(page);
  await panel.getByTestId("project-import-file").setInputFiles({ name: "multiple.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
  await select(page, a.identity.id); await edit(page, "x*x+2");
  await select(page, b.identity.id); await expect(expression(page)).toContainText("x^2"); await edit(page, "3*x");
  await history(page, "Control+z"); await expect(expression(page)).toContainText("x^2");
  await select(page, a.identity.id); await expect(expression(page)).toContainText("x*x+2");
  await (await show(page)).getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
  expect(saved.workspace.entries.map((entry: any) => entry.expected.id)).toEqual([a.identity.id, b.identity.id]);
  expect(saved.workspace.entries.every((entry: any) => entry.replay.format === "math3d.graph2d-replay.v1")).toBe(true);
  return saved;
}
export async function checkMultipleGraphHistory(page: Page, saved: any) {
  const panel = await show(page);
  await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click();
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
  await select(page, saved.workspace.entries[1].expected.id); await expect(expression(page)).toContainText("x^2");
  await history(page, "Control+y"); await expect(expression(page)).toContainText("3*x");
  await select(page, saved.workspace.entries[0].expected.id); await expect(expression(page)).toContainText("x*x+2");
  await history(page, "Control+z"); await expect(expression(page)).toContainText("x^2");
}
export async function exerciseDependencyRefresh(page: Page) {
  const original = core.instantiateMath3DProjectTemplate("catenary-study", "refresh-ui");
  const graph = original.workspace.entries[0].checkpoint;
  const parsed = core.parseGraph2DExpression("x*x+1", ["x"]);
  const source = { ...graph.source, objects: graph.source.objects.map((object: any) => ({ ...object, expression: { ...object.expression, source: "x*x+1", ast: parsed.ast } })) };
  const edited = core.createGraph2DDocument({ source, identity: core.advanceDocumentIdentity(graph.identity, source), title: graph.metadata.title, display: graph.display, selection: graph.selection });
  const project = core.replaceMath3DProjectWorkspace(original, core.createMixedWorkspaceDocument({ ...original.workspace,
    entries: original.workspace.entries.map((entry: any) => entry.module === "graph2d" ? { ...entry, checkpoint: edited, expected: edited.identity } : entry) }));
  const panel = await show(page);
  await panel.getByTestId("project-import-file").setInputFiles({ name: "stale.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
  await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
  await panel.getByTestId("project-manage").click(); await panel.getByTestId("project-inspect-relations").click();
  const relations = project.workspace.relations.filter((relation: any) => relation.target.type === "document");
  for (const relation of relations) { await panel.getByTestId(`project-refresh-${relation.relationId}`).click(); await expect(panel.getByTestId("project-message")).toContainText("Refreshed companion created"); }
  await expect(panel.getByTestId("project-group-curve")).toContainText("Curve (2)"); await expect(panel.getByTestId("project-group-surface")).toContainText("Surface (2)");
  await panel.getByTestId("project-undo").click(); await expect(panel.getByTestId("project-group-surface")).toContainText("Surface (1)");
  await panel.getByTestId("project-redo").click(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  await panel.getByTestId(`project-recompute-${project.workspace.results[0].resultId}`).click();
  await expect(panel.getByTestId("project-message")).toContainText("Historical analysis retained");
  await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  const saved = await page.evaluate(id => JSON.parse(localStorage.getItem("math3d.project.v1.payload." + id)!), project.identity.id);
  expect(saved.workspace.entries.slice(0, 3)).toEqual(project.workspace.entries);
  expect(saved.workspace.results.slice(0, -1)).toEqual(project.workspace.results); expect(saved.workspace.entries).toHaveLength(5);
  expect(saved.workspace.results.at(-1).provenance.source.revision).toBe(edited.identity.revision);
  expect(saved.workspace.results.at(-1).status).toBe("numerical");
  await page.reload(); await show(page); await panel.getByTestId(`project-preview-${project.identity.id}`).click();
  await expect(panel.getByTestId("project-group-surface")).toContainText("Surface (2)");
  return saved;
}

export async function exerciseExtendedRefresh(page: Page) {
  const starter = core.instantiateMath3DProjectTemplate("curve-construction-study", "extended-refresh-ui");
  const curve = starter.workspace.entries[0].checkpoint;
  const changed = core.replaceCurveDocumentSource(curve, { ...curve.source, definition: { ...curve.source.definition, points: [[2,0,0],[2,0,1]], pointCount: 2 } });
  const project = core.replaceMath3DProjectWorkspace(starter, core.createMixedWorkspaceDocument({ ...starter.workspace,
    entries: starter.workspace.entries.map((entry: any) => entry.expected.id === curve.identity.id ? { ...entry, checkpoint: changed, expected: changed.identity } : entry) }));
  const panel = await show(page);
  await panel.getByTestId("project-import-file").setInputFiles({ name: "construction.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
  await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
  await panel.getByTestId("project-manage").click(); await panel.getByTestId("project-inspect-relations").click();
  await panel.getByTestId(`project-refresh-${project.workspace.relations[0].relationId}`).click();
  await expect(panel.getByTestId("project-group-surface")).toContainText("Surface (4)");
  await panel.getByTestId("project-undo").click(); await expect(panel.getByTestId("project-group-surface")).toContainText("Surface (3)");
  await panel.getByTestId("project-redo").click(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  const saved = await page.evaluate(id => JSON.parse(localStorage.getItem("math3d.project.v1.payload." + id)!), project.identity.id);
  expect(saved.workspace.entries.slice(0,-1)).toEqual(project.workspace.entries);
  expect(saved.workspace.relations.slice(0,-1)).toEqual(project.workspace.relations);
  expect(saved.workspace.entries.at(-1).checkpoint.source.parameters.sourceGenerations[0].revision).toBe(changed.identity.revision);
  const derivative = core.instantiateMath3DProjectTemplate("derivative-study", "extended-analysis-ui"), graph = derivative.workspace.entries[0].checkpoint;
  const historical = core.analyzeGraph2DIntegral({ document: graph, objectId: graph.source.objects[0].id, interval: { min: -2, max: 2 }, mode: "absolute", tolerance: 1e-5 }).publication;
  const source = { ...graph.source, variables: [{ name: "a", value: 2 }] };
  const edited = core.createGraph2DDocument({ source, identity: core.advanceDocumentIdentity(graph.identity, source), title: graph.metadata.title });
  const analysisProject = core.createMath3DProject(core.createMixedWorkspaceDocument({ ...derivative.workspace, entries: [{ module: "graph2d", checkpoint: edited, expected: edited.identity, replay: null }],
    results: [historical], relations: [], activeDocumentIds: [edited.identity.id] }), { stableKey: "extended-analysis-ui" });
  await panel.getByTestId("project-import-file").setInputFiles({ name: "integral.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(analysisProject)) });
  await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
  await panel.getByTestId("project-manage").click(); await panel.getByTestId("project-inspect-relations").click();
  await panel.getByRole("button", { name: "Recompute integral", exact: true }).click();
  await expect(panel.getByTestId("project-message")).toContainText("Analysis recomputed");
  await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved");
  await page.reload(); await show(page); await panel.getByTestId(`project-preview-${analysisProject.identity.id}`).click();
  await expect(panel.getByTestId("project-group-analysis")).toContainText("Analysis (2)");
  const records = await page.evaluate(id => JSON.parse(localStorage.getItem("math3d.project.v1.payload." + id)!).workspace.results, analysisProject.identity.id);
  expect(records[0]).toEqual(historical); expect(records[1].provenance.source.revision).toBe(edited.identity.revision);
  expect(records[1].provenance.numericContext.tolerance.absolute).toBe(1e-5);
}
