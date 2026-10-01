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

test("PRJ03 persists library metadata, favorites, activity and thumbnail sidecars safely", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-title").fill("Catenary research");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Catenary research”");
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await panel.getByTestId("project-description").fill("Minimal surface workflow");
    await panel.getByTestId("project-tags").fill("geometry, research");
    await panel.getByTestId("project-thumbnail").setInputFiles({ name: "thumbnail.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await expect(panel.getByTestId("project-message")).toContainText("Thumbnail ready");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Catenary research”");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.identity).toEqual(before.identity);
    expect(saved.workspace).toEqual(before.workspace);
    const firstCard = panel.getByTestId(`project-library-${saved.identity.id}`);
    await expect(firstCard.locator("img")).toBeVisible();
    await firstCard.getByRole("button", { name: "Favorite Catenary research", exact: true }).click();
    await panel.getByTestId("project-new").click();
    await panel.getByTestId("project-title").fill("Second study");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Second study”");
    const activeId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id);
    expect(activeId).not.toBe(saved.identity.id);
    await expect(panel.getByTestId("project-library").locator("article").first()).toHaveAttribute("data-testid", `project-library-${saved.identity.id}`);
    await panel.getByTestId("project-library-search").fill("geometry");
    await expect(panel.getByTestId("project-library").locator("article")).toHaveCount(1);
    await firstCard.getByTestId(`project-preview-${saved.identity.id}`).click();
    await expect(panel.getByTestId("project-description")).toHaveValue("Minimal surface workflow");
    await expect(panel.getByTestId("project-tags")).toHaveValue("geometry, research");
    await expect(panel.getByTestId("project-description")).toBeDisabled();
    await expect(firstCard).toContainText("Viewed");
    await panel.getByTestId("project-current").click();
    await expect(panel.getByTestId("project-title")).toHaveValue("Second study");
    await page.reload();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await expect(firstCard.getByRole("button", { name: "Favorite Catenary research", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(firstCard).toContainText("Viewed");
    await firstCard.getByTestId(`project-preview-${saved.identity.id}`).click();
    await expect(panel.getByTestId("project-description")).toHaveValue("Minimal surface workflow");
    await panel.screenshot({ path: test.info().outputPath("project-library-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.screenshot({ path: test.info().outputPath("project-library-phone.png") });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.evaluate((id) => localStorage.removeItem(`math3d.project.v1.payload.${id}.thumbnail`), saved.identity.id);
    await panel.getByTestId("project-current").click();
    await expect(firstCard.getByTestId("project-thumbnail-fallback")).toBeVisible();
    const payloads = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project.v1"))));
    await page.evaluate(() => localStorage.setItem("math3d.project-library.v1", "{broken index"));
    await panel.getByTestId("project-current").click();
    await expect(panel.getByTestId("project-library-message")).toContainText("Library unavailable");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Project save failed");
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project.v1"))))).toEqual(payloads);
  } finally { await closeSurfaceApp(ctx); }
});
