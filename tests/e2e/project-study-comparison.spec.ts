import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync, existsSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
const collection = JSON.parse(readFileSync(resolve("renderer/src/projects/examples/samsung-projects.json"), "utf8"));

test("PRJ42–44 inspect actual vertices, retain resolution/parameter studies, export comparison files and reopen exact snapshots", async () => {
  test.setTimeout(300_000); let ctx: LaunchedSurfaceApp | null = null;
  const directory = resolve("output/projects-integration/prj42-44"); mkdirSync(directory, { recursive: true });
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel"), workflow = page.getByTestId("project-saved-mesh-workflow");
    const item = collection.projects.find((item: any) => (item.project ?? item).metadata.title === "Catenoid"), project = item.project ?? item;
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "catenoid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(item)) });
    await panel.getByTestId("project-import-open").click();
    await panel.getByTestId(`project-open-analysis-${project.workspace.entries[0].expected.id}`).click();
    await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await workflow.getByTestId("project-analysis-run-study").click();
    const mediumId = await workflow.getByTestId("project-saved-mesh-choice").inputValue();
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("1089 vertices · 33 samples/axis");

    const canvas = workflow.getByTestId("project-study-viewport").locator("canvas"), inspection = workflow.getByTestId("project-vertex-inspection");
    await canvas.scrollIntoViewIfNeeded(); const bounds = (await canvas.boundingBox())!;
    const candidates = [.25,.4,.5,.6,.75].flatMap(x => [.25,.4,.5,.6,.75].map(y => ({ x: bounds.width * x, y: bounds.height * y })));
    for (const position of candidates) { await canvas.click({ position }); if (await inspection.count()) break; }
    await expect(inspection).toBeVisible(); await expect(inspection).toHaveAttribute("data-source-id", mediumId);
    await expect(inspection).toContainText("Coordinates:"); await expect(inspection).toContainText("Normal:");
    const pickedInspection = await inspection.getAttribute("data-vertex");
    await inspection.screenshot({ path: resolve(directory, "clicked-vertex-inspection.png") });
    await expect(workflow.getByTestId("project-path-selection")).toHaveAttribute("data-picked-start", "");
    await workflow.getByTestId("project-inspect-vertex").fill("0");
    await expect(inspection).toHaveAttribute("data-boundary", "true"); await expect(inspection).toContainText("Boundary vertex");
    await workflow.getByTestId("project-inspect-vertex").fill("544");
    await expect(inspection).toHaveAttribute("data-boundary", "false"); await expect(inspection).toHaveAttribute("data-valid", "true");
    await canvas.scrollIntoViewIfNeeded(); const dragBounds = (await canvas.boundingBox())!;
    await page.mouse.move(dragBounds.x + dragBounds.width / 2, dragBounds.y + dragBounds.height / 2); await page.mouse.down();
    await page.mouse.move(dragBounds.x + dragBounds.width / 2 + 35, dragBounds.y + dragBounds.height / 2, { steps: 4 }); await page.mouse.up();
    await expect(inspection).toHaveAttribute("data-vertex", "544");

    await workflow.getByTestId("project-analysis-resolution").selectOption("17"); await workflow.getByTestId("project-analysis-run-study").click();
    const coarseId = await workflow.getByTestId("project-saved-mesh-choice").inputValue();
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("289 vertices · 17 samples/axis");
    await expect(inspection).toHaveCount(0);
    await workflow.getByTestId("project-analysis-resolution").selectOption("65"); await workflow.getByTestId("project-analysis-run-study").click();
    const fineId = await workflow.getByTestId("project-saved-mesh-choice").inputValue();
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("4225 vertices · 65 samples/axis");
    await workflow.getByTestId("project-analysis-run-study").click();
    await expect(workflow.getByTestId("project-saved-mesh-choice").locator("option")).toHaveCount(3);
    let comparison = workflow.getByTestId("project-study-comparison");
    await comparison.locator("summary").click();
    await comparison.getByTestId("project-comparison-right").selectOption(coarseId);
    await comparison.getByTestId("project-comparison-field").selectOption("H");
    const fineLimit = await comparison.getByTestId("project-comparison-scale").getAttribute("data-limit");
    await expect(comparison.getByTestId("project-comparison-view-left")).toHaveAttribute("data-scale-limit", fineLimit!);
    await expect(comparison.getByTestId("project-comparison-view-right")).toHaveAttribute("data-scale-limit", fineLimit!);
    await comparison.getByTestId("project-comparison-right").selectOption(fineId);
    await expect(comparison.getByRole("alert")).toContainText("two different saved Mesh");
    await comparison.getByTestId("project-comparison-right").selectOption(coarseId);

    await page.getByTestId("project-surface-x").fill("1.25*cosh(v)*cos(u)");
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("Historical");
    await workflow.getByTestId("project-analysis-run-study").click();
    const changedId = await workflow.getByTestId("project-saved-mesh-choice").inputValue(); expect(changedId).not.toBe(fineId);
    await expect(workflow.getByTestId("project-saved-mesh-choice").locator("option")).toHaveCount(4);
    comparison = workflow.getByTestId("project-study-comparison"); await comparison.locator("summary").click();
    await comparison.getByTestId("project-comparison-right").selectOption(coarseId); await comparison.getByTestId("project-comparison-field").selectOption("H");
    await expect(comparison.getByTestId("project-comparison-view-right")).toContainText("historical");

    const stamp = Date.now();
    const paths = { json: resolve(directory, `comparison-${stamp}.json`), csv: resolve(directory, `comparison-${stamp}.csv`), png: resolve(directory, `comparison-${stamp}.png`) };
    const downloaded = (kind: keyof typeof paths) => {
      if (!existsSync(paths[kind])) return false;
      const bytes = readFileSync(paths[kind]);
      if (kind === "json") { try { return JSON.parse(bytes.toString()).format === "math3d.saved-study-comparison.v1"; } catch { return false; } }
      if (kind === "csv") return bytes.toString().split("\r\n").length === 4225 + 289 + 2;
      return bytes.length > 10_000 && bytes.readUInt32BE(bytes.length - 8) === 0x49454e44;
    };
    for (const kind of ["json", "csv", "png"] as const) {
      await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(target)), paths[kind]);
      await comparison.getByTestId(`project-comparison-export-${kind}`).click(); await expect.poll(() => downloaded(kind), { timeout: 60_000 }).toBe(true);
    }
    const measurements = JSON.parse(readFileSync(paths.json, "utf8"));
    expect(measurements.studies.map((study: any) => study.meshSource.documentId)).toEqual([changedId, coarseId]);
    expect(measurements.studies.map((study: any) => study.samplingSize)).toEqual([65, 17]);
    expect(measurements.studies[0].surfaceSource.revision).toBeGreaterThan(measurements.studies[1].surfaceSource.revision);
    expect(measurements.studies[0].vertices).toHaveLength(4225); expect(measurements.studies[1].vertices).toHaveLength(289);
    expect(measurements.studies[1].vertices[0].interior).toBe(false); expect(measurements.studies[1].vertices[144].interior).toBe(true);
    expect(measurements.studies[1].vertices[144].coordinates).toEqual([1, 0, 0]);
    const png = readFileSync(paths.png); expect(png.readUInt32BE(16)).toBe(1600); expect(png.readUInt32BE(20)).toBe(1060);
    for (const kind of ["json", "csv", "png"] as const) copyFileSync(paths[kind], resolve(directory, `comparison.${kind}`));
    const scale = await comparison.getByTestId("project-comparison-scale").textContent();

    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const packagePath = resolve(directory, `resolution-project-${Date.now()}.json`);
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(target)), packagePath);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return !!JSON.parse(readFileSync(packagePath, "utf8")); } catch { return false; } }).toBe(true);
    const packageBytes = readFileSync(packagePath); await closeSurfaceApp(ctx); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel"); await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "returned.json", mimeType: "application/json", buffer: packageBytes }); await panel.getByTestId("project-import-open").click();
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    panel = page.getByTestId("project-explorer-panel"); workflow = page.getByTestId("project-saved-mesh-workflow");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    await expect(panel).toBeHidden(); expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!))).toEqual(saved);
    await workflow.getByTestId("project-saved-mesh-choice").selectOption(changedId);
    comparison = workflow.getByTestId("project-study-comparison"); await comparison.locator("summary").click();
    await comparison.getByTestId("project-comparison-right").selectOption(coarseId); await comparison.getByTestId("project-comparison-field").selectOption("H");
    await expect(comparison.getByTestId("project-comparison-scale")).toHaveText(scale!);
    await expect(comparison.getByTestId("project-comparison-view-right")).toContainText("17 samples/axis");
    await page.setViewportSize({ width: 1440, height: 1000 }); await comparison.scrollIntoViewIfNeeded();
    await comparison.screenshot({ path: resolve(directory, "returned-comparison-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 }); await comparison.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const compactLeft = comparison.getByTestId("project-comparison-view-left").getByTestId("project-study-viewport");
    const compactRight = comparison.getByTestId("project-comparison-view-right").getByTestId("project-study-viewport");
    await compactLeft.scrollIntoViewIfNeeded(); await expect(compactLeft).toBeInViewport();
    await page.screenshot({ path: resolve(directory, "returned-comparison-compact-a.png") });
    await compactRight.scrollIntoViewIfNeeded(); await expect(compactRight).toBeInViewport();
    await page.screenshot({ path: resolve(directory, "returned-comparison-compact-b.png") });
    writeFileSync(resolve(directory, "acceptance.json"), JSON.stringify({ scope: "Desktop Electron actual point inspection and PNG/JSON/CSV downloads, independent resource import and cold restart", inspectedVertex: Number(pickedInspection), snapshots: { coarseId, mediumId, fineId, changedId }, comparison: measurements.studies.map((study: any) => ({ meshSource: study.meshSource, surfaceSource: study.surfaceSource, samplingSize: study.samplingSize, interior: study.interior })), sharedScale: measurements.sharedScale, exactProjectRetained: true, exactScaleRetained: true, pngDimensions: [1600, 1060], csvVertexRows: 4514, compactWidth: 390, noHorizontalOverflow: true }, null, 2));
  } finally { await closeSurfaceApp(ctx); }
});
