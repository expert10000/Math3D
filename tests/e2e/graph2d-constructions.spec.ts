import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("G2D48 promotes a probe, recomputes a dependent tangent, and undoes source edits", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: "Select Parabola", exact: true }).click();
    const panel = page.getByLabel("Graph inspector", { exact: true }).getByTestId("graph2d-constructions");
    const save = panel.getByRole("button", { name: "Save probe as point" });
    await expect(save).toBeEnabled();
    await save.click();
    const point = page.locator('[data-graph2d-construction="construction_1"]');
    await expect(point).toBeVisible();
    await panel.getByRole("button", { name: "Add tangent" }).click();
    const tangent = page.locator('[data-graph2d-construction="construction_2"]');
    await expect(tangent).toBeVisible();
    const before = await point.getAttribute("cy");
    await functions.getByRole("button", { name: "Edit Parabola", exact: true }).click();
    await functions.getByLabel("Function expression").fill("2*x^2");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    await expect.poll(() => point.getAttribute("cy")).not.toBe(before);
    await expect(tangent).toBeVisible();
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect.poll(() => point.getAttribute("cy")).toBe(before);
    await panel.getByLabel("x for Point 1").fill("1");
    await panel.getByRole("button", { name: "Move Point 1" }).click();
    await expect.poll(() => point.getAttribute("cy")).not.toBe(before);
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect.poll(() => point.getAttribute("cy")).toBe(before);
    await panel.getByRole("button", { name: "Delete Tangent" }).click();
    await panel.getByRole("button", { name: "Delete Point 1" }).click();
    await expect(page.locator("[data-graph2d-construction]")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
