import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Gallery research path survives restart and returns to its source", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenary-study").click();
    await expect(panel.getByTestId("project-study-view")).toBeVisible({ timeout: 60_000 });
    if (process.env.MATH3D_UI_CAPTURE_DIR) {
      const directory = process.env.MATH3D_UI_CAPTURE_DIR;
      mkdirSync(directory, { recursive: true });
      await panel.getByTestId("project-study-view").evaluate(element =>
        element.scrollIntoView({ block: "start", inline: "start" }));
      await page.screenshot({ path: join(directory, "ui-guided-study.png") });
      await panel.getByRole("button", { name: "Source panes", exact: true }).click();
      await page.screenshot({ path: join(directory, "ui-guided-study-source-pins.png") });
      writeFileSync(join(directory, "ui-desktop-build-identity.json"), readFileSync("dist/build-identity.json"));
    }
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile); page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    await openLastSavedProject(page);
    const palette = page.getByTestId("global-command-palette");
    const search = async (query: string) => {
      await page.keyboard.press("Control+k");
      await expect(palette).toBeVisible();
      await palette.getByRole("textbox").fill(query);
    };
    await search("open study minimal");
    const studyCommand = palette.locator('[data-testid^="command-palette-research:study:"]').first();
    await expect(studyCommand).toHaveAttribute("aria-disabled", "false", { timeout: 60_000 });
    await studyCommand.click();
    await expect(panel.getByTestId("project-study-view")).toBeVisible();
    await search("inspect result");
    if (process.env.MATH3D_UI_CAPTURE_DIR)
      await page.screenshot({ path: join(process.env.MATH3D_UI_CAPTURE_DIR, "ui-research-palette.png") });
    await palette.locator('[data-testid^="command-palette-research:result:"]').first().click();
    await expect(panel.getByTestId("project-detail-tab-results")).toHaveAttribute("aria-current", "page");
    await search("open workbook catenary");
    await palette.locator('[data-testid^="command-palette-research:workbook:"]').first().click();
    await expect(page.getByText("Workbook: Catenary, catenoid and derivative Research", { exact: false }).first()).toBeVisible();
    await search("open note");
    await palette.locator('[data-testid^="command-palette-research:note:"]').first().click();
    await expect(panel.getByTestId("project-notes-panel")).toBeVisible();
    await search("open source");
    await palette.locator('[data-testid^="command-palette-research:document:"]:not([aria-disabled="true"])').first().click();
    await expect(panel.getByTestId("project-breadcrumb")).toBeVisible();
    await search("open projects gallery");
    await palette.getByTestId("command-palette-research:gallery").click();
    await panel.getByTestId("project-gallery-guided").click();
    await expect(panel.locator(".curated-study-card")).toHaveCount(15);
    await panel.getByTestId("project-research-nav-source").click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("module-workspace")).toBeFocused();
  } finally { await closeSurfaceApp(ctx); }
});
