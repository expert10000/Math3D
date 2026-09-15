import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe.serial("C11 Riemann-surface lineage", () => {
  let ctx: LaunchedSurfaceApp | null = null;
  test.beforeAll(async () => { ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }); });
  test.afterAll(async () => { await closeSurfaceApp(ctx); });

  test("retains a locate-back relationship after opening the derived surface", async () => {
    const page = ctx!.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Branch Lab", exact: true }).click();
    await page.getByRole("button", { name: "sqrt(z)", exact: true }).click();
    await page.getByRole("button", { name: "Build 3D value surface", exact: true }).first().click();
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Branch Lab", exact: true }).click();
    const lineage = page.getByTestId("complex-riemann-lineage");
    await expect(lineage).toContainText("related: Surfaces + Mesh");
    await expect(lineage).toContainText("current source revision");
    await page.getByTestId("complex-riemann-locate-back").click();
    await expect(page.getByText(/Located surface vertex 0/)).toContainText("sqrt(z)");
  });
});
