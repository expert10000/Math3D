import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Ripple Wave opens Graph, Surface, Mesh and Geometry and restores the selected document", async () => {
  test.setTimeout(240_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    let page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-ripple-wave-study").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const byModule = Object.fromEntries(saved.workspace.entries.map((entry: any) => [entry.module, entry.expected.id])) as Record<string, string>;
    expect(Object.keys(byModule)).toEqual(["graph2d", "surface", "mesh", "geometry"]);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-document-id", byModule.surface);
    await expect(page.getByTestId("project-source-editor").getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath("ripple-wave-surface.png") });

    for (const [module, nav] of [["graph2d", "graphs"], ["mesh", "mesh"], ["geometry", "geometry"]] as const) {
      await page.getByTestId("project-viewer-document").selectOption(byModule[module]);
      await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", byModule[module]);
      await expect(page.getByTestId(`workspace-nav-${nav}`)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("project-viewer-document")).toHaveValue(byModule[module]);
      if (module === "geometry") {
        await expect(page.getByTestId("geometry-viewer-panel").getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
        expect(await page.evaluate(() => localStorage.getItem("math3d.ui.geometryViewerControls.v1"))).toBe("1");
        await page.waitForTimeout(500);
        await page.screenshot({ path: test.info().outputPath("ripple-wave-geometry.png") });
      }
    }
    await page.getByTestId("project-gallery-layout-toggle").click();
    await page.getByTestId("project-save").click();
    await expect(page.getByTestId("project-save")).toBeEnabled();
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    page = ctx.page;
    await openLastSavedProject(page);
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", byModule.geometry);
    await page.getByTestId("project-viewer-document").selectOption(byModule.surface);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-document-id", byModule.surface);
  } finally { await closeSurfaceApp(ctx); }
});
