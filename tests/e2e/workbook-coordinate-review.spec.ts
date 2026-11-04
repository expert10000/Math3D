import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";

test("PC27 saves a coordinate review in a Workbook and reopens its verified marker", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, controls = freezeControls(page), panel = controls.panel;
    await controls.show();
    await panel.getByTestId("project-template-open-mesh-geometry-probe").click();
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByLabel("Saved composition").selectOption({ label: "Mesh / Geometry · shared metres" });
    const source = view.getByRole("region", { name: /B: Declared metre sphere/ });
    const target = view.getByRole("region", { name: /A: Declared metre Mesh/ });
    await view.getByLabel("Comparison observation title").fill("PC27 shared coordinate");
    await view.getByLabel("Comparison observation body").fill("Authored position for Workbook review.");
    const canvas = source.locator("canvas").first(), bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Geometry source canvas unavailable.");
    for (const [x, y] of [[0.5, 0.5], [0.4, 0.45], [0.6, 0.55]]) {
      await canvas.click({ position: { x: bounds.width * x, y: bounds.height * y } });
      if (await target.getByTestId("project-composition-linked-coordinate").count()) break;
    }
    await expect(view.getByTestId("project-comparison-save-coordinate")).toBeEnabled();
    await view.getByTestId("project-comparison-save-coordinate").click();
    await expect(view.getByText("Coordinate observation saved with both exact source generations.")).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).notes?.length ?? 0)).toBe(1);
    const note = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).notes[0]);
    await view.getByRole("button", { name: "Close" }).click();
    await controls.hide();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    const editor = page.getByTestId("workbook-coordinate-review-editor").first();
    await expect(editor.locator('input[type="checkbox"]')).toHaveCount(1);
    await editor.locator('input[type="checkbox"]').check();
    await editor.getByRole("button", { name: "Link selected coordinate Notes" }).click();
    const review = page.getByTestId("workbook-coordinate-review").first();
    await review.getByText("Show embedded coordinate review").click();
    await expect(review.getByTestId("workbook-coordinate-marker")).toBeVisible();
    const path = test.info().outputPath("pc27-coordinate-review.html");
    await ctx.app.evaluate(({ session }, targetPath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(targetPath)), path);
    await review.getByRole("button", { name: "Export coordinate review HTML" }).click();
    await expect.poll(() => { try { return readFileSync(path, "utf8").includes("PC27 shared coordinate"); } catch { return false; } }).toBe(true);
    await controls.show();
    await panel.getByTestId("project-save-active-workbook").click();
    await expect(panel.getByTestId("project-message")).toContainText("Added");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const workbookId = saved.workbooks?.[saved.workbooks.length - 1]?.id;
    await page.reload();
    await controls.reopen(saved.identity.id);
    await panel.getByTestId(`project-open-workbook-${workbookId}`).click();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: /^3 Visualize$/ }).click();
    const reopened = page.getByTestId("workbook-coordinate-review").first();
    await reopened.getByText("Show embedded coordinate review").click();
    await expect(reopened.getByTestId("workbook-coordinate-marker")).toBeVisible();
    await reopened.getByRole("button", { name: "Open saved marker" }).click();
    await expect(view.getByTestId("project-composition-probe-status")).toContainText("Saved coordinate");
    await expect(view.getByLabel("Saved composition")).toHaveValue(note.anchor.compositionId);
    const handle = await view.locator("canvas").first().elementHandle();
    await view.getByRole("button", { name: "Close" }).click();
    await expect(view).toHaveCount(0);
    if (handle) await expect.poll(() => handle.evaluate(element => ({ connected: element.isConnected,
      contextLost: (element as HTMLCanvasElement).getContext("webgl2")?.isContextLost() ?? false })))
      .toEqual({ connected: false, contextLost: true });
  } finally { await closeSurfaceApp(ctx); }
});
