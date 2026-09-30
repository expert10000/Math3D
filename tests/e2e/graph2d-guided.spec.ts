import { expect, test } from "@playwright/test";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GGL13 Electron Learn opens an independent annotated guide and preserves its source-linked markers", async ({}, info) => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page); await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByRole("button", { name: "Explore Graph Gallery", exact: true }).click();
    const gallery = page.getByTestId("graph-gallery");
    await gallery.getByRole("button", { name: "Learn", exact: true }).click();
    await gallery.getByRole("button", { name: "Study Area under a parabola", exact: true }).click();
    await expect(gallery.getByTestId("graph-gallery-guide-detail")).toContainText("1/3");
    await gallery.getByRole("button", { name: "Open guided Area under a parabola", exact: true }).click();
    await expect(page.getByTestId("graph2d-guided-panel")).toContainText("Area under a parabola · current");
    const marker = page.locator('[data-testid="graph2d-saved-markers"] [data-probe-id]');
    await expect(marker).toHaveCount(2);
    await expect(marker.first()).toContainText("area starts x=0");
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    await page.getByTestId("kernel-workspace-reopen").click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await expect(marker).toHaveCount(2);
    await page.screenshot({ path: info.outputPath("ggl13-electron.png") });
  } finally { await closeSurfaceApp(app); }
});
