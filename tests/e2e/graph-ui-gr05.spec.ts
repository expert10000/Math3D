import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("GR-05 authored Graph types, probes and Project pins survive cold reopen and portable transfer", async () => {
  test.setTimeout(240_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp();
    await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-graph-derivative-notebook").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project workspace");
    const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const workbookId = initial.workbooks[0].id as string;
    expect(initial.notes.length).toBeGreaterThan(0);

    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Function");
    await graphEditor(page).getByLabel("Function name").fill("GR05 Cartesian");
    await graphEditor(page).getByLabel("Function expression").fill("x^2+1");
    await saveGraphEditor(page);
    await openGraphType(page, "Parametric");
    await graphEditor(page).getByLabel("Parametric name").fill("GR05 parametric");
    await graphEditor(page).getByLabel("Parametric x expression").fill("cos(t)");
    await graphEditor(page).getByLabel("Parametric y expression").fill("sin(t)");
    await saveGraphEditor(page);
    await openGraphType(page, "Polar");
    await graphEditor(page).getByLabel("Polar name").fill("GR05 polar");
    await graphEditor(page).getByLabel("Polar radius expression").fill("1+cos(theta)");
    await saveGraphEditor(page);
    await openGraphType(page, "Data series");
    await graphEditor(page).getByLabel("Data series name").fill("GR05 samples");
    await graphEditor(page).getByLabel("Data series import").fill("x,y\n0,1\n1,2\n2,5");
    await saveGraphEditor(page);

    const functions = page.getByLabel("Graph functions", { exact: true });
    for (const name of ["GR05 Cartesian", "GR05 parametric", "GR05 polar", "GR05 samples"])
      await expect(functions.getByRole("button", { name: `Select ${name}` })).toBeVisible();
    await functions.getByRole("button", { name: "Select GR05 parametric" }).click();
    await expect(page.getByLabel("Graph inspector", { exact: true }).getByTestId("graph2d-probe-parameter")).toBeVisible();
    await functions.getByRole("button", { name: "Select GR05 polar" }).click();
    await expect(page.getByLabel("Graph inspector", { exact: true }).getByTestId("graph2d-probe-radius")).toBeVisible();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Toggle polar grid" }).click();
    await expect(page.getByTestId("graph2d-polar-grid")).toBeVisible();

    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    if (!await projects.getByTestId("project-save").isVisible())
      await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.identity.id).toBe(initial.identity.id);
    expect(saved.workbooks[0].id).toBe(workbookId);
    expect(saved.notes.map((note: { identity: { id: string } }) => note.identity.id))
      .toEqual(initial.notes.map((note: { identity: { id: string } }) => note.identity.id));
    expect(saved.workspace.entries.some((entry: { module: string }) => entry.module === "graph2d")).toBe(true);

    const profile = app.profileDir;
    await app.app.close();
    app = await launchSurfaceApp({}, profile);
    page = app.page;
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    for (const name of ["GR05 Cartesian", "GR05 parametric", "GR05 polar", "GR05 samples"])
      await expect(page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: `Select ${name}` })).toBeVisible();
    projects = page.getByTestId("project-explorer-panel");
    if (!await projects.getByTestId("project-export-resources").isVisible()) {
      await projects.getByTestId("project-gallery-layout-toggle").click();
      if (!await projects.getByTestId("project-export-resources").isVisible()) {
        await projects.locator("details.project-header-more summary").click();
        await projects.locator("details.project-header-more button").filter({ hasText: "Import / export" }).click();
      }
    }
    const exportedPath = test.info().outputPath("gr05-portable-project.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), exportedPath);
    await projects.getByTestId("project-export-resources").click();
    await expect.poll(() => existsSync(exportedPath)).toBe(true);
    const raw = readFileSync(exportedPath, "utf8");
    const portable = JSON.parse(raw);
    expect(portable.project.identity.id).toBe(saved.identity.id);
    expect(portable.project.workbooks[0].id).toBe(workbookId);
    expect(portable.project.notes.map((note: { identity: { id: string } }) => note.identity.id))
      .toEqual(saved.notes.map((note: { identity: { id: string } }) => note.identity.id));

    await closeSurfaceApp(app);
    app = await launchSurfaceApp();
    page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({ name: "gr05-portable-project.json",
      mimeType: "application/json", buffer: Buffer.from(raw) });
    await projects.getByTestId("project-import-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Imported into the library");
    await projects.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    await page.getByTestId("workspace-nav-graphs").click();
    for (const name of ["GR05 Cartesian", "GR05 parametric", "GR05 polar", "GR05 samples"])
      await expect(page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: `Select ${name}` })).toBeVisible();
    const imported = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(imported.identity.id).toBe(saved.identity.id);
    expect(imported.workbooks[0].id).toBe(workbookId);
    expect(imported.notes.map((note: { identity: { id: string } }) => note.identity.id))
      .toEqual(saved.notes.map((note: { identity: { id: string } }) => note.identity.id));
  } finally { await closeSurfaceApp(app); }
});
