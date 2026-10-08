import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Catenoid defaults to the full Surface module and explicitly opens Custom", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    let page = ctx.page;
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    let owner = page.getByTestId("project-source-editor");
    const id = (await owner.getAttribute("data-document-id"))!, hash = (await owner.getAttribute("data-source-hash"))!;
    const normal = async () => {
      await expect(page.getByTestId("module-workspace")).toBeVisible();
      await expect(page.getByTestId("surface-left-panel")).toBeVisible();
      await expect(page.getByTestId("surface-right-panel")).toBeVisible();
      await expect(page.getByTestId("surface-primary-viewer")).toBeVisible();
      await expect(page.locator(".document-workspace")).toHaveCount(0);
      await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-workbench", "module");
      await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-source-hash", hash);
      await expect(page.getByTestId("document-module-inspector").getByTestId("mesh-kernel-document")).toHaveCount(0);
      await expect(page.getByTestId("surface-viewer-canvas-host")).toHaveCount(1);
      const size = await page.getByTestId("surface-viewer-canvas-host").boundingBox();
      expect(size!.height).toBeGreaterThan(200); expect(size!.width).toBeGreaterThan(200);
    };
    await normal();
    const panel = page.getByTestId("project-explorer-panel");
    await expect(panel).toHaveAttribute("data-project-placement", "left");
    await expect(page.getByTestId("surface-left-panel").getByTestId("project-document-tree")).toBeVisible();
    await page.getByRole("navigation", { name: "Surface left dock" }).getByRole("button", { name: "Surface controls" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("surface-gallery-project-selection")).toContainText("catenoid · Project Surface");
    await expect(page.getByTestId("param-constructed-subtype-rotational")).toBeVisible();
    await expect(page.getByTestId("document-module-inspector")).toContainText(/Display: [\d, ]+ V/);
    await page.screenshot({ path: test.info().outputPath("surface-module-primary.png") });
    await page.getByTestId("surface-left-panel").getByRole("button", { name: "Edit saved Surface", exact: true }).click();
    await expect(page.getByTestId("saved-surface-module-source")).toBeVisible();
    await page.getByTestId("project-source-json").locator("summary").click();
    const draft = "Unapplied draft belongs to the saved Catenoid.";
    await page.getByTestId("project-source-definition").fill(draft);
    await page.getByTestId("document-custom-view").click();
    await expect(page.getByTestId("module-workspace")).toHaveCount(0);
    await expect(page.locator(".document-workspace")).toBeVisible();
    await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-workbench", "custom");
    await expect(page.getByTestId("document-surface-inspector")).toBeVisible();
    await owner.getByRole("tab", { name: "Source/Object", exact: true }).click();
    await owner.getByTestId("project-source-json").locator("summary").click();
    await expect(page.getByTestId("project-source-definition")).toHaveValue(draft);
    await page.getByTestId("document-custom-view").click();
    await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-workbench", "custom");
    await page.getByTestId("document-view-choice").selectOption("sampled");
    await page.screenshot({ path: test.info().outputPath("catenoid-custom.png") });
    await page.getByTestId("document-surface-view").click(); await normal();
    await page.getByTestId("document-surface-view").click(); await normal();
    await page.getByTestId("surfaces-left-tab-object").click();
    await page.getByTestId("project-source-json").locator("summary").click();
    await expect(page.getByTestId("project-source-definition")).toHaveValue(draft);
    await page.getByRole("navigation", { name: "Surface left dock" }).getByRole("button", { name: "Project", exact: true }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    for (const module of ["graph2d", "mesh"]) {
      const entry = saved.workspace.entries.find((value: any) => value.module === module);
      await panel.getByTestId(`project-tree-document-${entry.expected.id}`).click();
      await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", entry.expected.id);
      await panel.getByTestId(`project-tree-document-${id}`).click(); await normal();
    }
    await page.getByTestId("document-custom-view").click();
    await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-view", "sampled");
    await page.getByTestId("document-surface-view").click(); await normal();
    await panel.getByTestId("project-placement-middle").click();
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText(/Saved/);
    await panel.getByTestId("project-placement-left").click();
    const profile = ctx.profileDir; await ctx.app.close(); ctx = null;
    ctx = await launchSurfaceApp({}, profile); page = ctx.page; owner = page.getByTestId("project-source-editor");
    page.on("pageerror", error => errors.push(error.message));
    await expect(owner).toHaveAttribute("data-document-id", id); await normal();
    await page.getByTestId("document-custom-view").click();
    await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-view", "sampled");
    await expect(owner).toHaveAttribute("data-source-hash", hash);
    await page.getByTestId("project-source-back-to-module").click();
    await expect(owner).toHaveCount(0);
    await expect(page.getByTestId("module-workspace")).toBeVisible();
    await expect(page.getByTestId("surface-gallery-project-selection")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await closeSurfaceApp(ctx); }
});

test("opening Catenoid reveals the left Project tree from collapsed and focused docks", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    const left = page.getByTestId("workspace-dock-left-toggle");
    await left.click(); await page.getByTestId("workspace-dock-right-toggle").click();
    await page.getByRole("button", { name: "Focus", exact: true }).click();
    await expect(page.getByTestId("surface-left-panel")).not.toBeVisible();
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    const visibleProject = async () => {
      await expect(page.getByTestId("surface-left-panel")).toBeVisible();
      await expect(page.getByTestId("surface-right-panel")).toBeVisible();
      await expect(panel).toBeVisible(); await expect(panel).toHaveAttribute("data-project-placement", "left");
      await expect(page.getByTestId("surface-left-panel").getByTestId("project-document-tree")).toBeVisible();
      await expect(page.getByTestId("document-module-inspector")).toBeVisible();
    };
    await visibleProject();
    const owner = page.getByTestId("project-source-editor"), id = (await owner.getAttribute("data-document-id"))!, hash = (await owner.getAttribute("data-source-hash"))!;
    await left.click(); await expect(panel).not.toBeVisible();
    await page.getByTestId("projects-quick-toggle").click(); await visibleProject();
    await page.getByRole("button", { name: "Focus", exact: true }).click(); await expect(panel).not.toBeVisible();
    await page.getByTestId("projects-quick-toggle").click(); await visibleProject();
    await panel.getByTestId("project-placement-right").click();
    await expect(panel).toHaveAttribute("data-project-placement", "right");
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-detail-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click(); await visibleProject();
    await expect(owner).toHaveAttribute("data-document-id", id); await expect(owner).toHaveAttribute("data-source-hash", hash);
    const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id);
    await panel.getByTestId("project-placement-right").click();
    await panel.getByTestId("project-gallery-layout-toggle").click(); await panel.getByTestId("project-detail-toggle").click();
    await page.getByTestId(`project-open-saved-${projectId}`).click(); await visibleProject();
    await expect(owner).toHaveAttribute("data-document-id", id); await expect(owner).toHaveAttribute("data-source-hash", hash);
    await page.screenshot({ path: test.info().outputPath("project-left-after-hidden-docks.png") });
  } finally { await closeSurfaceApp(ctx); }
});
