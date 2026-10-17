import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("10,000-point Gallery and regression controls stay responsive; spline is drawn above data", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await expect(page.getByTestId("graph-gallery-open")).toBeVisible();

    const galleryStart = Date.now();
    await page.getByTestId("graph-gallery-open").click();
    const gallery = page.getByTestId("graph-gallery");
    await expect(gallery).toBeVisible();
    const galleryMs = Date.now() - galleryStart;
    await expect(gallery.getByRole("status")).toContainText("6 scenes");
    const cardsMs = Date.now() - galleryStart;
    await gallery.getByRole("button", { name: "All scenes", exact: true }).click();
    const openStart = Date.now();
    await gallery.getByRole("button", { name: "Open 10,000-point regression", exact: true }).click();
    await expect(gallery).not.toBeVisible();
    const openMs = Date.now() - openStart;

    const panel = page.getByRole("region", { name: "Regression fitting", exact: true });
    await expect(panel).toBeVisible();
    await expect.poll(() => page.locator("[data-graph2d-series-markers] circle").count()).toBeGreaterThan(100);
    const modelStart = Date.now();
    await panel.getByLabel("Regression model").selectOption("spline");
    await expect(panel.getByLabel("Spline smoothness")).toBeVisible();
    const modelMs = Date.now() - modelStart;
    console.info(`Graph 10k Gallery visible ${galleryMs}ms; cards ready ${cardsMs}ms; preset open ${openMs}ms; model selection ${modelMs}ms`);
    expect(galleryMs).toBeLessThan(2500);
    expect(modelMs).toBeLessThan(1500);

    await panel.getByRole("button", { name: "Fit dataset", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Current regression");
    const overlay = page.getByTestId("graph2d-regression-overlay");
    await expect(overlay.locator('path[stroke="#b45309"]')).toHaveAttribute("d", /^M/);
    expect(await page.evaluate(() => {
      const data = document.querySelector("[data-graph2d-series-markers]");
      const fit = document.querySelector('[data-testid="graph2d-regression-overlay"]');
      return !!data && !!fit && !!(data.compareDocumentPosition(fit) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    const reopenStart = Date.now();
    await page.getByTestId("graph-gallery-open").click();
    await expect(gallery).toBeVisible();
    expect(Date.now() - reopenStart).toBeLessThan(2500);
    await gallery.getByRole("button", { name: "Close Graph Gallery" }).click();
  } finally { await closeSurfaceApp(app); }
});
