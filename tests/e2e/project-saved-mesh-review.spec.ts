import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";

test("PC21–22 reviews and exports several saved Mesh pairs after restart", async () => {
  test.setTimeout(150_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, controls = freezeControls(page), panel = controls.panel;
    await controls.show();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-library-search").fill("Saved Mesh Comparison Review");
    await panel.getByTestId("project-template-open-mesh-comparison-review").click();
    const index = panel.getByTestId("project-saved-mesh-comparisons");
    await expect(index.locator("article")).toHaveCount(3);
    await expect(index.getByText("1 verified / 1 saved observations")).toHaveCount(2);
    await expect(index.getByText("0 verified / 0 saved observations")).toHaveCount(1);
    const saved = await controls.save();
    const report = test.info().outputPath("pc22-saved-mesh-review.html");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), report);
    await index.getByTestId("project-mesh-review-export").click();
    await expect.poll(() => { try { return readFileSync(report).length > 0; } catch { return false; } }).toBe(true);
    expect(readFileSync(report, "utf8")).toContain("Review observation 2");
    expect(readFileSync(report, "utf8")).toContain("Saved review pair 3");
    await index.getByTestId("project-open-pinned-mesh-review-pair-3").click();
    await expect(page.getByTestId("project-mesh-result-comparison")).toContainText("Saved review pair 3");
    await page.getByTestId("project-mesh-result-return").click();
    const firstNote = saved.notes.find((note: { title: string }) => note.title === "Review observation 1").identity.id;
    await index.getByTestId(`project-mesh-review-note-${firstNote}`).click();
    await expect(panel.getByTestId(`project-note-${firstNote}`)).toContainText("Review observation 1");
    await page.reload();
    await controls.reopen(saved.identity.id);
    const reopened = panel.getByTestId("project-saved-mesh-comparisons");
    await expect(reopened.locator("article")).toHaveCount(3);
    await expect(reopened.getByTestId("project-mesh-review-status-review-pair-1")).toContainText("Verified");
    const afterRestart = test.info().outputPath("pc22-reopened-review.html");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), afterRestart);
    await reopened.getByTestId("project-mesh-review-export").click();
    await expect.poll(() => { try { return readFileSync(afterRestart).length > 0; } catch { return false; } }).toBe(true);
    expect(readFileSync(afterRestart, "utf8")).toContain(saved.savedMeshComparisons[0].a.sourceHash);
    await reopened.getByTestId("project-open-pinned-mesh-review-pair-1").click();
    await expect(page.getByTestId("project-mesh-result-comparison")).toContainText("Review observation 1");
  } finally { await closeSurfaceApp(ctx); }
});
