import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("guided Study keeps source and citation status usable at narrow width", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.setViewportSize({ width: 760, height: 900 });
    await page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    await panel.getByTestId("curated-study-open-catenary-study").click();
    const study = panel.getByTestId("project-study-view"), panes = study.getByTestId("project-study-panes");
    await expect(study).toBeVisible({ timeout: 60_000 });
    await expect(panes.locator('[data-testid^="project-study-source-status-"]').first()).toContainText("Saved source pin: current");
    const first = await panes.locator(".project-study-pane").nth(0).boundingBox();
    const second = await panes.locator(".project-study-pane").nth(1).boundingBox();
    expect(first && second && second.y > first.y + first.height - 2).toBeTruthy();
    await study.getByRole("button", { name: "Citations", exact: true }).click();
    await expect(study.getByTestId("project-study-workbook-references")).toBeFocused();
    await expect(study.getByTestId("project-study-workbook-references")).toContainText("Exact citation");
    await study.getByRole("button", { name: "Source panes", exact: true }).click();
    await expect(panes).toBeFocused();
    expect(await study.evaluate(element => element.scrollWidth <= element.clientWidth + 2)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
    const zoomedFirst = await panes.locator(".project-study-pane").nth(0).boundingBox();
    const zoomedSecond = await panes.locator(".project-study-pane").nth(1).boundingBox();
    expect(zoomedFirst && zoomedSecond && zoomedSecond.y > zoomedFirst.y + zoomedFirst.height - 2).toBeTruthy();
  } finally { await closeSurfaceApp(ctx); }
});
