import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Surface and Custom keep navigation aligned and native viewer tools work", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page, errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    const owner = page.getByTestId("project-source-editor");
    const id = await owner.getAttribute("data-document-id"), hash = await owner.getAttribute("data-source-hash");
    const position = () => page.evaluate(() => {
      const box = (testId: string) => {
        const rect = document.querySelector(`[data-testid="${testId}"]`)!.getBoundingClientRect();
        return { x: rect.x, y: rect.y, height: rect.height };
      };
      return { surface: box("document-surface-view"), custom: box("document-custom-view"), toolbar: box("saved-surface-toolbar"), actions: box("surface-module-actions") };
    });
    await expect(page.getByTestId("surface-view-gizmo")).toBeVisible();
    await page.getByTestId("surface-view-gizmo").getByRole("button", { name: "Fit", exact: true }).click();
    const tools = page.getByTestId("surface-viewer-controls-strip");
    await expect(tools).toBeVisible();
    await expect(page.getByTestId("surface-primary-viewer").getByText("Geodesic", { exact: true })).toBeVisible();
    await expect(page.getByTestId("surface-primary-viewer").getByText("Slice plane", { exact: true })).toBeVisible();
    await tools.getByTestId("surface-viewport-panel-toggle").uncheck();
    await expect(page.getByTestId("surface-viewport-panel-hide")).toHaveCount(0);
    await expect(page.getByTestId("surface-view-gizmo")).toBeVisible();
    await tools.getByTestId("surface-viewport-panel-toggle").check();
    await tools.getByRole("button", { name: "Fit Surface", exact: true }).click();
    await tools.getByRole("button", { name: "Reset camera", exact: true }).click();
    await tools.getByRole("button", { name: "Edit saved Surface", exact: true }).click();
    await expect(page.getByTestId("saved-surface-module-source")).toBeVisible();
    await expect(owner).toHaveAttribute("data-document-id", id!);
    for (const width of [1600, 2200]) {
      await resizeSurfaceAppWindow(ctx, width, 1000);
      const native = await position();
      await page.screenshot({ path: test.info().outputPath(`surface-tools-${width}.png`) });
      await page.getByTestId("document-custom-view").click();
      await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-workbench", "custom");
      expect(await position()).toEqual(native);
      await page.getByTestId("document-view-choice").selectOption("sampled");
      expect(await position()).toEqual(native);
      await page.screenshot({ path: test.info().outputPath(`custom-nav-${width}.png`) });
      await page.getByTestId("surfaces-left-tab-object").click();
      await expect(page.getByTestId("saved-surface-module-source")).toBeVisible();
      expect(await position()).toEqual(native);
      await expect(owner).toHaveAttribute("data-source-hash", hash!);
    }
    await tools.getByRole("button", { name: "Create project Mesh", exact: true }).click();
    await expect(page.getByTestId("project-source-back-to-surface")).toHaveText("Back to catenoid");
    await page.getByTestId("project-source-back-to-surface").click();
    await expect(owner).toHaveAttribute("data-document-id", id!);
    await expect(tools).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await closeSurfaceApp(ctx); }
});
