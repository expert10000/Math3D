import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("M3D20-03 returns a saved Graph probe to its promoted Curve without changing local selection", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-derivative-study").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: /Select parabola/i }).click();
    const compactInspector = page.locator(".graph2d-compact-panels > details").last();
    await compactInspector.locator(":scope > summary").click();
    const inspector = compactInspector;
    const returnButton = inspector.getByTestId("graph2d-return-curve-cursor");
    await expect(returnButton).toBeEnabled();
    const localProbe = inspector.getByLabel("Selected graph result").locator(":scope > span").first();
    const before = await localProbe.textContent();
    await returnButton.click();
    await expect(inspector.getByTestId("graph2d-linked-curve-cursor")).toContainText("Linked Curve parameter");
    await expect(page.getByTestId("graph2d-plot").locator(".graph2d-probe-linked")).toHaveCount(1);
    expect(await localProbe.textContent()).toBe(before);
  } finally { await closeSurfaceApp(app); }
});
