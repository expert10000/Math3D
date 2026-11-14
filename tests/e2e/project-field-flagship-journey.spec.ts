import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Field Gallery source flows through line, Graph row, exact return, Study, Workbook, restart and transfer", async () => {
  test.setTimeout(240_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp(); await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByRole("button", { name: "Starter projects", exact: true }).click();
    await projects.getByTestId("project-gallery-guided").click();
    await expect(projects.getByTestId("curated-study-card-field-line-profile-study"))
      .toContainText("exact Field source");
    await projects.getByTestId("curated-study-open-field-line-profile-study").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
    const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const sourceId = initial.workspace.entries.find((entry: { module: string }) => entry.module === "vector3d").expected.id;
    const study = initial.workspace.studies[0];
    expect(initial.workbooks).toHaveLength(1);
    if (!await projects.getByTestId("project-studies-panel").count())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    const studies = projects.getByTestId("project-studies-panel");
    await studies.getByTestId(`project-study-open-${study.id}`).click();
    await expect(studies.getByTestId("project-study-source-status-pane-1"))
      .toContainText("Saved source pin: current");
    await studies.getByTestId("project-study-open-source-pane-1").click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", sourceId);
    await page.getByTestId("workspace-nav-graphs").click();
    let field = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await field.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer", exact: true }).click();
    }
    await field.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await field.getByRole("button", { name: "XY slice" }).click();
    await field.getByRole("button", { name: "Preview slice" }).click();
    await field.getByRole("region", { name: "Line profile through probe" })
      .getByRole("button", { name: "Send analytic line to Graphs" }).click();
    await field.getByTestId("vector-field-publish-cursor").click();
    await field.getByRole("button", { name: "Save document" }).click();
    await field.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: /Select SPEED vs x/ }).click();
    const inspector = page.locator(".graph2d-compact-panels > details").last();
    await inspector.locator(":scope > summary").click();
    await page.getByRole("button", { name: "Fit selection" }).last().click();
    await page.getByTestId("graph2d-plot").locator('[data-row-id="row_65"]').click();
    await inspector.getByTestId("graph2d-return-field-cursor").click();
    field = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(field.getByTestId("vector-field-linked-cursor")).toContainText("0, 0, 0 m");
    await field.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    if (!await projects.getByTestId("project-save").isVisible())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const profile = app.profileDir;
    await app.app.close();
    app = await launchSurfaceApp({}, profile); page = app.page;
    await openLastSavedProject(page);
    projects = page.getByTestId("project-explorer-panel");
    if (!await projects.getByTestId("project-studies-panel").count())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-studies-panel")
      .getByTestId(`project-study-open-${study.id}`).click();
    await expect(projects.getByTestId("project-study-source-status-pane-1"))
      .toContainText("Saved source pin: current");
    if (!await projects.getByTestId("project-export-resources").isVisible()) {
      await projects.getByTestId("project-gallery-layout-toggle").click();
      if (!await projects.getByTestId("project-export-resources").isVisible()) {
        await projects.locator("details.project-header-more summary").click();
        await projects.locator("details.project-header-more button").filter({ hasText: "Import / export" }).click();
      }
    }
    const exported = test.info().outputPath("field-transfer.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), exported);
    await projects.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return readFileSync(exported).length; } catch { return 0; } }).toBeGreaterThan(100);
    const raw = readFileSync(exported, "utf8");
    await closeSurfaceApp(app);
    app = await launchSurfaceApp(); page = app.page; await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({ name: "field-transfer.json",
      mimeType: "application/json", buffer: Buffer.from(raw) });
    await projects.getByTestId("project-import-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Imported into the library");
    await projects.getByTestId(`project-open-saved-${initial.identity.id}`).click();
    if (!await projects.getByTestId("project-studies-panel").count())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-studies-panel")
      .getByTestId(`project-study-open-${study.id}`).click();
    await expect(projects.getByTestId("project-study-source-status-pane-1"))
      .toContainText("Saved source pin: current");
    const imported = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(imported.workbooks).toHaveLength(1);
    expect(imported.workspace.entries.some((entry: { module: string }) => entry.module === "graph2d")).toBe(true);
    const workbookId = imported.workbooks[0].id as string;
    const payload = JSON.parse(raw).resources.find((resource: { kind: string; id: string; data: string }) =>
      resource.kind === "workbook-payload" && resource.id === workbookId);
    expect(payload).toBeTruthy();
    expect(Buffer.from(payload.data, "base64").toString("utf8")).toContain(study.id);
    await projects.getByTestId("project-study-open-source-pane-1").click();
    await page.getByTestId("workspace-nav-graphs").click();
    field = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await field.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer", exact: true }).click();
    }
    await field.getByLabel("Density x").fill("6");
    await field.getByRole("button", { name: "Save document" }).click();
    await field.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: /Select SPEED vs x/ }).click();
    const changedInspector = page.locator(".graph2d-compact-panels > details").last();
    await changedInspector.locator(":scope > summary").click();
    await page.getByRole("button", { name: "Fit selection" }).last().click();
    await page.getByTestId("graph2d-plot").locator('[data-row-id="row_65"]').click();
    await changedInspector.getByTestId("graph2d-return-field-cursor").click();
    await expect(changedInspector.getByTestId("graph2d-return-field-cursor-error"))
      .toContainText("Analytic Field source has changed");
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    const missing = JSON.parse(raw);
    missing.resources = missing.resources.filter((resource: { kind: string }) => resource.kind !== "graph-point-table");
    await projects.getByTestId("project-import-file").setInputFiles({ name: "field-missing-source.json",
      mimeType: "application/json", buffer: Buffer.from(JSON.stringify(missing)) });
    await expect(projects.getByTestId("project-import-open")).toBeDisabled();
  } finally { await closeSurfaceApp(app); }
});
