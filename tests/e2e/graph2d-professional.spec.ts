import { expect, test } from "@playwright/test";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("G2D40 Electron professional scales, checked regression and frozen local publication", async ({}, info) => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page; await resetSurfaceAppState(page); await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
    await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
    const scales = page.getByRole("button", { name: "Scales", exact: true }); await scales.focus(); await page.keyboard.press("Enter");
    await expect(page.getByTestId("graph2d-scales").getByLabel("X scale", { exact: true })).toBeFocused();
    await page.keyboard.press("Escape"); await expect(scales).toBeFocused();
    await page.getByTestId("main-viewer").focus(); for (let i = 0; i < 4; i++) await page.keyboard.press("-");
    await page.getByRole("button", { name: "Show continuation", exact: true }).click();
    await expect.poll(() => page.locator("[data-graph2d-continuation]").first().getAttribute("d")).not.toBe("");
    const functions = page.getByLabel("Graph functions"); await functions.getByRole("button", { name: "Add data series", exact: true }).click();
    await functions.getByLabel("Data series name").fill("Measurements");
    await functions.getByLabel("Data series import").fill("x,y\n0,1\n1,3\n2,4\n3,7\n4,8\n5,12");
    await functions.getByRole("button", { name: "Save data series", exact: true }).click();
    await functions.getByRole("button", { name: "Select Measurements", exact: true }).click();
    const panel = page.getByRole("region", { name: "Regression fitting", exact: true });
    await panel.getByRole("button", { name: "Fit dataset", exact: true }).click(); await expect(panel.getByRole("status")).toHaveText("Current regression");
    await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(1);
    const before = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
    await page.getByTestId("graph2d-export-open").click(); const dialog = page.getByTestId("graph2d-export");
    await dialog.getByLabel("Image size").selectOption("640x480");
    const outputs: Buffer[] = [];
    for (let i = 0; i < 2; i++) {
      const path = resolve(info.outputPath(`professional-${i}.html`));
      await app.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), path);
      await dialog.getByRole("button", { name: "Export HTML report", exact: true }).click();
      await expect.poll(() => existsSync(path) && readFileSync(path).length > 0).toBe(true); outputs.push(readFileSync(path));
    }
    expect(outputs[0]).toEqual(outputs[1]); expect(outputs[0].toString()).toContain("95% prediction"); expect(outputs[0].toString()).toContain("row_1");
    expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(before);
    await page.keyboard.press("Escape"); await expect(page.getByTestId("graph2d-export-open")).toBeFocused();
    await page.screenshot({ path: info.outputPath("professional-electron.png") });
  } finally { await closeSurfaceApp(app); }
});
