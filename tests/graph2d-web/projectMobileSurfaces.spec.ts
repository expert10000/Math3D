import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("PRJ30 browser retains complete Surface packages and saved histories through exact export and reload", async ({ page }) => {
  const output = resolve(process.env.MATH3D_PRJ30_BROWSER_OUTPUT ?? test.info().outputPath("surfaces")); mkdirSync(output, { recursive: true });
  execFileSync(process.execPath, ["scripts/projects-mobile-surfaces.mjs", "generate", output]);
  const input = process.env.MATH3D_PRJ30_RETURN ?? resolve(output, "input.math3d.project-package.json"), raw = readFileSync(input, "utf8"), pkg = JSON.parse(raw);
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("projects-toggle").click(); const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles({ name: "mobile-surfaces.json", mimeType: "application/json", buffer: Buffer.from(raw) });
  await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
  const exportExact = async (name: string) => {
    const download = page.waitForEvent("download"); await panel.getByTestId("project-export-resources").click();
    const item = await download, file = resolve(output, name); await item.saveAs(file); expect(readFileSync(file, "utf8")).toBe(raw); return file;
  };
  await exportExact("browser-return.math3d.project-package.json");
  await page.reload(); await page.getByTestId("projects-toggle").click();
  await panel.getByTestId(`project-preview-${pkg.project.identity.id}`).click(); await panel.getByTestId("project-restore-saved").click();
  await expect(panel.getByTestId("project-import-open")).toBeEnabled();
  await exportExact("browser-reloaded.math3d.project-package.json");
  await panel.getByTestId("project-import-open").click(); await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
  if (process.env.MATH3D_PRJ30_RETURN) {
    const manifest = JSON.parse(readFileSync(resolve(output, "manifest.json"), "utf8"));
    await panel.getByTestId(`project-open-${manifest.surfaceId}`).click(); if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click();
    await expect(page.getByLabel("z(u,v)", { exact: true })).toHaveValue("u*u-v*v+2");
    await page.getByTestId("project-editor-undo").click(); await expect(page.getByLabel("z(u,v)", { exact: true })).toHaveValue("u*u-v*v");
    await page.getByTestId("project-editor-redo").click(); await expect(page.getByLabel("z(u,v)", { exact: true })).toHaveValue("u*u-v*v+2");
  }
  await page.screenshot({ path: resolve(output, "browser-preview.png") });
});
