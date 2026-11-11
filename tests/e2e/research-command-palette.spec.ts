import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("global palette opens exact saved research and explains unavailable commands", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.keyboard.press("Control+k");
    const palette = page.getByTestId("global-command-palette");
    await expect(palette).toBeVisible();
    await expect(palette.getByTestId("command-palette-research:current-project")).toContainText("No Project is open");
    await palette.getByTestId("command-palette-research:gallery").click();
    const panel = page.getByTestId("project-explorer-panel");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenary-study").click();
    await expect(panel.getByTestId("project-study-view")).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press("Control+k");
    await palette.getByRole("textbox").fill("citation catenary");
    await expect(palette.locator('[data-testid^="command-palette-research:citation:"]').first()).toBeVisible();
    await palette.getByRole("textbox").fill("open study minimal");
    await palette.locator('[data-testid^="command-palette-research:study:"]').first().click();
    await expect(panel.getByTestId("project-study-view")).toBeVisible();
    await page.keyboard.press("Control+k");
    await palette.getByRole("textbox").fill("inspect result");
    await palette.locator('[data-testid^="command-palette-research:result:"]').first().click();
    await expect(panel.getByTestId("project-detail-tab-results")).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Control+k");
    await palette.getByRole("textbox").fill("open note");
    await palette.locator('[data-testid^="command-palette-research:note:"]').first().click();
    await expect(panel.getByTestId("project-notes-panel")).toBeVisible();
    await page.keyboard.press("Control+k");
    await palette.getByRole("textbox").fill("citation catenary");
    await palette.locator('[data-testid^="command-palette-research:citation:"]').first().click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByText("Workbook: Catenary, catenoid and derivative Research", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Stage: Compute", { exact: true })).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});
