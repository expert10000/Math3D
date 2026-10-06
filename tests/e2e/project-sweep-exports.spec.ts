import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const collection = JSON.parse(readFileSync(resolve("renderer/src/projects/examples/samsung-projects.json"), "utf8"));

for (const preset of ["Helicoid", "Catenoid"] as const) test(`PRJ49 exports complete ${preset} sweeps as qualified PNG JSON and CSV`, async () => {
  test.setTimeout(300_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel"), workflow = page.getByTestId("project-saved-mesh-workflow");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const item = collection.projects.find((item: any) => (item.project ?? item).metadata.title === preset), project = item.project ?? item;
    const sourceId = project.workspace.entries[0].expected.id;
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: `${preset}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(item)) });
    await panel.getByTestId("project-import-open").click(); await panel.getByTestId(`project-open-analysis-${sourceId}`).click();
    await workflow.getByTestId("project-analysis-resolution").selectOption(preset === "Helicoid" ? "17" : "65");
    await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await workflow.getByTestId("project-study-sweep-values").fill(preset === "Helicoid" ? "0.5,1,1.5" : "0.8,1.2");
    await workflow.getByTestId("project-study-sweep-run").click();
    const count = preset === "Helicoid" ? 3 : 2;
    await expect(workflow.getByTestId("project-saved-mesh-message")).toContainText(`${count} named curvature studies`, { timeout: 60_000 });
    const name = `=${preset}, "named run"`;
    await workflow.getByTestId("project-study-name").fill(name); await workflow.getByTestId("project-study-name-save").click();
    await workflow.getByTestId("project-study-sweep-metric").selectOption("averageK");
    // Original-source edits preserve historical sweep values and their exact generations.
    if (preset === "Helicoid") await page.getByTestId("project-surface-z").fill("2*u");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    await panel.getByRole("button", { name: "Close project explorer" }).click();

    const exportFile = async (kind: "json" | "csv" | "png", suffix = "") => {
      const file = test.info().outputPath(`${preset}${suffix}.${kind}`);
      await ctx!.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, download) => download.setSavePath(target)), file);
      await workflow.getByTestId(`project-study-sweep-export-${kind}`).click();
      await expect.poll(() => {
        try {
          const bytes = readFileSync(file);
          if (kind === "json") return JSON.parse(bytes.toString()).format === "math3d.saved-study-sweep.v1";
          if (kind === "csv") return bytes.toString().includes("qualification") && bytes.toString().endsWith("\r\n");
          return bytes.length > 10_000 && bytes.readUInt32BE(bytes.length - 8) === 0x49454e44;
        } catch { return false; }
      }, { timeout: 60_000 }).toBe(true);
      return file;
    };
    const json = await exportFile("json"), report = JSON.parse(readFileSync(json, "utf8"));
    expect(report.runs).toHaveLength(count); expect(report.runs.some((run: any) => run.title === name)).toBe(true);
    expect(report.baseSource.documentId).toBe(sourceId); expect(report.chart.metric).toBe("averageK");
    expect(report.runs.every((run: any) => run.current === (preset === "Catenoid"))).toBe(true);
    expect(report.runs.every((run: any) => run.savedResult.status === "numerical" && run.interior.averageK < 0 && run.meshSource.structuralHash === run.savedResult.provenance.source.structuralHash)).toBe(true);
    expect(report.runs.every((run: any) => run.interior.count === (preset === "Helicoid" ? 225 : 3969) && run.interior.excluded === (preset === "Helicoid" ? 64 : 256))).toBe(true);
    const csv = readFileSync(await exportFile("csv"), "utf8");
    expect(csv).toContain(`"'=${preset}, ""named run"""`); expect(csv.split("\r\n")).toHaveLength(count + 2);
    // A failed raster encoding reports the problem and permits a later successful export.
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback) { HTMLCanvasElement.prototype.toBlob = original; callback(null); };
    });
    await workflow.getByTestId("project-study-sweep-export-png").click();
    await expect(workflow.getByRole("alert")).toContainText("PNG encoding failed");
    const png = readFileSync(await exportFile("png")); expect(png.readUInt32BE(16)).toBe(1600);
    expect(png.readUInt32BE(20)).toBe(840 + count * 250);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved);
    await workflow.getByTestId("project-study-sweep-chart").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("sweep-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await workflow.getByTestId("project-study-sweep-export-csv").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("sweep-compact.png") });

    if (preset === "Helicoid") {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByTestId("projects-toggle").click();
      const packageFile = test.info().outputPath("sweep.math3d.project-package.json");
      await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, download) => download.setSavePath(target)), packageFile);
      await panel.getByTestId("project-export-resources").click();
      await expect.poll(() => { try { return !!JSON.parse(readFileSync(packageFile, "utf8")); } catch { return false; } }).toBe(true);
      const bytes = readFileSync(packageFile); await closeSurfaceApp(ctx); ctx = null;
      ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); page = ctx.page; panel = page.getByTestId("project-explorer-panel");
      await page.getByTestId("projects-toggle").click();
      await panel.getByTestId("project-import-file").setInputFiles({ name: "sweep-return.json", mimeType: "application/json", buffer: bytes });
      await panel.getByTestId("project-import-open").click();
      const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile);
      page = ctx.page; panel = page.getByTestId("project-explorer-panel"); workflow = page.getByTestId("project-saved-mesh-workflow");
      await page.getByTestId("projects-toggle").click(); await panel.getByTestId(`project-open-saved-${JSON.parse(saved).identity.id}`).click();
      await page.getByTestId("projects-toggle").click(); await panel.getByTestId(`project-open-analysis-${sourceId}`).click();
      await workflow.getByTestId("project-study-sweep-metric").selectOption("averageK");
      const reopened = JSON.parse(readFileSync(await exportFile("json", "-reopened"), "utf8"));
      expect(reopened).toEqual(report);
    }
  } finally { await closeSurfaceApp(ctx); }
});
