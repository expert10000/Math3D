import { expect, test } from "@playwright/test";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { resolve } from "node:path";
const { graph2DScreenToWorld } = require(resolve("packages/core/src/index.ts"));

test("GGL10 Electron interactive presets preserve edited copies, undo a single scrub and keep wheel focus", async ({}, info) => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page; await resetSurfaceAppState(page); await page.setViewportSize({ width: 1440, height: 900 });
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!).entries.find((e: { module: string }) => e.module === "graph2d").checkpoint);
    const save = async () => { await page.getByTestId("kernel-workspace-toggle").click(); await page.getByTestId("kernel-workspace-save").click();
      await expect(page.getByTestId("kernel-workspace-message")).toContainText("Saved"); await page.getByTestId("kernel-workspace-toggle").click(); };
    const open = async () => { await page.getByTestId("graph-gallery-open").click(); const gallery = page.getByTestId("graph-gallery");
      await gallery.getByLabel("Search graphs").fill("Two slopes"); await gallery.getByRole("button", { name: "Preview Two slopes", exact: true }).click();
      await gallery.getByRole("button", { name: "Open interactive Two slopes", exact: true }).click(); };
    await page.getByTestId("workspace-nav-graphs").click(); await open();
    const id = (await saved()).identity.id; await page.getByTestId("graph2d-parameters-open").click();
    const panel = page.getByTestId("graph2d-parameters"), value = panel.getByLabel("a preview value", { exact: true });
    await expect(value).toHaveValue("2"); await expect(panel).toContainText("No active frame");
    for (const v of ["1", "1.5", "2.5"]) await value.fill(v);
    await panel.getByRole("button", { name: "Apply preview value", exact: true }).click(); await save();
    const committed = await saved(); expect(committed.source.variables[0].value).toBe(2.5);
    for (let i = 0; i < 3; i++) await open();
    await page.getByTestId("graph2d-parameters-open").click(); await expect(value).toHaveValue("2.5");
    await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+z"); await expect(value).toHaveValue("2");
    await page.keyboard.press("Control+y"); await expect(value).toHaveValue("2.5");
    await panel.getByRole("button", { name: "Play animation", exact: true }).click(); await expect(panel).toContainText("Frame 15 / 15");
    await panel.getByRole("button", { name: "Cancel preview", exact: true }).click(); await expect(value).toHaveValue("2.5");
    await page.getByTestId("graph-gallery-open").click(); const gallery = page.getByTestId("graph-gallery");
    await gallery.getByRole("button", { name: "Open Lissajous loops", exact: true }).click(); await open();
    expect((await saved()).identity.id).toBe(id); expect((await saved()).source).toEqual(committed.source);
    await expect(page.getByTestId("graph2d-update-status")).not.toBeVisible();
    const plot = page.getByTestId("graph2d-plot"), box = (await plot.boundingBox())!;
    const client = { x: Math.floor(box.x + box.width * .35), y: Math.floor(box.y + box.height * .65) };
    const dimensions = await plot.evaluate(el => { const v = (el as SVGSVGElement).viewBox.baseVal; return { width: v.width, height: v.height }; });
    const anchor = { x: (client.x - box.x) * dimensions.width / box.width, y: (client.y - box.y) * dimensions.height / box.height };
    const before = graph2DScreenToWorld((await saved()).display.viewport, dimensions, anchor);
    await page.mouse.move(client.x, client.y); await page.mouse.wheel(0, -100);
    await expect(page.getByTestId("graph2d-update-status")).not.toBeVisible(); await save();
    const after = graph2DScreenToWorld((await saved()).display.viewport, dimensions, anchor);
    expect(after.x).toBeCloseTo(before.x, 7); expect(after.y).toBeCloseTo(before.y, 7);
    await page.screenshot({ path: info.outputPath("ggl10-electron.png") });
  } finally { await closeSurfaceApp(app); }
});
