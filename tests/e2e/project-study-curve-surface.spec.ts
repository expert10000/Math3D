import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("M3D20-03 links an exact Curve parameter and Surface chart through a reopened Study", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-curve-construction-study").click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.project.v1"))).not.toBeNull();
    const ids = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      return ["Parameter chart", "Curve on chart"].map(title => {
        const entry = project.workspace.entries.find((item: { checkpoint: { metadata: { title: string } } }) =>
          item.checkpoint.metadata.title === title);
        return entry.expected.id as string;
      });
    });
    await projects.getByTestId("project-gallery-layout-toggle").click();
    const studies = projects.getByTestId("project-studies-panel");
    await studies.getByLabel("Study title").fill("Chart question");
    for (const id of ids) await studies.getByTestId(`project-study-choose-${id}`).check();
    await studies.getByTestId("project-study-create-button").click();
    await studies.locator("[data-testid^='project-study-open-']").click();
    await studies.getByTestId("project-study-link-curve-surface").click();
    const control = studies.getByTestId("project-study-curve-surface-control");
    await control.getByLabel("Curve parameter (t)").fill("0.5");
    await control.getByTestId("project-study-share-chart-parameter").click();
    await expect(control.getByTestId("project-study-chart-result")).toContainText("u=0.5, v=0.25");
    await control.getByLabel("Surface v").fill("0.3");
    await control.getByTestId("project-study-return-chart-point").click();
    await expect(control.getByTestId("project-study-chart-result")).toContainText("not on the saved Curve trace");
    await control.getByLabel("Surface v").fill("0.25");
    await control.getByTestId("project-study-return-chart-point").click();
    await expect(control.getByTestId("project-study-chart-result")).toContainText("u=0.5, v=0.25");
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await studies.locator("[data-testid^='project-study-open-']").click();
    await expect(studies.getByTestId("project-study-curve-surface-control")).toBeVisible();
    await expect(studies.getByTestId("project-study-link-curve-surface")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
