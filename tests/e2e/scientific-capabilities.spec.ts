import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("module capability discovery follows navigation and opens the verified Surface operation", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1700, 1000));
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("workspace-nav-surfaces").click();
    await ctx.page.getByTestId("scientific-capabilities-toggle").click();
    const panel = ctx.page.getByTestId("scientific-capabilities-panel");
    const module = ctx.page.getByTestId("scientific-capabilities-module");
    await expect(panel).toBeVisible();
    await expect(module).toHaveValue("surface");
    await expect(ctx.page.getByTestId("available-operation-surface.curvature.compute")).toBeVisible();
    await module.selectOption("graph3d");
    await expect(panel).toContainText("Critical Points");
    await expect(panel).toContainText("No verified operation in this app for Graph 3D");
    await ctx.page.getByTestId("workspace-nav-mesh").click();
    await expect(module).toHaveValue("mesh");
    await ctx.page.getByTestId("workspace-nav-surfaces").click();
    await expect(module).toHaveValue("surface");
    await panel.getByRole("button", { name: "Open computation" }).click();
    await expect(panel).toHaveCount(0);
    await expect(ctx.page.getByTestId("surface-module-actions")).toBeVisible();
  } finally {
    await closeSurfaceApp(ctx);
  }
});
