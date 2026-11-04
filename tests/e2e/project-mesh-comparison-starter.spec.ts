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

for (const example of [
  { id: "mesh-subdivision-study", title: "Retained Mesh Generation Study", metric: "faceCount", status: "3 verified recorded points" },
  { id: "mesh-curvature-study", title: "Saved Mesh Curvature Study", metric: "mean.avg", status: "3 verified recorded points" },
  { id: "mesh-trend-gap-study", title: "Mesh Trend With Missing Result", metric: "metrics.triangleArea.avg", status: "2 verified recorded points" },
] as const) test(`${example.title} opens its exact saved Mesh evidence`, async () => {
  test.setTimeout(120_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-library-search").fill(example.title);
    await expect(panel.getByTestId(`project-template-card-${example.id}`)).toBeVisible();
    await panel.getByTestId(`project-template-open-${example.id}`).click();
    await expect(panel.getByTestId("project-open-mesh-result-trend")).toBeEnabled();
    await panel.getByTestId("project-open-mesh-result-trend").click();
    const trend = page.getByTestId("project-mesh-result-trend");
    await trend.getByTestId("project-mesh-trend-metric").selectOption(example.metric);
    await expect(trend.getByTestId("project-mesh-trend-status")).toContainText(example.status);
    await expect(trend.getByTestId("project-mesh-trend-plot").locator("g[role=button]"))
      .toHaveCount(example.id === "mesh-trend-gap-study" ? 2 : 3);
    if (example.id === "mesh-trend-gap-study") await expect(trend.locator("tr", { hasText: "not recorded" })).toHaveCount(1);
  } finally { await closeSurfaceApp(ctx); }
});
