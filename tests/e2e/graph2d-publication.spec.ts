import { expect, test } from "@playwright/test";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

test("G2D36 Electron saves all publication formats without changing its Graph checkpoint", async ({}, info) => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page; await resetSurfaceAppState(page); await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
    await page.getByLabel("Search graphs").fill("Two slopes"); await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
    const before = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
    await page.getByTestId("graph2d-export-open").click(); const dialog = page.getByTestId("graph2d-export");
    await dialog.getByLabel("Image size").selectOption("640x480"); await expect(dialog.getByRole("button", { name: "Export PNG", exact: true })).toBeEnabled();
    const snapshot = await dialog.locator("code").textContent();
    for (const format of ["svg", "png", "csv", "html"]) {
      const path = resolve(info.outputPath(`publication.${format}`));
      await app.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), path);
      await dialog.getByRole("button", { name: format === "html" ? "Export HTML report" : `Export ${format.toUpperCase()}`, exact: true }).click();
      await expect.poll(() => existsSync(path) && readFileSync(path).length > 0).toBe(true);
      if (format === "png") expect([...readFileSync(path).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      else expect(readFileSync(path, "utf8")).toContain(snapshot!);
    }
    await page.screenshot({ path: info.outputPath("export-dialog.png") });
    expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(before);
    await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(page.getByTestId("graph2d-export-open")).toBeFocused();
  } finally { await closeSurfaceApp(app); }
});
