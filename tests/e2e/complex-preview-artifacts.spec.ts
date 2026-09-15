import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe.serial("C05 revision-safe Function Explorer previews", () => {
  let ctx: LaunchedSurfaceApp | null = null;

  test.beforeAll(async () => { ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }); });
  test.afterAll(async () => { await closeSurfaceApp(ctx); });

  test("publishes compact F07 handles for the active document revision", async () => {
    const page = ctx!.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Function Explorer", exact: true }).click();
    const status = page.getByTestId("complex-preview-artifact-status");
    await expect(status).toBeAttached();
    await expect(status).toContainText(/Revision-safe preview r\d+ · 14 F07 artifacts ready/, { timeout: 15_000 });
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    expect(storage).not.toContain("complex-preview:");
    expect(storage).not.toContain("domain-coloring");
  });
});
