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
    await expect(gallery.getByRole("status")).toContainText("7 scenes");
    const cardsMs = Date.now() - galleryStart;
    await gallery.getByRole("button", { name: "All scenes", exact: true }).click();
    const openStart = Date.now();
    await gallery.getByRole("button", { name: "Open 10,000-point regression", exact: true }).click();
    const clickMs = Date.now() - openStart;
    await expect(gallery).not.toBeVisible();
    const openMs = Date.now() - openStart;

    const panel = page.getByRole("region", { name: "Regression fitting", exact: true });
    await expect(panel).toBeVisible();
    await expect.poll(() => page.locator("[data-graph2d-series-markers] circle").count()).toBeGreaterThan(100);
    expect(await page.locator("[data-graph2d-series-markers] circle").count()).toBeLessThanOrEqual(513);
    const plot = page.locator('[data-graph2d-path="series_1"]');
    const beforeZoom = await plot.getAttribute("d");
    const viewer = await page.getByTestId("main-viewer").boundingBox();
    if (!viewer) throw new Error("Graph viewer is unavailable.");
    await page.mouse.move(viewer.x + viewer.width / 2, viewer.y + viewer.height / 2);
    const zoomStart = Date.now();
    await page.mouse.wheel(0, -400);
    await expect.poll(() => plot.getAttribute("d")).not.toBe(beforeZoom);
    const zoomMs = Date.now() - zoomStart;
    const modelStart = Date.now();
    await panel.getByLabel("Regression model").selectOption("spline");
    await expect(panel.getByLabel("Spline smoothness")).toBeVisible();
    const modelMs = Date.now() - modelStart;
    console.info(`Graph 10k Gallery visible ${galleryMs}ms; cards ready ${cardsMs}ms; preset click ${clickMs}ms; open ${openMs}ms; zoom ${zoomMs}ms; model selection ${modelMs}ms`);
    expect(galleryMs).toBeLessThan(2500);
    expect(openMs).toBeLessThan(4000);
    expect(zoomMs).toBeLessThan(1500);
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
