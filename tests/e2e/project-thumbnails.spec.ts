import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const collection = JSON.parse(readFileSync(resolve("renderer/src/projects/examples/samsung-projects.json"), "utf8"));
const directory = resolve("docs/evidence/projects-prj48-desktop-2026-10-05");
const openExample = async (page: Page, title: string) => {
  const item = collection.projects.find((item: any) => (item.project ?? item).metadata.title === title), project = item.project ?? item;
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles({ name: `${title}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(item)) });
  await panel.getByTestId("project-import-open").click();
  await panel.getByTestId(`project-open-${project.workspace.entries[0].expected.id}`).click();
  await expect(panel).toBeHidden();
  return project;
};
const readSaved = (page: Page, id?: string) => page.evaluate(id => {
  const active = JSON.parse(localStorage.getItem("math3d.project.v1")!);
  const library = JSON.parse(localStorage.getItem("math3d.project-library.v1")!);
  const entry = library.entries.find((entry: any) => entry.id === (id ?? active.identity.id));
  return { project: JSON.parse(localStorage.getItem(`math3d.project.v1.payload.${entry.id}`)!), entry,
    image: localStorage.getItem(entry.thumbnailKey), marker: localStorage.getItem(`${entry.thumbnailKey}.automatic`) };
}, id);
const saveView = async (page: Page) => {
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-save").click();
  await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
  await expect(panel.getByTestId("project-thumbnail-message")).toContainText("Current view saved");
  return readSaved(page);
};

test("PRJ48 captures real Surface previews, updates camera views, retains uploads and survives capture failure and cold restart", async () => {
  test.setTimeout(240_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    mkdirSync(directory, { recursive: true }); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page; await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 1000)); await page.setViewportSize({ width: 1440, height: 1000 });
    const original = await openExample(page, "Helicoid"), sourceId = original.workspace.entries[0].expected.id;
    const canvas = page.getByTestId("module-workspace").locator("canvas").first(); await expect(canvas).toBeVisible();
    await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(64);
    let saved = await saveView(page), panel = page.getByTestId("project-explorer-panel");
    expect(saved.image).toMatch(/^data:image\/jpeg;base64,/); expect(saved.marker).toMatch(/^sha256:/);
    expect(saved.project.workspace.entries.find((entry: any) => entry.expected.id === sourceId).expected).toEqual(original.workspace.entries[0].expected);
    expect(JSON.stringify(saved.project)).not.toContain("data:image");
    const raster = await ctx.app.evaluate(({ nativeImage }, data) => {
      const image = nativeImage.createFromDataURL(data), pixels = image.toBitmap(), colors = new Set<string>();
      for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      return { ...image.getSize(), colors: colors.size };
    }, saved.image);
    expect(raster.width).toBeLessThanOrEqual(320); expect(raster.height).toBeLessThanOrEqual(200); expect(raster.colors).toBeGreaterThan(100);
    const card = panel.getByTestId(`project-library-${saved.project.identity.id}`);
    await expect(card.getByAltText("Project thumbnail")).toBeVisible();
    await expect.poll(() => card.getByAltText("Project thumbnail").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(raster.width);
    writeFileSync(resolve(directory, "surface-preview.jpg"), Buffer.from(saved.image.split(",")[1], "base64"));
    await panel.screenshot({ path: resolve(directory, "gallery-surface-thumbnail.png") });
    await panel.getByRole("button", { name: "Close project explorer" }).click();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .65, box.y + box.height * .58, { steps: 10 }); await page.mouse.up();
    const before = saved; saved = await saveView(page);
    expect(saved.image).not.toBe(before.image);
    expect(saved.project.workspace.entries.find((entry: any) => entry.expected.id === sourceId).expected).toEqual(original.workspace.entries[0].expected);
    const uploaded = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
      const context = canvas.getContext("2d")!; context.fillStyle = "#e53935"; context.fillRect(0, 0, 32, 32); return canvas.toDataURL("image/png"); });
    await panel.getByTestId("project-thumbnail").setInputFiles({ name: "custom.png", mimeType: "image/png", buffer: Buffer.from(uploaded.split(",")[1], "base64") });
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-thumbnail-message")).toContainText("Uploaded preview saved");
    expect((await readSaved(page)).image).toBe(uploaded); expect((await readSaved(page)).marker).toBe("manual");
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-save")).toBeEnabled();
    expect((await readSaved(page)).image).toBe(uploaded);
    await panel.getByTestId("project-thumbnail-current-view").click(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-thumbnail-message")).toContainText("Current view saved"); saved = await readSaved(page);
    expect(saved.image).not.toBe(uploaded); expect(saved.marker).toMatch(/^sha256:/);
    for (const rect of [{ x: -1, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100_000, height: 100 }, { x: 0, y: 0, width: 1, height: 1 }]) {
      expect(await page.evaluate(rect => (window as any).appCapture.captureProjectThumbnail(rect), rect)).toMatchObject({ ok: false });
    }
    await ctx.app.evaluate(({ ipcMain }) => { ipcMain.removeHandler("app:capture-project-thumbnail"); ipcMain.handle("app:capture-project-thumbnail", () => ({ ok: false, error: "Injected capture failure" })); });
    await panel.getByTestId("project-title").fill("Helicoid with retained preview"); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-thumbnail-message")).toContainText("Injected capture failure");
    expect((await readSaved(page)).image).toBe(saved.image); expect((await readSaved(page)).project.metadata.title).toBe("Helicoid with retained preview");
    await expect(panel).not.toHaveAttribute("data-capturing-thumbnail", "true");
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await page.getByTestId("projects-toggle").click(); panel = page.getByTestId("project-explorer-panel");
    expect((await readSaved(page, saved.project.identity.id)).image).toBe(saved.image);
    await expect(panel.getByTestId(`project-library-${saved.project.identity.id}`).getByAltText("Project thumbnail")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 }); await expect.poll(() => panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: resolve(directory, "gallery-thumbnail-compact.png") });
    writeFileSync(resolve(directory, "acceptance.json"), JSON.stringify({ sourceId, raster, cameraChangesPreview: true, scientificGenerationPreserved: true, manualOverridePreserved: true, captureFailurePreservedImageAndSavedProject: true, rejectedInvalidRects: true, coldRestart: true, compactWidth: 390 }, null, 2));
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ48 captures the Graph SVG and preserves a different saved project's image during metadata management", async () => {
  test.setTimeout(180_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    mkdirSync(directory, { recursive: true }); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); const page = ctx.page;
    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 1000)); await page.setViewportSize({ width: 1440, height: 1000 }); await openExample(page, "Helicoid"); const surface = await saveView(page);
    await page.getByTestId("project-explorer-panel").getByRole("button", { name: "Close project explorer" }).click();
    const graph = await openExample(page, "Beating waves"); await expect(page.getByTestId("graph2d-plot")).toBeVisible();
    let saved = await saveView(page); const panel = page.getByTestId("project-explorer-panel");
    expect(saved.project.identity.id).toBe(graph.identity.id); expect(saved.image).not.toBe(surface.image);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-thumbnail-message")).toContainText("Current view saved");
    await expect(panel.getByTestId("project-save")).toBeEnabled(); saved = await readSaved(page);
    writeFileSync(resolve(directory, "graph-preview.jpg"), Buffer.from(saved.image.split(",")[1], "base64"));
    await panel.evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: resolve(directory, "gallery-surface-and-graph.png") });
    await ctx.app.evaluate(({ ipcMain }) => { (globalThis as any).__thumbnailCalls = 0; ipcMain.removeHandler("app:capture-project-thumbnail"); ipcMain.handle("app:capture-project-thumbnail", () => { (globalThis as any).__thumbnailCalls++; return { ok: false, error: "Must not capture for saved metadata" }; }); });
    await panel.getByTestId("project-thumbnail-auto").uncheck(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-save")).toBeEnabled();
    expect((await readSaved(page)).image).toBe(saved.image); expect(await ctx.app.evaluate(() => (globalThis as any).__thumbnailCalls)).toBe(0);
    await panel.getByTestId(`project-preview-${surface.project.identity.id}`).click(); await panel.getByTestId("project-manage").click();
    await expect(panel.getByTestId("project-thumbnail-current-view")).toBeDisabled();
    await panel.getByTestId("project-title").fill("Helicoid metadata only"); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Helicoid metadata only”");
    expect((await readSaved(page, surface.project.identity.id)).image).toBe(surface.image);
    expect((await readSaved(page)).project.identity.id).toBe(saved.project.identity.id);
    expect(await ctx.app.evaluate(() => (globalThis as any).__thumbnailCalls)).toBe(0);
    writeFileSync(resolve(directory, "graph-acceptance.json"), JSON.stringify({ graphId: graph.identity.id, surfaceId: surface.project.identity.id, quickPanelCapture: true, automaticDisabledRetainsImage: true, savedCopyRetainsOwnImageAndActiveProject: true, savedCopyCaptureCalls: 0 }, null, 2));
  } finally { await closeSurfaceApp(ctx); }
});
