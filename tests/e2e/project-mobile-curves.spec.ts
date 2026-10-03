import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";

test("PRJ27 delivers complete Curve packages and restores actual Samsung Graph/Curve histories", async () => {
  const output = resolve(process.env.MATH3D_PRJ27_OUTPUT ?? test.info().outputPath("curves")); mkdirSync(output, { recursive: true });
  execFileSync(process.execPath, ["scripts/projects-mobile-curves.mjs", "generate", output]);
  const input = process.env.MATH3D_PRJ27_RETURN ?? resolve(output, "input.math3d.project-package.json"), raw = readFileSync(input, "utf8"), packaged = JSON.parse(raw);
  const manifest = JSON.parse(readFileSync(resolve(output, "manifest.json"), "utf8"));
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const controls = freezeControls(ctx.page); await controls.show();
    await controls.panel.getByTestId("project-import-file").setInputFiles({ name: "mobile-curves.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    await controls.panel.getByTestId("project-import-save").click(); await expect(controls.panel.getByTestId("project-message")).toContainText("Imported into the library");
    const filename = resolve(output, "desktop-export.math3d.project-package.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), filename);
    await controls.panel.getByTestId("project-export-resources").click(); await expect.poll(() => existsSync(filename)).toBe(true);
    expect(readFileSync(filename, "utf8")).toBe(raw);
    if (process.env.MATH3D_PRJ27_RETURN) {
      execFileSync(process.execPath, ["scripts/projects-mobile-curves.mjs", "verify", filename, output]);
      const result = JSON.parse(readFileSync(resolve(output, "returned-verification.json"), "utf8"));
      await controls.reopen(packaged.project.identity.id); await controls.open(result.graphId);
      const path = ctx.page.getByTestId("main-viewer").locator(`[data-graph2d-path="${packaged.project.workspace.entries.find((entry: any) => entry.expected.id === result.graphId).checkpoint.source.objects[0].id}"]`);
      const before = await path.getAttribute("d"); await ctx.page.getByTestId("main-viewer").focus(); await ctx.page.keyboard.press("Control+z");
      await expect.poll(() => path.getAttribute("d")).not.toBe(before); await ctx.page.keyboard.press("Control+Shift+z"); await expect.poll(() => path.getAttribute("d")).toBe(before);
      await controls.open(result.curveId);
      await expect(ctx.page.locator('input[value="x*x+5"]')).toBeVisible();
      await ctx.page.getByTestId("project-editor-undo").click(); await expect(ctx.page.locator('input[value="x*x+4"]')).toBeVisible();
      await ctx.page.getByTestId("project-editor-redo").click(); await expect(ctx.page.locator('input[value="x*x+5"]')).toBeVisible();
      await ctx.page.screenshot({ path: resolve(output, "desktop-return-curve.png") });
    } else {
      await controls.reopen(packaged.project.identity.id); await controls.open(manifest.helixId);
      await expect(ctx.page.getByTestId("curve-kernel-document")).toContainText(manifest.helixId);
    }
  } finally { await closeSurfaceApp(ctx); }
});
