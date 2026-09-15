import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe.serial("C12 Complex Analysis v1 integrated acceptance", () => {
  let ctx: LaunchedSurfaceApp | null = null;
  test.beforeAll(async () => { ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }); });
  test.afterAll(async () => { await closeSurfaceApp(ctx); });

  test("keeps all migrated labs reachable and records visual evidence", async ({}, testInfo) => {
    const page = ctx!.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    for (const lab of ["Function Explorer", "Möbius Lab", "Riemann Sphere", "Residue Lab", "Branch Lab", "Covering Lab"]) {
      await page.getByRole("banner").getByRole("button", { name: lab, exact: true }).click();
      await expect(page.getByTestId("app-status-bar")).not.toBeEmpty();
    }
    await page.getByRole("banner").getByRole("button", { name: "Branch Lab", exact: true }).click();
    await page.getByRole("button", { name: "sqrt(z)", exact: true }).click();
    await page.getByRole("button", { name: "Branch", exact: true }).last().click();
    await page.getByTestId("analyze-complex-continuation").click();
    await expect(page.getByTestId("complex-continuation-inspector")).toContainText("validated");
    await page.screenshot({ path: testInfo.outputPath("complex-v1-branch-analysis.png"), fullPage: false });
  });
});
