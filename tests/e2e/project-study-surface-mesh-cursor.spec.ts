import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Study shares only a source-qualified Surface–Mesh physical marker after cold restart", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp();
    await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-surface-mesh-probe").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project", { timeout: 60_000 });
    const ids = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.entries.map((entry: { expected: { id: string } }) => entry.expected.id) as string[]);
    await projects.getByTestId("project-gallery-layout-toggle").click();
    let studies = projects.getByTestId("project-studies-panel");
    await studies.getByLabel("Study title").fill("Measured coordinate");
    for (const id of ids) await studies.getByTestId(`project-study-choose-${id}`).check();
    await studies.getByTestId("project-study-create-button").click();
    await studies.locator("[data-testid^='project-study-open-']").click();
    await expect(studies.getByTestId("project-study-cursor-qualification"))
      .toContainText("declared frame");
    await studies.getByTestId("project-study-link-surface-mesh").click();
    const control = studies.getByTestId("project-study-surface-mesh-control");
    await control.getByLabel("x (m)").fill("0.25");
    await control.getByLabel("y (m)").fill("0.5");
    await control.getByLabel("z (m)").fill("0.75");
    await control.getByTestId("project-study-share-surface-mesh-coordinate").click();
    await expect(control.getByTestId("project-study-surface-mesh-result"))
      .toContainText("No target Mesh element or curvature value is inferred");
    await projects.getByTestId("project-save").click();
    const profile = app.profileDir;
    await app.app.close();
    app = await launchSurfaceApp({}, profile);
    page = app.page;
    await openLastSavedProject(page);
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-gallery-layout-toggle").click();
    studies = projects.getByTestId("project-studies-panel");
    await studies.locator("[data-testid^='project-study-open-']").click();
    await expect(studies.getByTestId("project-study-surface-mesh-control")).toBeVisible();
    await expect(studies.getByTestId("project-study-link-surface-mesh")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
