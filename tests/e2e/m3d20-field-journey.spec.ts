import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("M3D20-03 Gallery Field profile returns from an exact Graph row and survives Project transfer", async () => {
  test.setTimeout(360_000);
  let app: LaunchedSurfaceApp | null = await launchSurfaceApp();
  try {
    let page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-title").fill("Field and Graph evidence");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await projects.getByRole("button", { name: "Starter projects", exact: true }).click();
    await projects.getByTestId("project-gallery-guided").click();
    const card = projects.getByTestId("curated-study-card-field-graph-return");
    await expect(card).toContainText("Guided live workflow");
    await card.getByTestId("curated-study-open-field-graph-return").click();
    let field = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(field).toBeVisible();
    await field.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await field.getByRole("button", { name: "XY slice" }).click();
    await field.getByRole("button", { name: "Preview slice" }).click();
    await field.getByRole("region", { name: "Line profile through probe" })
      .getByRole("button", { name: "Send analytic line to Graphs" }).click();
    await field.getByTestId("vector-field-publish-cursor").click();
    await field.getByRole("button", { name: "Save document" }).click();
    await field.getByRole("button", { name: "Save field to Project", exact: true }).click();
    await field.getByRole("button", { name: "Close" }).click();

    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: /Select SPEED vs x/ }).click();
    const inspector = page.locator(".graph2d-compact-panels > details").last();
    await inspector.locator(":scope > summary").click();
    await expect(inspector.getByTestId("graph2d-linked-field-cursor"))
      .toContainText("Linked Field row row_65");
    await page.getByRole("button", { name: "Fit selection" }).last().click();
    await page.getByTestId("graph2d-plot").locator('[data-row-id="row_65"]').click();
    const returnButton = inspector.getByTestId("graph2d-return-field-cursor");
    await returnButton.click();
    field = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(field.getByTestId("vector-field-linked-cursor")).toContainText("0, 0, 0 m");
    await field.getByRole("button", { name: "Close" }).click();

    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const source = saved.workspace.entries.find((entry: { module: string }) => entry.module === "vector3d");
    expect(source).toBeTruthy();
    const graph = saved.workspace.entries.find((entry: { module: string }) => entry.module === "graph2d");
    expect(graph).toBeTruthy();
    await projects.getByTestId("project-detail-toggle").click();
    const studies = projects.getByTestId("project-studies-panel");
    await studies.getByLabel("Study title").fill("Field profile and exact Graph row");
    await studies.getByTestId(`project-study-choose-${source.expected.id}`).check();
    await studies.getByTestId(`project-study-choose-${graph.expected.id}`).check();
    await studies.getByTestId("project-study-create-button").click();
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.studies?.length)).toBe(1);
    await page.getByRole("button", { name: "Close project explorer" }).click();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    const back = page.getByTestId("project-source-back-to-module");
    if (await back.isVisible()) await back.click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    for (const targetId of [`d:${source.expected.id}`, `d:${graph.expected.id}`]) {
      await page.getByRole("button", { name: "Project reference", exact: true }).click();
      const cell = page.getByTestId("workbook-project-reference-cell").last();
      await cell.getByTestId("workbook-project-reference-target").selectOption(targetId);
      await cell.getByRole("button", { name: "Link selection" }).click();
      await expect(cell.getByTestId("workbook-project-reference-status")).toContainText("current");
    }
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save-active-workbook").click();
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workbooks.length)).toBe(1);

    const packagePath = resolve(app.profileDir, "field-graph-journey.resources.math3d.project.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), packagePath);
    const header = projects.getByTestId("project-explorer-header");
    if (!await projects.getByTestId("project-export-resources").isVisible()) {
      if (!await header.getByText("More", { exact: true }).isVisible())
        await header.getByTestId("project-detail-toggle").click();
      await header.getByText("More", { exact: true }).click();
      await header.getByRole("button", { name: "Import / export" }).click();
    }
    await projects.getByTestId("project-export-resources").click();
    await expect.poll(() => existsSync(packagePath)).toBe(true);
    const raw = readFileSync(packagePath, "utf8");
    await closeSurfaceApp(app); app = null;

    app = await launchSurfaceApp(); page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({ name: "field-graph-journey.project.json",
      mimeType: "application/json", buffer: Buffer.from(raw) });
    await projects.getByTestId("project-import-open").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened");
    const profile = app.profileDir;
    await app.app.close(); app = await launchSurfaceApp({}, profile);
    page = app.page; await openLastSavedProject(page);
    projects = page.getByTestId("project-explorer-panel");
    if (!await page.getByTestId("project-research-nav-studies").count())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await page.getByTestId("project-research-nav-studies").click();
    await projects.getByTestId("project-studies-panel").locator("[data-testid^='project-study-open-']").click();
    await expect(projects.getByTestId("project-study-source-status-pane-1")).toContainText("current");
    const imported = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(imported.workbooks).toHaveLength(1);
    await page.getByTestId("project-research-nav-workbooks").click();
    await projects.getByTestId(`project-open-workbook-${imported.workbooks[0].id}`).click();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await expect(page.getByTestId("workbook-project-reference-cell")).toHaveCount(2);
    await expect(page.getByTestId("workbook-project-reference-cell").last()
      .getByTestId("workbook-project-reference-status")).toContainText("current");
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("workspace-dock-reset-recommended").click();
    await page.getByRole("button", { name: /Select SPEED vs x/ }).click();
    const transferredInspector = page.locator(".graph2d-compact-panels > details").last();
    await transferredInspector.locator(":scope > summary").click();
    await page.getByRole("button", { name: "Fit selection" }).last().click();
    await page.getByTestId("graph2d-plot").locator('[data-row-id="row_65"]').click();
    const transferredReturn = transferredInspector.getByTestId("graph2d-return-field-cursor");
    await transferredReturn.click();
    field = page.getByRole("region", { name: "Scientific Field Explorer" });
    await expect(field.getByTestId("vector-field-linked-cursor")).toContainText("0, 0, 0 m");
    await field.getByLabel("Density x").fill("6");
    await field.getByTestId("vector-field-publish-cursor").click();
    await field.getByRole("button", { name: "Save document" }).click();
    await field.getByRole("button", { name: "Save field to Project", exact: true }).click();
    await field.getByRole("button", { name: "Close" }).click();
    await expect(transferredInspector.getByTestId("graph2d-linked-field-cursor"))
      .toContainText("Field source, revision, or physical frame differs");
    await transferredReturn.click();
    await expect(transferredInspector.getByTestId("graph2d-return-field-cursor-error"))
      .toContainText("Analytic Field source has changed");
  } finally { await closeSurfaceApp(app); }
});
