import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("PC07 embeds an exact saved Project comparison in a Workbook Visualize block and refuses changed sources", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-template-open-surface-generation-study").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(project.compositions).toHaveLength(1);
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    const back = page.getByTestId("project-source-back-to-module");
    if (await back.isVisible()) await back.click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    const chooser = page.getByTestId("workbook-comparison-select").first();
    await expect(chooser).toBeEnabled();
    await chooser.selectOption(project.compositions[0].id);
    const link = page.getByTestId("workbook-comparison-link").first();
    await expect(link).toContainText("Exact composition and source generations referenced");
    await link.getByText("Show embedded comparison").click();
    await expect(link.getByTestId("workbook-comparison-preview")).toBeVisible();
    await expect(link.getByRole("region", { name: /A:/ }).locator("canvas").first()).toBeVisible();
    await expect(link.getByRole("region", { name: /B:/ }).locator("canvas").first()).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.workbooks.v1")!));
    expect(JSON.stringify(stored)).not.toContain("positions");
    await page.reload();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    await expect(page.getByTestId("workbook-comparison-link").first()).toContainText("Exact composition and source generations referenced");
    const changed = core.upsertMath3DProjectComposition(project, { ...project.compositions[0], title: "Changed composition" });
    await page.evaluate(raw => localStorage.setItem("math3d.project.v1", raw), core.serializeMath3DProject(changed));
    await page.reload();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    await expect(page.getByTestId("workbook-comparison-link").first()).toContainText("Comparison stale");
    await expect(page.getByTestId("workbook-comparison-preview")).toHaveCount(0);
  } finally { await closeSurfaceApp(ctx); }
});
