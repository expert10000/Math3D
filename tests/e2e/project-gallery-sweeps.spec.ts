import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
const collection = JSON.parse(readFileSync(resolve("renderer/src/projects/examples/samsung-projects.json"), "utf8"));
const directory = resolve("docs/evidence/projects-prj45-47-desktop-2026-10-05");

test("Projects opens in the workspace and shares filters and pending metadata with the right quick panel", async () => {
  test.setTimeout(180_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    mkdirSync(directory, { recursive: true }); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page; await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId("projects-toggle").click(); let panel = page.getByTestId("project-explorer-panel");
    await expect(panel).toHaveJSProperty("tagName", "SECTION"); await expect(page.getByTestId("project-gallery-host")).toContainText("Projects Gallery");
    const box = (await panel.boundingBox())!, host = (await page.getByTestId("project-gallery-host").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(host.x); expect(box.x + box.width).toBeLessThanOrEqual(host.x + host.width + 1);
    await panel.getByTestId("project-title").fill("Unsaved gallery draft");
    await panel.getByTestId("project-import-samsung-examples").click();
    await expect(panel.getByTestId("project-example-import-message")).toContainText("25", { timeout: 60_000 });
    await expect(panel.getByTestId("project-gallery-grid").locator("article")).toHaveCount(25);
    const helicoid = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries.find((entry: any) => entry.title === "Helicoid").id);
    await panel.screenshot({ path: resolve(directory, "projects-gallery-desktop.png") });
    await panel.getByTestId("project-library-search").fill("Helicoid");
    await expect(panel.getByTestId("project-gallery-grid").locator("article")).toHaveCount(2);
    await panel.getByTestId(`project-library-${helicoid}`).getByRole("button", { name: "Favorite Helicoid", exact: true }).click();
    await panel.getByRole("button", { name: "Favorites", exact: true }).click();
    await panel.getByTestId("project-gallery-layout-toggle").click(); panel = page.getByTestId("project-explorer-panel");
    await expect(panel).toHaveJSProperty("tagName", "ASIDE"); await expect(panel.getByTestId("project-title")).toHaveValue("Unsaved gallery draft");
    await expect(panel.getByTestId("project-library-search")).toHaveValue("Helicoid");
    await panel.screenshot({ path: resolve(directory, "projects-quick-panel.png") });
    await panel.getByTestId("project-gallery-layout-toggle").click(); panel = page.getByTestId("project-explorer-panel");
    await expect(panel).toHaveJSProperty("tagName", "SECTION"); await expect(panel.getByTestId("project-title")).toHaveValue("Unsaved gallery draft");
    await panel.getByTestId(`project-preview-${helicoid}`).click(); await expect(panel.getByTestId("project-view-mode")).toContainText("Saved project preview · Helicoid");
    await panel.getByTestId(`project-open-saved-${helicoid}`).click(); await expect(panel).toBeHidden();
    await page.getByTestId("projects-quick-toggle").click(); await expect(panel).toHaveJSProperty("tagName", "ASIDE");
    await panel.getByRole("button", { name: "Close project explorer" }).click();
    await page.getByTestId("projects-toggle").click(); await expect(panel).toHaveJSProperty("tagName", "SECTION");
    await panel.getByTestId("project-library-search").fill(""); await panel.getByRole("button", { name: "All projects", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await panel.getByTestId("project-gallery-grid").locator("article").first().scrollIntoViewIfNeeded();
    await expect(panel.getByTestId("project-gallery-grid").locator("article").first()).toBeInViewport();
    await page.screenshot({ path: resolve(directory, "projects-gallery-compact.png") });
    await page.keyboard.press("Escape"); await expect(panel).toBeHidden();
  } finally { await closeSurfaceApp(ctx); }
});

test("named Helicoid sweep, source return, comparison and retained chart survive resource transfer and cold restart", async () => {
  test.setTimeout(300_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    mkdirSync(directory, { recursive: true }); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel"), workflow = page.getByTestId("project-saved-mesh-workflow");
    await page.setViewportSize({ width: 1440, height: 1000 });
    const item = collection.projects.find((item: any) => (item.project ?? item).metadata.title === "Helicoid"), project = item.project ?? item;
    const sourceId = project.workspace.entries[0].expected.id;
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "helix.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(item)) });
    await panel.getByTestId("project-import-open").click(); await panel.getByTestId(`project-open-analysis-${sourceId}`).click();
    const originalZ = await page.getByTestId("project-surface-z").inputValue();
    await workflow.getByTestId("project-analysis-resolution").selectOption("17");
    await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await workflow.getByTestId("project-study-sweep-values").fill("1,1"); await workflow.getByTestId("project-study-sweep-run").click();
    await expect(workflow.getByRole("alert")).toContainText("distinct"); await expect(workflow.getByTestId("project-saved-mesh-choice")).toHaveCount(0);
    await workflow.getByTestId("project-study-sweep-values").fill("0.5,1,1.5"); await workflow.getByTestId("project-study-sweep-run").click();
    await expect(workflow.getByTestId("project-saved-mesh-message")).toContainText("3 named curvature studies", { timeout: 60_000 });
    await expect(page.getByTestId("project-surface-z")).toHaveValue(originalZ);
    const ids = await workflow.getByTestId("project-saved-mesh-choice").locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
    expect(ids).toHaveLength(3); await expect(workflow.getByTestId("project-study-sweep-table").locator("tbody tr")).toHaveCount(3);
    await workflow.getByTestId("project-saved-mesh-choice").selectOption(ids[0]);
    await workflow.getByTestId("project-study-name").fill("Helicoid pitch 0.5 · Coarse trial"); await workflow.getByTestId("project-study-name-save").click();
    await expect(workflow.getByTestId("project-study-sweep-table")).toContainText("Helicoid pitch 0.5 · Coarse trial");
    await workflow.getByTestId("project-study-sweep-chart").scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve(directory, "named-sweep-desktop.png") });
    await workflow.getByTestId("project-saved-mesh-open").click();
    await expect(page.getByTestId("project-mesh-editor")).toContainText("Helicoid pitch 0.5 · Coarse trial");
    await expect(workflow.getByTestId("project-study-source")).toContainText("resolution is set on the source Surface");
    await workflow.getByTestId("project-study-open-source").click();
    await expect(page.getByTestId("project-surface-z")).toHaveValue("0.5*u"); await expect(workflow.getByTestId("project-analysis-resolution")).toBeVisible();
    // Return to the original Surface to compare all sweep variants.
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId(`project-open-analysis-${sourceId}`).click();
    await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await workflow.getByTestId("project-analysis-resolution").selectOption("17");
    await workflow.getByTestId("project-study-sweep-run").click(); await expect(workflow.getByTestId("project-saved-mesh-message")).toContainText("3 named curvature studies");
    await expect(workflow.getByTestId("project-saved-mesh-choice").locator("option")).toHaveCount(3);
    const comparison = workflow.getByTestId("project-study-comparison"); await comparison.locator("summary").click();
    await comparison.getByTestId("project-comparison-left").selectOption(ids[0]); await comparison.getByTestId("project-comparison-right").selectOption(ids[1]);
    const reportPath = resolve(directory, `named-comparison-${Date.now()}.json`);
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, download) => download.setSavePath(target)), reportPath);
    await comparison.getByTestId("project-comparison-export-json").click();
    await expect.poll(() => { try { return JSON.parse(readFileSync(reportPath, "utf8")).format; } catch { return ""; } }).toBe("math3d.saved-study-comparison.v1");
    const report = JSON.parse(readFileSync(reportPath, "utf8")); expect(report.studies[0].title).toBe("Helicoid pitch 0.5 · Coarse trial"); expect(report.studies.map((run: any) => run.studyRun.value)).toEqual([.5, 1]);
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.results.filter((result: any) => result.provenance.operation.type === "mesh.saved.curvature")).toHaveLength(3);
    const packagePath = resolve(directory, `sweep-project-${Date.now()}.json`);
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download", (_event, download) => download.setSavePath(target)), packagePath);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return !!JSON.parse(readFileSync(packagePath, "utf8")); } catch { return false; } }).toBe(true);
    const bytes = readFileSync(packagePath); await closeSurfaceApp(ctx); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel"); workflow = page.getByTestId("project-saved-mesh-workflow");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-import-file").setInputFiles({ name: "sweep-return.json", mimeType: "application/json", buffer: bytes }); await panel.getByTestId("project-import-open").click();
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    panel = page.getByTestId("project-explorer-panel"); workflow = page.getByTestId("project-saved-mesh-workflow");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId(`project-open-analysis-${sourceId}`).click();
    await expect(workflow.getByTestId("project-study-sweep-table").locator("tbody tr")).toHaveCount(3);
    await expect(workflow.getByTestId("project-study-sweep-table")).toContainText("Helicoid pitch 0.5 · Coarse trial");
    await expect(workflow.getByTestId("project-saved-mesh-choice").locator("option")).toHaveCount(3);
    await page.setViewportSize({ width: 390, height: 844 }); await workflow.getByTestId("project-study-sweep-chart").scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: resolve(directory, "returned-sweep-compact.png") });
    writeFileSync(resolve(directory, "acceptance.json"), JSON.stringify({ galleryCount: 25, sweepValues: [.5, 1, 1.5], samplingSize: 17, meshIds: ids, unchangedOriginalZ: originalZ, namedReport: report.studies.map((study: any) => ({ title: study.title, meshSource: study.meshSource, studyRun: study.studyRun })), resourceTransfer: true, independentLibrary: true, coldRestart: true, compactWidth: 390 }, null, 2));
  } finally { await closeSurfaceApp(ctx); }
});

test("Catenoid waist sweep retains Fine snapshots and qualified K/H summaries without replacing the open source", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel"), workflow = page.getByTestId("project-saved-mesh-workflow");
    const item = collection.projects.find((item: any) => (item.project ?? item).metadata.title === "Catenoid"), project = item.project ?? item;
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-import-file").setInputFiles({ name: "waist.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(item)) });
    await panel.getByTestId("project-import-open").click(); await panel.getByTestId(`project-open-analysis-${project.workspace.entries[0].expected.id}`).click();
    const originalX = await page.getByTestId("project-surface-x").inputValue();
    await workflow.getByTestId("project-analysis-resolution").selectOption("65"); await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await expect(workflow.getByTestId("project-surface-study-preset")).toHaveValue("catenoid");
    await workflow.getByTestId("project-study-sweep-values").fill("0.8,1.2"); await workflow.getByTestId("project-study-sweep-run").click();
    await expect(workflow.getByTestId("project-saved-mesh-message")).toContainText("2 named curvature studies", { timeout: 60_000 });
    await expect(page.getByTestId("project-surface-x")).toHaveValue(originalX); await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("4225 vertices");
    await workflow.getByTestId("project-study-sweep-metric").selectOption("averageK");
    await expect(workflow.getByTestId("project-study-sweep-chart")).toHaveAttribute("aria-label", "Average Gaussian K by waist radius");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const runs = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.relations.filter((relation: any) => relation.operation === "surface.tessellate-saved").map((relation: any) => relation.parameters.studyRun));
    expect(runs.map((run: any) => run.value)).toEqual([.8, 1.2]); expect(runs.every((run: any) => run.resolution === 65 && run.interior.count === 3969 && run.interior.excluded === 256 && run.interior.averageK < 0)).toBe(true);
  } finally { await closeSurfaceApp(ctx); }
});
