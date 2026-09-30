import { expect, test } from "@playwright/test";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const { getGraph2DPresetCatalog, instantiateGraph2DPreset } = require(resolve("packages/core/src/index.ts"));

test("G2D36 Electron saves all publication formats without changing its Graph checkpoint", async ({}, info) => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page; await resetSurfaceAppState(page); await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
    await page.getByLabel("Search graphs").fill("Two slopes"); await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
    const before = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
    await page.getByTestId("graph2d-export-open").click(); const dialog = page.getByTestId("graph2d-export");
    await dialog.getByLabel("Image size").selectOption("640x480"); await expect(dialog.getByRole("button", { name: "Export PNG", exact: true })).toBeEnabled();
    const snapshot = await dialog.locator("code").textContent();
    for (const format of ["svg", "png", "csv", "html"]) {
      const path = resolve(info.outputPath(`publication.${format}`));
      await app.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), path);
      await dialog.getByRole("button", { name: format === "html" ? "Export HTML report" : `Export ${format.toUpperCase()}`, exact: true }).click();
      await expect.poll(() => existsSync(path) && readFileSync(path).length > 0).toBe(true);
      if (format === "png") expect([...readFileSync(path).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      else expect(readFileSync(path, "utf8")).toContain(snapshot!);
    }
    await page.screenshot({ path: info.outputPath("export-dialog.png") });
    expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(before);
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(page.getByTestId("graph2d-export-open")).toBeFocused();
  } finally { await closeSurfaceApp(app); }
});

test("GGL14 presentation exits accessibly and capture recipe matches publication", async ({}, info) => {
  const app=await launchSurfaceApp();
  try {
    const page=app.page; await resetSurfaceAppState(page); await page.setViewportSize({width:1440,height:900});
    await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
    await page.getByLabel("Search graphs").fill("Two slopes"); await page.getByRole("button",{name:"Open Two slopes",exact:true}).click();
    await page.getByTestId("graph2d-presentation-open").click();
    await expect(page.getByTestId("graphs-workspace")).toHaveAttribute("data-presentation","true");
    await expect(page.getByTestId("graph2d-presentation-exit")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("graphs-workspace")).toHaveAttribute("data-presentation","false");
    await expect(page.getByTestId("graph2d-presentation-open")).toBeFocused();
    await page.getByTestId("graph2d-export-open").click();
    const dialog=page.getByTestId("graph2d-export");
    await expect(dialog.getByRole("button",{name:"Export capture recipe JSON"})).toBeEnabled();
    const path=resolve(info.outputPath("capture.json"));
    await app.app.evaluate(({session},path)=>session.defaultSession.once("will-download",(_event,item)=>item.setSavePath(path)),path);
    await dialog.getByRole("button",{name:"Export capture recipe JSON"}).click();
    await expect.poll(()=>existsSync(path)).toBe(true);
    const recipe=JSON.parse(readFileSync(path,"utf8"));
    expect(recipe.format).toBe("math3d.graph2d-capture-recipe");
    expect(recipe.snapshotId).toBe(await dialog.locator("code").textContent());
    expect(recipe.view.publicationTheme).toBe("light");
  } finally {await closeSurfaceApp(app);}
});

test("GGL15 local Graph viewer validates before making an editable copy",async()=>{
  const app=await launchSurfaceApp();
  try {
    const page=app.page; await resetSurfaceAppState(page); await page.setViewportSize({width:1440,height:900});
    await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
    const gallery=page.getByTestId("graph-gallery"); await gallery.getByRole("button",{name:"View local file"}).click();
    await gallery.getByTestId("graph-local-view-file").setInputFiles({name:"bad.json",mimeType:"application/json",buffer:Buffer.from("{}")});
    await expect(gallery.getByTestId("graph-local-view-message")).toContainText("failed");
    await expect(page.getByLabel("Empty graph scene")).toBeVisible();
    const document=instantiateGraph2DPreset(getGraph2DPresetCatalog().get("line-comparison"),"local-view-test").document;
    await gallery.getByTestId("graph-local-view-file").setInputFiles({name:"graph.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(document))});
    await expect(gallery.getByTestId("graph-local-view-result")).toBeVisible();
    await expect(page.getByLabel("Empty graph scene")).toBeVisible();
    await gallery.getByRole("button",{name:"Open an independent editable copy"}).click();
    await expect(gallery).not.toBeVisible();
    await expect(page.getByLabel("Graph functions")).toContainText("Unit slope");
  } finally {await closeSurfaceApp(app);}
});
