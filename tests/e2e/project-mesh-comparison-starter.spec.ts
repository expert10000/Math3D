import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Projects starter opens a verified saved Mesh trend and compares two recorded points", async () => {
  test.setTimeout(120_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-library-search").fill("Saved Mesh Comparison Study");
    await expect(panel.getByTestId("project-template-card-mesh-comparison-study")).toBeVisible();
    await panel.getByTestId("project-template-open-mesh-comparison-study").click();
    await expect(panel.getByTestId("project-open-mesh-result-trend")).toBeEnabled();
    await panel.getByTestId("project-open-mesh-result-trend").click();
    const trend = page.getByTestId("project-mesh-result-trend");
    await trend.getByTestId("project-mesh-trend-metric").selectOption("metrics.triangleArea.avg");
    await expect(trend.getByTestId("project-mesh-trend-status")).toContainText("3 verified recorded points");
    const points = trend.getByTestId("project-mesh-trend-plot").locator("g[role=button]");
    await expect(points).toHaveCount(3);
    await points.nth(0).locator("circle").click();
    await trend.getByTestId("project-mesh-trend-pin-a").click();
    await points.nth(2).locator("circle").click();
    await trend.getByTestId("project-mesh-trend-pin-b").click();
    await trend.getByTestId("project-mesh-trend-compare").click();
    await expect(page.getByTestId("project-mesh-result-comparison").getByTestId("project-mesh-result-status"))
      .toContainText("compatible");
  } finally { await closeSurfaceApp(ctx); }
});
