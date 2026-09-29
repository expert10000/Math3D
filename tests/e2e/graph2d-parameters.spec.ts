import { expect, test } from "@playwright/test";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

test("G2D38 Electron parameter preview, command history, deterministic playback and local frame export", async ({}, info) => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page; await resetSurfaceAppState(page); await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
    await page.getByLabel("Search graphs").fill("Two slopes"); await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
    await page.getByTestId("graph2d-parameters-open").click(); const panel = page.getByTestId("graph2d-parameters");
    await panel.getByRole("button", { name: "Configure a", exact: true }).click(); await panel.getByLabel("Parameter unit", { exact: true }).fill("ratio");
    await panel.getByRole("button", { name: "Save parameter", exact: true }).click();
    const value = panel.getByLabel("a preview value", { exact: true }), before = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
    await value.fill("3"); await expect(page.getByTestId("graph2d-update-status")).toContainText("not saved");
    expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(before);
    await panel.getByRole("button", { name: "Apply preview value", exact: true }).click(); await expect(value).toHaveValue("3");
    await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+z"); await expect(value).toHaveValue("2");
    await page.keyboard.press("Control+y"); await expect(value).toHaveValue("3");
    await panel.getByLabel("Animation from", { exact: true }).fill("-1"); await panel.getByLabel("Animation to", { exact: true }).fill("1");
    await panel.getByLabel("Animation frames", { exact: true }).fill("3");
    await panel.getByRole("button", { name: "Play animation", exact: true }).click(); await expect(panel).toContainText("Frame 3 / 3");
    await expect(panel.getByRole("button", { name: "Play animation", exact: true })).toBeEnabled(); await expect(value).toHaveValue("1");
    await panel.getByRole("button", { name: "Prepare frame export", exact: true }).click(); await expect(panel.getByRole("button", { name: "Download frame report", exact: true })).toBeEnabled();
    for (const format of ["html", "csv"]) {
      const path = resolve(info.outputPath(`frames.${format}`));
      await app.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), path);
      await panel.getByRole("button", { name: format === "html" ? "Download frame report" : "Download frame manifest", exact: true }).click();
      await expect.poll(() => existsSync(path) && readFileSync(path).length > 0).toBe(true);
      const text = readFileSync(path, "utf8"); expect(text).toContain("ratio");
      if (format === "html") expect(text.match(/<svg /g)).toHaveLength(3); else expect(text).toContain('"2","0.2","a","1"');
    }
    await panel.getByRole("button", { name: "Cancel preview", exact: true }).click(); await expect(value).toHaveValue("3");
    await page.screenshot({ path: info.outputPath("parameters-electron.png") });
  } finally { await closeSurfaceApp(app); }
});

test("G2D38 Electron retains curves throughout delayed pan and zoom resampling", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page; await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
    await page.getByLabel("Search graphs").fill("Two slopes"); await page.getByRole("button", { name: "Open Two slopes", exact: true }).click();
    await expect(page.getByTestId("graph2d-update-status")).not.toBeVisible();
    await page.evaluate(() => { const Native = window.Worker; window.Worker = class extends Native {
      postMessage(message: unknown) { if ((message as { request?: unknown }).request) return; super.postMessage(message); }
    }; });
    const viewer = page.getByTestId("main-viewer"), box = (await viewer.boundingBox())!, curve = page.locator('[data-graph2d-path="function_2"]');
    await page.mouse.move(box.x + box.width * .25, box.y + box.height * .6); await page.mouse.down();
    for (let i = 1; i <= 4; i++) { await page.mouse.move(box.x + box.width * .25 + i * 5, box.y + box.height * .6); await expect(curve).toHaveAttribute("d", /[ML]/); }
    await page.mouse.up(); await page.mouse.wheel(0, -40); await expect(curve).toHaveAttribute("d", /[ML]/);
    await expect(page.getByTestId("graph2d-update-status")).toContainText("samples remain visible");
  } finally { await closeSurfaceApp(app); }
});
