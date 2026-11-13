import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("selected Surface ridge publishes Mesh error and Workbook evidence across restart, transfer and source change", async () => {
  test.setTimeout(300_000);
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
    const packagePath = test.info().outputPath("surface-ridge-project.resources.json");
    await panel.getByTestId("project-explorer-header").getByText("More", { exact: true }).click();
    await panel.getByTestId("project-explorer-header").getByRole("button", { name: "Import / export" }).click();
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), packagePath);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => {
      if (!existsSync(packagePath)) return false;
      try { return !!JSON.parse(readFileSync(packagePath, "utf8")); } catch { return false; }
    }).toBe(true);
    const packageBytes = readFileSync(packagePath);
    const bundle = JSON.parse(packageBytes.toString("utf8"));
    expect(bundle.project.identity.id).toBe(saved.identity.id);
    expect(bundle.resources.length).toBeGreaterThan(0);
    expect(bundle.project.workbooks.some((book: { title: string }) => book.title ===
      "Surface ridge and discrete curvature comparison")).toBe(true);
    const profile = app.profileDir;
    await app.app.close(); app = await launchSurfaceApp({}, profile); page = app.page;
    await openLastSavedProject(page);
    panel = page.getByTestId("project-explorer-panel");
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel.getByTestId("project-surface-ridge-evidence")).toContainText("spatial offset");
    expect(bundle.resources.some((item: { kind: string }) => item.kind === "mesh-buffers")).toBe(true);
    const missingMeshPackage = Buffer.from(JSON.stringify({ ...bundle,
      resources: bundle.resources.filter((item: { kind: string }) => item.kind !== "mesh-buffers") }));
    await panel.getByTestId("project-explorer-header").getByText("More", { exact: true }).click();
    await panel.getByTestId("project-explorer-header").getByRole("button", { name: "Import / export" }).click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "surface-ridge-missing-mesh.json",
      mimeType: "application/json", buffer: missingMeshPackage });
    await expect(panel.getByTestId("project-import-preview")).toContainText(/missing or unverified/i);
    await expect(panel.getByTestId("project-import-open")).toBeDisabled();
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
    await closeSurfaceApp(app); app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    page = app.page; panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "surface-ridge-project.json",
      mimeType: "application/json", buffer: packageBytes });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    await panel.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel.getByTestId("project-surface-ridge-evidence")).toContainText("absolute error");
    const transferred = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(transferred.workspace.results.find((item: { resultId: string }) =>
      item.resultId === comparison.resultId)).toEqual(comparison);
    const transferProfile = app.profileDir;
    await app.app.close(); app = await launchSurfaceApp({}, transferProfile); page = app.page;
    await openLastSavedProject(page); panel = page.getByTestId("project-explorer-panel");
    if (!await panel.getByTestId("project-studies-panel").count())
      await panel.getByTestId("project-gallery-layout-toggle").click();
    await expect(panel.getByTestId("project-surface-ridge-evidence")).toContainText("spatial offset");
  } finally { await closeSurfaceApp(app); }
});
