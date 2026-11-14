import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("selected Surface ridge publishes Mesh error and Workbook evidence across restart, transfer and source change", async () => {
  test.setTimeout(240_000);
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
    if (await panel.getAttribute("data-project-placement"))
      await panel.getByTestId("project-gallery-layout-toggle").click();
    if (await panel.locator(".project-gallery-layout-detail").count())
      await panel.getByTestId("project-detail-toggle").click();
    const packagePath = test.info().outputPath("surface-ridge-transfer.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), packagePath);
    await panel.getByTestId("project-export-resources").click();
    await expect(panel.getByTestId("project-message")).toContainText("Exported project with verified");
    await expect.poll(() => existsSync(packagePath)).toBe(true);
    const packageRaw = readFileSync(packagePath, "utf8"), packageData = JSON.parse(packageRaw);
    expect(packageData.resources.some((item: { kind: string }) => item.kind === "mesh-buffers")).toBe(true);
    expect(packageData.project.workspace.results.some((item: { resultId: string }) =>
      item.resultId === comparison.resultId)).toBe(true);
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
    await closeSurfaceApp(app);
    app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    page = app.page; panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    const importFile = async (raw: string) => panel.getByTestId("project-import-file")
      .setInputFiles({ name: "surface-ridge-transfer.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    const missing = structuredClone(packageData);
    missing.resources = missing.resources.filter((item: { kind: string }) => item.kind !== "mesh-buffers");
    await importFile(JSON.stringify(missing));
    await expect(panel.getByTestId("project-import-open")).toBeDisabled();
    await expect(panel.getByTestId("project-import-preview")).toContainText("missing or unverified");
    const corrupt = structuredClone(packageData);
    const sidecar = corrupt.resources.find((item: { kind: string }) => item.kind === "mesh-buffers");
    sidecar.data = (sidecar.data[0] === "A" ? "B" : "A") + sidecar.data.slice(1);
    await importFile(JSON.stringify(corrupt));
    await expect(panel.getByTestId("project-message")).toContainText("rejected");
    await importFile(packageRaw);
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-cancel").click();
    await expect(panel.getByTestId("project-message")).toContainText("Import cancelled");
    await expect(panel.getByTestId("project-import-open")).toHaveCount(0);
    await importFile(packageRaw);
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    const imported = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(imported.workspace.entries.map((entry: { expected: unknown }) => entry.expected))
      .toEqual(saved.workspace.entries.map((entry: { expected: unknown }) => entry.expected));
    expect(imported.workspace.results.find((item: { resultId: string }) => item.resultId === comparison.resultId))
      .toEqual(comparison);
    await page.context().setOffline(true);
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel.getByTestId("project-surface-ridge-evidence")).toContainText("absolute error");
    await expect(panel.getByTestId("project-surface-ridge-export")).toBeEnabled();
  } finally { await closeSurfaceApp(app); }
});
