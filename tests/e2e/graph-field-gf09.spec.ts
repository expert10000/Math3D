import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { editGraph, graphEditor, saveGraphEditor } from "./helpers/graphAuthoring";

test("GF-09 measures a saved parameter sweep, reopens its Graph series and withholds changed values", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByLabel("Search graphs").fill("Two slopes");
    await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByTestId("graph2d-parameters-open").click();
    const parameters = page.getByTestId("graph2d-parameters");
    await parameters.getByRole("button", { name: "Configure a" }).click();
    await parameters.getByRole("button", { name: "Save parameter" }).click();
    await parameters.getByTestId("graph2d-parameters-close").click();
    const inspector = page.getByLabel("Graph inspector", { exact: true });
    const studies = inspector.getByTestId("gf09-parameter-studies");
    await studies.getByRole("button", { name: "New parameter study" }).click();
    await studies.getByLabel("Study label").fill("Slope survey");
    await studies.getByLabel("From value").fill("1");
    await studies.getByLabel("To value").fill("3");
    await studies.getByLabel("Samples").fill("5");
    await studies.getByLabel("Measure y at x").fill("2");
    await studies.getByRole("button", { name: "Save study" }).click();
    const saved = studies.getByTestId("gf09-study");
    await expect(saved).toContainText("Slope survey");
    await saved.getByRole("button", { name: "Run study" }).click();
    await expect(saved).toContainText("Series current");
    await saved.getByRole("button", { name: "Open series in Graphs" }).click();
    await expect(inspector).toContainText("Slope survey");
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenedStudies = page.getByLabel("Graph inspector", { exact: true })
      .getByTestId("gf09-parameter-studies");
    const reopened = reopenedStudies.getByTestId("gf09-study");
    await expect(reopened).toContainText("Slope survey");
    await expect(reopened).toContainText("Series current");
    await reopened.getByRole("button", { name: "Edit measurement" }).click();
    await reopenedStudies.getByLabel("Measure y at x").fill("3");
    await reopenedStudies.getByRole("button", { name: "Update study" }).click();
    await expect(reopened).toContainText("Values withheld: study changed");
    await reopened.getByRole("button", { name: "Open series in Graphs" }).click();
    await editGraph(page, "Steeper line");
    await graphEditor(page).getByLabel("Function expression").fill("a*x+b+1");
    await saveGraphEditor(page);
    await expect(reopened).toContainText("Values withheld");
  } finally { await closeSurfaceApp(app); }
});
