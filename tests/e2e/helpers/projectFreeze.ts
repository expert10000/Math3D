import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
const filename = resolve("tests/fixtures/unified-projects/projectFreeze.ts");
const { outputFiles } = require(resolve("renderer/node_modules/esbuild")).buildSync({ entryPoints: [filename], bundle: true, platform: "node", format: "cjs", write: false,
  alias: { "@math3d/core": resolve("packages/core/src/index.ts"), "@math3d/kernel": resolve("packages/kernel/src/index.ts") } });
const Module = require("node:module").Module, compiled = new Module(filename); compiled._compile(outputFiles[0].text, filename);
export const projectFreezeFixture: () => { project: any; raw: string; docs: any[]; mobile: any; targets: Record<string, string> } = compiled.exports.projectFreezeFixture;
export const inspectFreezePackage: (raw: string) => { project: any; docs: any[]; resources: any[]; meshes: any[]; volumes: any[] } = compiled.exports.inspectFreezePackage;

export const checkFreezeResources = (raw: string) => {
  const snapshot = inspectFreezePackage(raw);
  expect(snapshot.meshes[0].positions).toEqual([3,0,0,4,0,0,3,1,0]);
  expect(snapshot.meshes[0].normals).toEqual([0,0,1,0,0,1,0,0,1]);
  expect(snapshot.meshes[0].uvs).toEqual([0,0,1,0,0,1]);
  expect(snapshot.meshes[1].positions).toEqual([10,0,0,11,0,0,10,1,0]);
  expect(snapshot.volumes.map((volume) => volume.values)).toEqual([[1,2,3,4,5,6,7,8],[11,12,13,14,15,16,17,18]]);
  expect(snapshot.volumes[0].origin).toEqual([20,30,40]);
};

export const freezeControls = (page: Page) => {
  const panel = page.getByTestId("project-explorer-panel");
  const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
  const hide = async () => { if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click(); };
  const open = async (id: string) => { await show(); await panel.getByTestId(`project-open-${id}`).click(); await hide(); };
  const importOpen = async (raw: string) => { await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "freeze.resources.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click(); await expect(panel.getByTestId("project-message")).toContainText("Opened supported project"); };
  const save = async () => { await show(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved"); return page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)); };
  const reopen = async (projectId: string) => { await show(); await panel.getByTestId(`project-preview-${projectId}`).click(); await panel.getByTestId("project-restore-saved").click();
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click(); await expect(panel.getByTestId("project-message")).toContainText("Opened supported project"); };
  return { panel, show, hide, open, importOpen, save, reopen };
};

export const editFreezeProject = async (page: Page, fixture: ReturnType<typeof projectFreezeFixture>) => {
  const controls = freezeControls(page), editor = page.getByTestId("project-source-editor");
  await controls.importOpen(fixture.raw);
  expect((await controls.save()).workspace.entries.map((entry: any) => entry.expected)).toEqual(fixture.project.workspace.entries.map((entry: any) => entry.expected));
  // Navigate every saved document in one container before editing any source.
  for (const document of fixture.docs) { await controls.open(document.identity.id); await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", document.identity.id); }
  for (const module of ["curve", "surface", "geometry", "topology"]) {
    await controls.open(fixture.targets[module]!); await expect(editor).toHaveAttribute("data-document-id", fixture.targets[module]!);
    await editor.getByTestId("project-source-json").locator("summary").click(); const source = JSON.parse(await editor.getByTestId("project-source-definition").inputValue()), changed = structuredClone(source);
    if (module === "curve") changed.definition.weights[1] = 3;
    if (module === "surface") changed.definition.expressions.formula = "x*x+y*y+z*z-0.25";
    if (module === "geometry") changed.geometry.points[1].x = 6;
    if (module === "topology") changed.model.vertexIds.push("freeze-isolated");
    await editor.getByTestId("project-source-definition").fill(JSON.stringify(changed)); await editor.getByTestId("project-source-apply").click(); await expect(editor.getByRole("alert")).toHaveCount(0);
    await editor.getByTestId("project-source-undo").click(); expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(source);
    await editor.getByTestId("project-source-redo").click(); expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(changed);
  }
  await controls.open(fixture.targets.mesh!); await page.getByTestId("project-mesh-translate-0").fill("1"); await page.getByTestId("project-mesh-apply").click();
  await page.getByTestId("project-mesh-undo").click(); await page.getByTestId("project-mesh-redo").click();
  await controls.open(fixture.targets.volume!); await page.getByTestId("project-volume-editor").locator("summary").click();
  const spatial = JSON.parse(await page.getByTestId("project-volume-spatial").inputValue()); spatial.origin = [20,30,40];
  await page.getByTestId("project-volume-spatial").fill(JSON.stringify(spatial)); await page.getByTestId("project-volume-apply").click();
  await page.getByTestId("project-volume-undo").click(); await page.getByTestId("project-volume-redo").click();
  await controls.open(fixture.targets.complex!); await page.getByTestId("project-complex-function").fill("z*z");
  await expect(page.getByTestId("project-scientific-undo")).toBeEnabled();
  await page.getByTestId("project-scientific-undo").click(); await expect(page.getByTestId("project-complex-function")).toHaveValue("1/z");
  await page.getByTestId("project-scientific-redo").click(); await expect(page.getByTestId("project-complex-function")).toHaveValue("z*z");
  const saved = await controls.save();
  expect(saved.workspace.entries).toHaveLength(fixture.docs.length);
  expect(saved.workspace.results).toEqual(expect.arrayContaining(fixture.project.workspace.results));
  expect(saved.workspace.relations).toEqual(expect.arrayContaining(fixture.project.workspace.relations));
  await controls.panel.getByTestId("project-inspect-relations").click();
  await expect(controls.panel.getByTestId("project-result-status-prj15-historical")).toContainText("stale");
  await expect(controls.panel.getByTestId("project-result-status-prj16-historical")).toContainText("stale");
  return saved;
};

export const checkFreezeHistory = async (page: Page, fixture: ReturnType<typeof projectFreezeFixture>) => {
  const controls = freezeControls(page);
  for (const key of ["curve", "surface", "geometry", "topology"]) {
    await controls.open(fixture.targets[key]!);
    const editor = page.getByTestId("project-source-editor");
    await editor.getByTestId("project-source-json").locator("summary").click();
    await expect(editor.getByTestId("project-source-undo")).toBeEnabled();
    await editor.getByTestId("project-source-undo").click();
    const original = fixture.docs.find((document) => document.identity.id === fixture.targets[key]).source;
    expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(original);
    await editor.getByTestId("project-source-redo").click();
  }
  await controls.open(fixture.targets.mesh!); await expect(page.getByTestId("project-mesh-undo")).toBeEnabled();
  await page.getByTestId("project-mesh-undo").click(); await page.getByTestId("project-mesh-redo").click();
  await controls.open(fixture.targets.volume!); await expect(page.getByTestId("project-volume-undo")).toBeEnabled();
  await page.getByTestId("project-volume-undo").click(); await page.getByTestId("project-volume-redo").click();
  await controls.open(fixture.targets.complex!); await page.getByTestId("project-scientific-undo").click();
  await expect(page.getByTestId("project-complex-function")).toHaveValue("1/z");
  await page.getByTestId("project-scientific-redo").click(); await expect(page.getByTestId("project-complex-function")).toHaveValue("z*z");
};
