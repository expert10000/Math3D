import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const openWorkbook = async (page: Page) => {
  await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
  const back = page.getByTestId("project-source-back-to-module"); if (await back.isVisible()) await back.click();
  await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
};
const bookState = (page: Page) => page.evaluate(() => {
  const id = localStorage.getItem("math3d.workbooks.active.v1"); return JSON.parse(localStorage.getItem("math3d.workbooks.v1")!).find((book: any) => book.id === id);
});
const download = async (ctx: LaunchedSurfaceApp, action: () => Promise<unknown>, name: string) => {
  const file = test.info().outputPath(name);
  await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(target)), file);
  await action(); await expect.poll(() => { try { return readFileSync(file).length > 0; } catch { return false; } }).toBe(true);
  return { file, text: readFileSync(file, "utf8") };
};

test("Gallery evidence Workbook publishes a frozen report that opens in a fresh browser and desktop profile", async ({ browser }) => {
  test.setTimeout(300_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); let page = ctx.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId("projects-toggle").click(); let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-edge-path-evidence").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project workspace");
    const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await projects.getByTestId(`project-open-workbook-${initial.workbooks[0].id}`).click();
    await openWorkbook(page); await page.getByTestId("workbook-view-document").click();
    const result = page.getByTestId("workbook-document-block-edge-path-evidence-result");
    await expect(result).toContainText("current");
    await expect(page.getByTestId("workbook-evidence-claim")).toContainText("supported");
    await page.getByTestId("notes-toggle").click();
    await expect(page.getByTestId("project-notes-panel")).toContainText("Measured evidence");
    await expect(page.getByTestId("project-notes-panel")).not.toContainText("{{value:measured}}");
    await page.getByTestId("notes-toggle").click();
    const figure = (await bookState(page)).stages[2].blocks[0];
    await page.getByTestId(`workbook-document-block-${figure.id}`).getByRole("button", { name: "Edit block" }).click();
    await page.getByRole("button", { name: "Capture A", exact: true }).click();
    await expect.poll(async () => (await bookState(page)).stages[2].blocks[0].visualize.snapshotA?.provenance?.projectId).toBe(initial.identity.id);
    await expect.poll(async () => (await bookState(page)).stages[2].blocks[0].visualize.snapshotA?.thumbnail ?? "").toMatch(/^data:image/);
    await page.getByTestId("workbook-view-document").click();
    const snapshots = page.getByTestId("workbook-snapshot-record"); await snapshots.getByText("Snapshot A · frozen capture").click();
    await expect(snapshots).toContainText("Captured Note: Measured evidence");
    const publication = page.getByTestId("workbook-publication"); await publication.locator("summary").click();
    await publication.getByLabel("Problem statement", { exact: true }).uncheck();
    const markdown = await download(ctx, () => publication.getByRole("button", { name: "Export selected Markdown", exact: true }).click(), "selected.md");
    expect(markdown.text).toContain("Linked-source manifest"); expect(markdown.text).not.toContain('"title": "Problem statement"');
    const report = await download(ctx, () => publication.getByRole("button", { name: "Export portable report", exact: true }).click(), "portable.html");
    const fresh = await browser.newContext();
    try {
      let network = 0; await fresh.route(/^https?:/, route => { network++; return route.abort(); });
      const viewer = await fresh.newPage(); await viewer.goto(pathToFileURL(report.file).href);
      await expect(viewer.locator("#publication-status")).toContainText("bytes verified");
      expect(network).toBe(0);
      const [file] = await Promise.all([viewer.waitForEvent("download"), viewer.locator("#publication-project").click()]);
      const target = test.info().outputPath("embedded-project.json"); await file.saveAs(target);
      const bundle = JSON.parse(readFileSync(target, "utf8")); expect(bundle.format).toBe("math3d.project-package"); expect(bundle.project.identity.id).toBe(initial.identity.id);
      await closeSurfaceApp(ctx); ctx = await launchSurfaceApp(); page = ctx.page;
      await page.getByTestId("projects-toggle").click(); projects = page.getByTestId("project-explorer-panel");
      await projects.getByTestId("project-import-file").setInputFiles(target); await projects.getByTestId("project-import-open").click();
      await projects.getByTestId(`project-open-workbook-${bundle.project.workbooks[0].id}`).click();
      await openWorkbook(page); await page.getByTestId("workbook-view-document").click();
      await expect(page.getByTestId("workbook-evidence-claim")).toContainText("supported");
      expect((await bookState(page)).stages[2].blocks[0].visualize.snapshotA.provenance.projectId).toBe(initial.identity.id);
    } finally { await fresh.close(); }
  } finally { await closeSurfaceApp(ctx); }
});

test("NOTE05 reruns a saved Mesh analysis after editing, then explicitly relinks only its result cell", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); const page = ctx.page;
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel"); await projects.getByTestId("project-template-open-edge-path-evidence").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project workspace");
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await projects.getByTestId(`project-open-workbook-${project.workbooks[0].id}`).click(); await openWorkbook(page); await page.getByTestId("workbook-view-document").click();
    const before = await bookState(page), previous = before.stages[1].blocks[0].notebookReference;
    await page.getByTestId("workbook-document-block-edge-path-evidence-result").getByRole("button", { name: "Open source document" }).click();
    await page.getByTestId("project-mesh-scale").fill("2"); await page.getByTestId("project-mesh-apply").click();
    await openWorkbook(page); await page.getByTestId("workbook-view-document").click();
    const cell = page.getByTestId("workbook-document-block-edge-path-evidence-result");
    await expect(cell).toContainText("stale"); await cell.getByRole("button", { name: "Rerun stale analysis", exact: true }).click();
    await expect(cell).toContainText("New result published"); expect((await bookState(page)).stages[1].blocks[0].notebookReference).toEqual(previous);
    await cell.getByTestId("workbook-analysis-relink").click();
    await expect(cell).toContainText("current"); const after = await bookState(page);
    expect(after.stages[1].blocks[0].notebookReference.targetId).not.toBe(previous.targetId);
    expect(after.stages[3].blocks[1].claim.evidence[0].reference).toEqual(before.stages[3].blocks[1].claim.evidence[0].reference);
    await expect(page.getByTestId("workbook-evidence-claim")).toContainText("stale");
  } finally { await closeSurfaceApp(ctx); }
});
