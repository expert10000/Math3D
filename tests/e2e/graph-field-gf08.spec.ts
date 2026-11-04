import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { editGraph, graphEditor, saveGraphEditor } from "./helpers/graphAuthoring";

test("GF-08 saves a parameterized inflection and editable integral through Project reopen", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByLabel("Search graphs").fill("Two slopes");
    await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
    await editGraph(page, "Steeper line");
    await graphEditor(page).getByLabel("Function expression").fill("(x-a)^3");
    await saveGraphEditor(page);
    const inspector = page.getByLabel("Graph inspector", { exact: true });
    const critical = inspector.getByTestId("graph2d-critical-points");
    await expect(critical.getByRole("button", { name: "Save all validated inflections (1)" })).toBeEnabled();
    await critical.getByRole("button", { name: "Save all validated inflections (1)" }).click();
    const integral = inspector.getByTestId("graph2d-area");
    await integral.getByRole("button", { name: "Integrate interval" }).click();
    await expect(integral.getByTestId("graph2d-area-result")).toContainText("signed area:");
    await integral.getByTestId("gf08-save-integral").click();
    const saved = inspector.getByTestId("gf08-integral-construction");
    await expect(saved.getByTestId("gf08-saved-integral-value")).toContainText("-20.0000000");
    await saved.getByLabel("From x").fill("0");
    await saved.getByRole("button", { name: "Update integral" }).click();
    await expect(saved.getByTestId("gf08-saved-integral-value")).not.toContainText("-20.0000000");
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect(saved.getByTestId("gf08-saved-integral-value")).toContainText("-20.0000000");
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await expect(page.getByLabel("Graph inspector", { exact: true })
      .getByTestId("gf08-integral-construction")).toBeVisible();
    await expect(page.getByLabel("Graph inspector", { exact: true })
      .locator('[data-construction-id="construction_1"]')).toContainText("Inflection");
  } finally { await closeSurfaceApp(app); }
});
