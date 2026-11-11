import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("selected Surface ridge publishes Mesh error and Workbook evidence across restart and source change", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.getByTestId("projects-toggle").click();
    let panel = page.getByTestId("project-explorer-panel");
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenoid-evidence").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    const ridge = panel.getByTestId("project-surface-ridge-publication");
    await expect(ridge).toBeVisible();
    await ridge.locator("[data-testid^='project-publish-ridge-']").first().click();
    await expect(ridge.getByTestId("project-surface-ridge-evidence")).toContainText("absolute error", { timeout: 60_000 });
    await expect(ridge.getByTestId("project-surface-ridge-status")).toContainText("Workbook staged");
    await panel.getByTestId("project-save").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const comparison = saved.workspace.results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "surface.revolution-ridge-comparison");
    expect(comparison).toBeTruthy();
    const numbers = comparison.summary;
    expect(numbers.absoluteDifference).toBeCloseTo(
      Math.abs(numbers.discreteGaussian - numbers.analyticGaussian), 10);
    expect(numbers.analyticGaussian).toBeCloseTo(-1, 2);
    expect(numbers.spatialOffset).toBeGreaterThanOrEqual(0);
    expect(saved.workbooks.some((book: { title: string }) => book.title ===
      "Surface ridge and discrete curvature comparison")).toBe(true);
    expect(saved.workspace.entries.some((entry: { module: string; checkpoint: { source?: { definition?: { familyId?: string } } } }) =>
      entry.module === "curve" && entry.checkpoint.source?.definition?.familyId ===
      "surface.sampled-revolution-ridge-v1")).toBe(true);
    const profile = app.profileDir;
    await app.app.close(); app = await launchSurfaceApp({}, profile); page = app.page;
    await openLastSavedProject(page);
    panel = page.getByTestId("project-explorer-panel");
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel.getByTestId("project-surface-ridge-evidence")).toContainText("spatial offset");
    const core = require(resolve("packages/core/src/index.ts"));
    const current = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const surface = current.workspace.entries.find((entry: { module: string }) => entry.module === "surface");
    const revised = core.replaceSurfaceDocumentSource(surface.checkpoint, {
      ...surface.checkpoint.source, parameters: { ...surface.checkpoint.source.parameters, revised: 1 },
    });
    const workspace = core.createMixedWorkspaceDocument({ ...current.workspace,
      entries: current.workspace.entries.map((entry: { expected: { id: string } }) =>
        entry.expected.id === surface.expected.id ? { ...entry, checkpoint: revised,
          expected: revised.identity, replay: null } : entry) });
    const changed = core.replaceMath3DProjectWorkspace(current, workspace);
    await page.evaluate(({ id, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
    }, { id: current.identity.id, raw: core.serializeMath3DProject(changed) });
    await app.app.close(); app = await launchSurfaceApp({}, profile); page = app.page;
    await openLastSavedProject(page);
    panel = page.getByTestId("project-explorer-panel");
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel.getByTestId("project-surface-ridge-withheld")).toContainText("changed");
  } finally { await closeSurfaceApp(app); }
});
