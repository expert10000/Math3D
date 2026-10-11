import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Geometry Notes keeps its viewer and controls reachable in a compact Project window", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await resizeSurfaceAppWindow(ctx, 1358, 859);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-geometry-note-pins").click();
    await expect(page.getByTestId("project-viewer-document")).toBeVisible();
    await expect(page.getByTestId("geometry-note-pins-mode")).toBeVisible();
    await expect(page.getByTitle("Current Geometry object-local Project Notes")).toHaveText("2");

    const project = await page.getByTestId("project-explorer-panel").boundingBox();
    const toolbar = await page.getByTestId("geometry-professional-shell").boundingBox();
    const viewer = page.getByTestId("main-viewer");
    await expect(viewer.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    const view = await viewer.boundingBox();
    expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(1358);
    expect(view!.x).toBeGreaterThanOrEqual(project!.x + project!.width);
    expect(view!.y).toBeLessThan(500);
    expect(view!.height).toBeGreaterThan(300);
    expect(view!.y + view!.height).toBeLessThanOrEqual(859);
    await page.getByTestId("geometry-professional-tool-navigate").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("geometry-professional-tool-navigate")).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("geometry-notes-compact.png") });
  } finally { await closeSurfaceApp(ctx); }
});
