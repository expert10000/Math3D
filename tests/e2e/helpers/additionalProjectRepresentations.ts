import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
const { buildSync } = require(resolve("renderer/node_modules/esbuild"));
const filename=resolve("tests/fixtures/unified-projects/additionalRepresentations.ts");
const {outputFiles}=buildSync({entryPoints:[filename],bundle:true,platform:"node",format:"cjs",write:false,alias:{"@math3d/core":resolve("packages/core/src/index.ts")}});
const Module=require("node:module").Module,compiled=new Module(filename);compiled._compile(outputFiles[0].text,filename);
const { PNG } = require("pngjs");
export const additionalRepresentationFixture:()=>{docs:any[];project:any}=compiled.exports.additionalRepresentationFixture;

export const expectAdditionalPreview = async (page: Page) => {
  const editor = page.getByTestId("project-source-editor");
  await expect(page.getByTestId("main-viewer")).toHaveCount(0);
  const canvas = editor.getByTestId("surface-viewer-canvas-host").locator("canvas");
  await expect(canvas).toBeVisible();
  const handle = await canvas.elementHandle();
  // The previous Curve viewer repeatedly replaced its canvas and exhausted the
  // context quota after opening a saved source. Observe more than one rebuild.
  await page.waitForTimeout(1500);
  expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await canvas.evaluate((node: HTMLCanvasElement) => node.getContext("webgl2")?.isContextLost())).toBe(false);
  const png = PNG.sync.read(await canvas.screenshot());
  let colored = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b, a] = png.data.subarray(i, i + 4);
    if (a > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 35 && Math.min(r, g, b) < 220) colored++;
  }
  expect(colored, "Saved source geometry must be drawn in the canvas").toBeGreaterThan(40);
  await handle!.dispose();
};

export const exerciseAdditionalEditors=async(page:Page,fixture:ReturnType<typeof additionalRepresentationFixture>)=>{
  const panel=page.getByTestId("project-explorer-panel"),editor=page.getByTestId("project-source-editor");
  const show=async()=>{if(!await panel.isVisible())await page.getByTestId("projects-toggle").click();};
  await show();await panel.getByTestId("project-import-file").setInputFiles({name:"representations.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(fixture.project))});
  await expect(panel.getByTestId("project-import-open")).toBeEnabled();await panel.getByTestId("project-import-open").click();
  await panel.getByTestId("project-save").click();await expect(panel.getByTestId("project-message")).toContainText("Saved");
  expect((await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.project.v1")!))).workspace.entries.map((entry:any)=>entry.expected)).toEqual(fixture.docs.map((d)=>d.identity));
  const parent = fixture.docs.find((document) => document.metadata?.title === "Construction parent");
  await panel.getByTestId(`project-open-${parent.identity.id}`).click();
  if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click();
  const curveCanvas = page.getByTestId("curve-viewer-canvas").locator("canvas");
  await expect(curveCanvas).toBeVisible();
  const curveHandle = await curveCanvas.elementHandle();
  await page.waitForTimeout(1500);
  expect(await curveHandle!.evaluate((node) => node.isConnected), "Curve camera updates must retain the renderer").toBe(true);
  expect(await curveCanvas.evaluate((node: HTMLCanvasElement) => node.getContext("webgl2")?.isContextLost())).toBe(false);
  await curveHandle!.dispose();
  const titles=["Saved polyline","Saved nurbs","Saved implicit Surface","Saved nurbsSurface","Saved revolution","Saved scene constructions"];
  const selected=[...titles.map((title)=>fixture.docs.find((d)=>d.metadata?.title===title)),fixture.docs.find((d)=>d.source?.kind==="simplicial-complex")];
  for(const document of selected){
    await show();await panel.getByTestId(`project-open-${document.identity.id}`).click();if(await panel.isVisible())await page.getByRole("button",{name:"Close project explorer"}).click();
    await expect(editor).toHaveAttribute("data-document-id",document.identity.id);await expect(editor.getByTestId("project-source-measurement")).toContainText("bounds");
    await expectAdditionalPreview(page);
    await editor.locator("summary").click();const source=JSON.parse(await editor.getByTestId("project-source-definition").inputValue());expect(source).toEqual(document.source);
    const changed=JSON.parse(JSON.stringify(source));
    if(document.format==="math3d.topology-document")changed.model.vertexIds.push("extra");
    else if(document.format==="math3d.geometry-document")changed.geometry.points[1].x=6;
    else if(document.source.representation==="polyline")changed.definition.points[0][0]=4;
    else if(document.source.representation==="nurbs")changed.definition.controlPoints[0][0]=-1;
    else if(document.source.representation==="implicit")changed.definition.expressions.formula="x*x+y*y+z*z-0.25";
    else if(document.source.representation==="spline"){const settings=JSON.parse(changed.definition.settings.splineSettings),grid=JSON.parse(settings.nurbsControlGridText);grid[0][0][2]=0.5;settings.nurbsControlGridText=JSON.stringify(grid);changed.definition.settings.splineSettings=JSON.stringify(settings);}
    else changed.parameters.angle=1;
    await editor.getByTestId("project-source-definition").fill(JSON.stringify(changed));await editor.getByTestId("project-source-apply").click();await expect(editor.getByRole("alert")).toHaveCount(0);
    await editor.getByTestId("project-source-undo").click();expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(source);
    await editor.getByTestId("project-source-definition").fill(JSON.stringify({...changed,invalid:true}));await editor.getByTestId("project-source-apply").click();await expect(editor.getByRole("alert")).toBeVisible();await expect(editor.getByTestId("project-source-redo")).toBeEnabled();
    await editor.getByTestId("project-source-redo").click();expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(changed);
  }
  await show();await panel.getByTestId("project-save").click();await expect(panel.getByTestId("project-message")).toContainText("Saved");
  return {selected,saved:await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.project.v1")!))};
};

export const checkReopenedAdditionalHistory=async(page:Page,document:any)=>{
  const panel=page.getByTestId("project-explorer-panel");if(!await panel.isVisible())await page.getByTestId("projects-toggle").click();
  await panel.getByTestId(`project-open-${document.identity.id}`).click();if(await panel.isVisible())await page.getByRole("button",{name:"Close project explorer"}).click();
  const editor=page.getByTestId("project-source-editor");await expect(editor.getByTestId("project-source-undo")).toBeEnabled();
  await editor.locator("summary").click();await editor.getByTestId("project-source-undo").click();expect(JSON.parse(await editor.getByTestId("project-source-definition").inputValue())).toEqual(document.source);await editor.getByTestId("project-source-redo").click();
};
