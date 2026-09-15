import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe.serial("C08 exact residue and contour Analyze layer", () => {
  let ctx: LaunchedSurfaceApp | null = null;
  test.beforeAll(async () => { ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }); });
  test.afterAll(async () => { await closeSurfaceApp(ctx); });

  test("analyzes 1/z over the existing Residue Lab workflow", async () => {
    const page = ctx!.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Residue Lab", exact: true }).click();
    await page.getByRole("button", { name: "1/z", exact: true }).click();
    await page.getByRole("button", { name: "Residue", exact: true }).last().click();
    await page.getByTestId("analyze-complex-exact-mvp").click();
    const inspector = page.getByTestId("complex-exact-result-inspector");
    await expect(inspector).toContainText("symbolic status: exact");
    await expect(inspector).toContainText("derivative: -1/z^2");
    await expect(inspector).toContainText("0: pole, order 1, residue 1");
    await expect(inspector).toContainText("adaptive contour: numerical");
    await expect(inspector).toContainText("zeros − poles = -1");
  });
});
