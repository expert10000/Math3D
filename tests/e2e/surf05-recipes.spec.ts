import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openParametricSurface, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const recipes = [
  { family: "implicit", title: "Sphere", source: /implicit/i },
  { family: "parametric", title: "Torus", source: /parametric/i },
  { family: "spline", title: "Bezier surface", source: /parametric|spline/i },
  { family: "weierstrass", title: "Enneper", source: /weierstrass/i },
] as const;

for (const recipe of recipes) {
  test(`SURF-05 ${recipe.family} recipe computes current curvature`, async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      const page = ctx.page;
      await resetSurfaceAppState(page);
      await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
      if (recipe.family === "weierstrass" && !(await page.getByTestId("surface-family-weierstrass").first().isVisible())) {
        await page.getByTestId("surface-family-more").first().click();
      }
      await page.getByTestId(`surface-family-${recipe.family}`).first().click();
      await expect(page.getByTestId("surface-primary-viewer").locator("canvas").first()).toBeVisible();
      await page.getByTestId("surfaces-left-tab-analysis").click();
      await expect(page.getByTestId("surface-analysis-contract-identity")).toContainText(recipe.source);
      await expect(page.getByTestId("surface-analysis-contract")).toContainText(recipe.title);
      await expect(page.getByTestId("surface-analysis-contract-state")).toHaveText("ready");
      await page.getByTestId("surface-computation-curvature-field").click();
      const readiness = page.getByTestId("surface-compute-readiness");
      await expect(readiness).toContainText("Domain:");
      await expect(readiness).toContainText("sampling:");
      await expect(readiness).toContainText("units:");
      await expect(readiness).toContainText("Backend:");
      await page.getByTestId("surface-curvature-compute-button").click();
      await expect(page.getByTestId("surface-result-qualification")).toHaveAttribute("data-status", "current");
      await expect(page.getByTestId("surface-curvature-statistics")).toContainText("RMS");
      await expect(page.getByTestId("error-banner")).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(`${recipe.family}-analysis.png`) });
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
}

test("SURF-05 source change retains history and withholds old curvature values", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    const page = ctx.page;
    await openParametricSurface(page);
    await page.getByTestId("surfaces-left-tab-analysis").click();
    await page.getByTestId("surface-computation-curvature-field").click();
    await page.getByTestId("surface-curvature-compute-button").click();
    await expect(page.getByTestId("surface-result-qualification")).toHaveAttribute("data-status", "current");
    const source = await page.getByTestId("surface-analysis-contract-identity").innerText();
    await page.getByTestId("surface-curvature-result").getByRole("button", { name: "Save", exact: true }).click();
    const savedBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.surfaceAnalysis.workspace.v1")!).savedResults);
    expect(savedBefore.some((result: { kind?: string }) => result.kind === "curvature-field")).toBe(true);
    await page.getByTestId("surface-family-spline").first().click();
    await page.getByTestId("surfaces-left-tab-analysis").click();
    await expect(page.getByTestId("surface-analysis-contract-identity")).not.toHaveText(source);
    await expect(page.getByTestId("surface-result-qualification")).toHaveAttribute("data-status", "unavailable");
    await expect(page.getByTestId("surface-curvature-statistics")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.surfaceAnalysis.workspace.v1")!).savedResults)).toEqual(savedBefore);
    await expect(page.getByTestId("error-banner")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test("SURF-05 parametric recipe promotes to Mesh with source lineage", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    const page = ctx.page;
    await openParametricSurface(page);
    const promote = page.getByRole("button", { name: "Promote to SurfaceMesh", exact: true }).first();
    await expect(promote).toBeEnabled();
    await promote.click();
    await expect(page.getByTestId("mesh-workspace-left-tab-operations")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Source: Param: Torus", { exact: true })).toBeVisible();
    await expect(page.getByText("baked from param", { exact: true })).toBeVisible();
    await expect(page.getByTestId("app-status-bar")).toContainText("type mesh");
    await expect(page.getByTestId("error-banner")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(ctx);
  }
});
