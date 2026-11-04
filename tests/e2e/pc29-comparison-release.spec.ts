import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";
import { pc29ComparisonProject } from "./helpers/pc29ComparisonFixture";

test("PC29 desktop reopens the portable multi-feature comparison and releases its viewers", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const fixture = pc29ComparisonProject();
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, controls = freezeControls(page), panel = controls.panel;
    await controls.importOpen(fixture.raw);
    const saved = await controls.save();
    expect(saved.workspace.results).toHaveLength(3);
    await page.reload(); await controls.reopen(fixture.projectId);
    const review = panel.getByTestId("project-saved-mesh-comparisons");
    await expect(review.locator("article")).toHaveCount(3);
    await panel.getByTestId("project-open-mesh-result-trend").click();
    const trend = page.getByTestId("project-mesh-result-trend");
    await trend.getByTestId("project-mesh-trend-anchor").selectOption(fixture.resultIds[0]!);
    await trend.getByTestId("project-mesh-trend-metric").selectOption("metrics.triangleArea.avg");
    await expect(trend.getByTestId("project-mesh-trend-status")).toContainText("3 verified recorded points");
    await trend.getByTestId(`project-mesh-trend-point-${fixture.resultIds[1]}`).locator("circle").click();
    await trend.getByTestId("project-mesh-trend-open-result").click();
    const result = panel.getByTestId("project-result-detail");
    await expect(result).toContainText(fixture.resultIds[1]!);
    await result.getByTestId("project-open-exact-mesh-generation").click();
    const generation = page.getByTestId("project-mesh-generation-preview");
    await expect.poll(() => generation.locator("canvas").count()).toBeGreaterThan(0);
    await generation.getByRole("button", { name: "Return to saved result" }).click();
    await expect(generation).toHaveCount(0);
    await review.getByTestId(`project-open-pinned-mesh-${fixture.pairIds[0]}`).click();
    const pair = page.getByTestId("project-mesh-result-comparison");
    await expect(pair.getByTestId("project-mesh-result-status")).toContainText("compatible");
    const pairReport = test.info().outputPath("pc29-pair.html");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), pairReport);
    await pair.getByTestId("project-mesh-result-export").click();
    await expect.poll(() => { try { return readFileSync(pairReport, "utf8").includes(fixture.resultIds[0]!); } catch { return false; } }).toBe(true);
    await pair.getByTestId("project-mesh-result-return").click();
    await panel.getByRole("button", { name: "Documents", exact: true }).click();
    await panel.getByTestId(`project-open-workbook-${fixture.workbookId}`).click();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    const coordinate = page.getByTestId("workbook-coordinate-review").first();
    await coordinate.getByText("Show embedded coordinate review").click();
    await expect(coordinate.getByTestId(`workbook-coordinate-review-row-${fixture.noteId}`)).toContainText("verified");
    await coordinate.getByRole("button", { name: "Open saved marker" }).click();
    const comparison = page.getByTestId("project-composition-view");
    await expect(comparison.getByLabel("Saved composition")).toHaveValue(fixture.compositionId);
    await expect(comparison.getByTestId("project-composition-probe-status")).toContainText("Saved coordinate");
    const canvas = await comparison.locator("canvas").first().elementHandle();
    await comparison.getByRole("button", { name: "Close" }).click();
    await expect(comparison).toHaveCount(0);
    if (canvas) await expect.poll(() => canvas.evaluate(element => ({ connected: element.isConnected,
      contextLost: (element as HTMLCanvasElement).getContext("webgl2")?.isContextLost() ?? false })))
      .toEqual({ connected: false, contextLost: true });
  } finally { await closeSurfaceApp(ctx); }
});
