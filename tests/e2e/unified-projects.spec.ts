import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("PRJ01/PRJ02 names and previews a project across restart and navigates live documents", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("project-message")).toContainText("Current workspace");
    for (const module of ["graph2d", "geometry", "curve", "surface", "mesh", "volume", "topology", "complex", "analysis"]) {
      await expect(panel.getByTestId(`project-group-${module}`)).toHaveCount(1);
    }
    await panel.getByTestId("project-title").fill("Minimal Surface Study");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Minimal Surface Study”");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries.length).toBeGreaterThan(1);
    const originalIds = saved.workspace.entries.map((entry: any) => entry.expected.id);
    await panel.screenshot({ path: test.info().outputPath("project-explorer-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await panel.screenshot({ path: test.info().outputPath("project-explorer-phone.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-view-saved").click();
    await expect(panel.getByTestId("project-title")).toHaveValue("Minimal Surface Study");
    await expect(panel.getByTestId("project-title")).toBeDisabled();
    await expect(panel.getByTestId("project-save")).toBeDisabled();
    const buttons = panel.locator("button[data-testid^='project-open-']");
    await expect(buttons).toHaveCount(originalIds.length);
    for (let index = 0; index < originalIds.length; index++) await expect(buttons.nth(index)).toBeDisabled();
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(reopened).toEqual(saved);
    await panel.getByTestId("project-current").click();
    const graphOpen = panel.getByTestId("project-group-graph2d").getByRole("button").first();
    await expect(graphOpen).toBeEnabled(); await graphOpen.click();
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    await expect(panel).not.toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ02 rejects corrupt saved project without replacing its bytes", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(() => localStorage.setItem("math3d.project.v1", "{broken saved project"));
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await expect(panel.getByTestId("project-message")).toContainText("Project unavailable");
    await expect(panel.getByTestId("project-save")).toBeDisabled();
    expect(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe("{broken saved project");
  } finally { await closeSurfaceApp(ctx); }
});
