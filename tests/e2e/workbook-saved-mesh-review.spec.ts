import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";

test("PC23 reopens and exports a three-pair Workbook review and navigates to its saved pair", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, controls = freezeControls(page), panel = controls.panel;
    await controls.show();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-library-search").fill("Saved Mesh Comparison Review");
    await panel.getByTestId("project-template-open-mesh-comparison-review").click();
    const saved = await controls.save();
    await controls.hide();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    const editor = page.getByTestId("workbook-saved-mesh-review-editor").first();
    await expect(editor.locator('input[type="checkbox"]')).toHaveCount(3);
    for (const checkbox of await editor.locator('input[type="checkbox"]').all()) await checkbox.check();
    await editor.getByRole("button", { name: "Link selected saved pairs" }).click();
    const review = page.getByTestId("workbook-saved-mesh-review").first();
    await review.getByText("Show embedded comparison review").click();
    await expect(review.locator("article")).toHaveCount(3);
    await expect(review).toContainText("Review observation 1");
    await expect(review).toContainText("2.03125");
    const report = test.info().outputPath("pc23-workbook-review.html");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), report);
    await review.getByRole("button", { name: "Export review status HTML" }).click();
    await expect.poll(() => { try { return readFileSync(report).length > 0; } catch { return false; } }, { timeout: 30_000 }).toBe(true);
    expect(readFileSync(report, "utf8")).toContain(saved.savedMeshComparisons[2].b.sourceHash);
    await controls.show();
    await panel.getByTestId("project-save-active-workbook").click();
    await expect(panel.getByTestId("project-message")).toContainText("Added");
    const withBook = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const workbookId = withBook.workbooks?.find((item: { id: string }) =>
      !saved.workbooks?.some((prior: { id: string }) => prior.id === item.id))?.id;
    expect(workbookId).toBeTruthy();
    await page.reload();
    await controls.reopen(saved.identity.id);
    await panel.getByTestId(`project-open-workbook-${workbookId}`).click();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    const reopened = page.getByTestId("workbook-saved-mesh-review").first();
    await reopened.getByText("Show embedded comparison review").click();
    await expect(reopened.locator("article")).toHaveCount(3);
    await reopened.getByTestId("workbook-review-row-review-pair-2").getByRole("button", { name: "Open saved pair" }).click();
    await expect(page.getByTestId("project-mesh-result-comparison")).toContainText("Saved review pair 2");
  } finally { await closeSurfaceApp(ctx); }
});
