import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Geometry Project panel closes and navigation stays responsive", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 2048, 1100);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel"), toggle = page.getByTestId("projects-quick-toggle");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-geometry-note-pins").click();
    await expect(panel.getByTestId("project-viewer-document")).not.toHaveValue("");
    const saved = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    const id = JSON.parse(saved!).workspace.entries[0].expected.id;
    for (const placement of ["left", "right", "middle", "all"] as const) {
      await panel.getByTestId(`project-placement-${placement}`).click();
      await panel.getByRole("button", { name: "Close project explorer", exact: true }).click();
      await expect(panel).toHaveCount(0);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByTestId("geometry-note-pins-mode")).toBeVisible();
      await toggle.click();
      await expect(panel.getByTestId("project-viewer-document")).toHaveValue(id);
      await toggle.click(); await expect(panel).toHaveCount(0);
      await page.getByTestId("projects-toggle").click();
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "Close project explorer", exact: true }).click();
      await expect(panel).toHaveCount(0);
      await toggle.click();
      expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved);
    }
    await panel.getByRole("button", { name: "Close project explorer", exact: true }).click();
    await page.getByTestId("workspace-nav-surfaces").click();
    await expect(page.getByTestId("workspace-nav-surfaces")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("workspace-nav-geometry").click();
    await expect(page.getByTestId("geometry-note-pins-mode")).toBeVisible();
    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect.poll(() => ctx!.app.windows().length).toBe(0);
  } finally { await closeSurfaceApp(ctx); }
});
