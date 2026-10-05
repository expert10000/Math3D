import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("NTS05 Geometry Project Note display modes persist", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
    const control = page.getByTestId("geometry-note-pins-mode");
    await expect(control).toBeVisible();
    for (const mode of ["off", "pins", "labels", "all"] as const) {
      await control.selectOption(mode);
      await expect(control).toHaveValue(mode);
      await expect.poll(() => page.evaluate(() => localStorage.getItem("math3d.ui.geometryNotePins.v1"))).toBe(mode);
    }
    await page.reload();
    await page.getByRole("button", { name: "Geometry", exact: true }).first().click();
    await expect(page.getByTestId("geometry-note-pins-mode")).toHaveValue("all");
  } finally { await closeSurfaceApp(ctx); }
});
