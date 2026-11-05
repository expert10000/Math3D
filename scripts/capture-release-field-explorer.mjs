#!/usr/bin/env node

import { _electron as electron } from "playwright";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(process.env.MATH3D_RELEASE_FIELD_OUT || join(root, "apps/public-site/src/assets/release-field-current"));
const profile = await mkdtemp(join(tmpdir(), "math3d-release-field-"));
const capturedAt = new Date().toISOString();
const entries = [];
await mkdir(output, { recursive: true });
const env = { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], cwd: root, env, timeout: 60_000 });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000));
  await page.getByTestId("workspace-nav-graphs").click();
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });

  async function capture(file, title, view) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(output, file), animations: "disabled" });
    entries.push({ file, module: "Scientific Field Explorer", title, view, capturedAt });
    process.stdout.write(`[release-field] ${file}\n`);
  }

  const examples = [
    ["Swirling flow volume", "swirling-flow"],
    ["Generated vortex 80³", "generated-vortex-80"],
    ["Measured Burgers vortex", "measured-burgers-vortex"],
  ];
  for (const [name, slug] of examples) {
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    const chooser = page.getByRole("dialog", { name: "Scientific field presets" });
    await chooser.getByLabel("Preset data type").selectOption("explorer");
    await chooser.getByRole("button", { name, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await capture(`${slug}-verified-source.png`, `${name} verified source`, "Source");
    await dialog.getByRole("button", { name: "Open in Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    await explorer.waitFor({ state: "visible" });
    await capture(`${slug}-explorer.png`, name, "Explorer");
    for (const tab of ["Layer", "Probe", "Analyze", "Provenance"]) {
      const control = explorer.getByRole("button", { name: tab, exact: true }).first();
      if (await control.isEnabled()) {
        await control.click();
        await capture(`${slug}-${tab.toLowerCase()}.png`, `${name} ${tab.toLowerCase()}`, tab === "Analyze" ? "Analysis" : "Inspector");
      }
    }
    await explorer.getByRole("button", { name: "Overview", exact: true }).first().click();
    for (const view of ["XY slice", "XZ slice", "YZ slice"]) {
      const control = explorer.getByRole("button", { name: view, exact: true }).first();
      if (await control.isEnabled()) {
        await control.click();
        await capture(`${slug}-${view.toLowerCase().replace(" ", "-")}.png`, `${name} ${view}`, "Slice");
      }
    }
    for (const [layout, slugSuffix] of [["Split views", "split"], ["Quad views", "quad"]]) {
      const control = explorer.getByRole("button", { name: layout, exact: true });
      if (await control.isEnabled()) {
        await control.click();
        await capture(`${slug}-${slugSuffix}.png`, `${name} ${layout.toLowerCase()}`, "Layout");
      }
    }
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
  }

  await writeFile(join(output, "manifest.json"), JSON.stringify({ schemaVersion: 1, capturedAt, sourceCommit: process.env.MATH3D_RELEASE_SOURCE_COMMIT || null, entries }, null, 2) + "\n");
} finally {
  await app.close();
  if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-release-field-"))
    throw new Error("Unsafe temporary profile cleanup path");
  await rm(profile, { recursive: true, force: true });
}
