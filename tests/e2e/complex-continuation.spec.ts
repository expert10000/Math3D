import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe.serial("C10 adaptive Complex continuation", () => {
  let ctx: LaunchedSurfaceApp | null = null;
  test.beforeAll(async () => { ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }); });
  test.afterAll(async () => { await closeSurfaceApp(ctx); });
  test("publishes square-root monodromy only after validated lifting", async () => {
    const page = ctx!.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Branch Lab", exact: true }).click();
    await page.getByRole("button", { name: "sqrt(z)", exact: true }).click();
    await page.getByRole("button", { name: "Branch", exact: true }).last().click();
    await page.getByTestId("analyze-complex-continuation").click();
    const inspector = page.getByTestId("complex-continuation-inspector");
    await expect(inspector).toContainText("adaptive path lifting · validated");
    await expect(inspector).toContainText("monodromy: 0->1, 1->0");
    await expect(inspector).toContainText(/samples: \d+ → \d+/);
  });
});
