import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("M3D20-03 shares an exact Curve parameter while unlink keeps local probing", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByRole("button", { name: "Curves", exact: true }).first().click();
    await page.getByTestId("curve-inspector").getByTestId("shared-inspector-tab-selection").click();
    await page.getByRole("combobox", { name: "Selection view" }).selectOption("probe");
    await expect(page.getByTestId("curve-share-parameter")).toBeEnabled();
    await page.getByTestId("curve-share-parameter").click();
    await expect(page.getByTestId("curve-cursor-status")).toContainText("pinned to the shared cursor");
    await page.getByTestId("curve-cursor-link").click();
    await expect(page.getByTestId("curve-share-parameter")).toBeDisabled();
    await page.getByTestId("curve-arc-length-slider").fill("0.72");
    await expect(page.getByTestId("curve-probe-source")).toContainText("arc-length-slider");
    await page.getByTestId("curve-cursor-link").click();
    await page.getByTestId("curve-share-parameter").click();
    await expect(page.getByTestId("curve-cursor-status")).toContainText("pinned to the shared cursor");
  } finally { await closeSurfaceApp(ctx); }
});
