import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe("Volume v1 acceptance", () => {
  test("Volume persistence is reachable, compact and restores responsive workspace state", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByTestId("workspace-nav-volume").click();
      const inspector = ctx.page.getByTestId("volume-inspector");
      await expect(inspector).toBeVisible();
      await inspector.getByTestId("volume-inspector-tab-history").click();
      const history = inspector.getByTestId("volume-history-card");
      await expect(history).toContainText("Workspace undo / redo");
      await history.getByTestId("volume-save-workspace").click();
      await expect(history).toContainText("dense payloads remain external or managed");
      const saved = await ctx.page.evaluate(() => localStorage.getItem("math3d.volume.workspace.v1"));
      expect(saved).toContain('"kind":"math3d-volume-workspace"');
      expect(saved).not.toContain('"scalars"');

      const controls = ctx.page.getByTestId("volume-detailed-controls");
      await controls.getByRole("button", { name: "3D", exact: true }).click();
      await history.getByTestId("volume-restore-workspace").click();
      await expect(ctx.page.getByTestId("volume-slice-grid")).toHaveAttribute("data-volume-layout", "quad");

      for (const viewport of [{ width: 900, height: 1180 }, { width: 390, height: 844 }]) {
        await ctx.page.setViewportSize(viewport);
        await ctx.page.waitForTimeout(500);
        const compactInspectorButton = ctx.page.getByRole("button", { name: "Inspector", exact: true }).last();
        await expect(compactInspectorButton).toBeVisible();
        if (!(await inspector.isVisible())) await compactInspectorButton.click();
        await expect(ctx.page.getByTestId("volume-inspector")).toBeVisible();
        await expect(history.getByRole("button", { name: "Save workspace" })).toBeEnabled();
      }
    } finally {
      if (ctx) await closeSurfaceApp(ctx);
    }
  });
});
