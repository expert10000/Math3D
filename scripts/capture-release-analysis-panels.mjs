#!/usr/bin/env node

import { _electron as electron } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(process.env.MATH3D_RELEASE_ANALYSIS_OUT || join(root, "apps/public-site/src/assets/release-analysis-current"));
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const capturedAt = new Date().toISOString();
const entries = [];
await mkdir(output, { recursive: true });

async function capture(page, file, module, title, panel) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(output, file), animations: "disabled" });
  entries.push({ file, module, title, view: "Analysis", panel, runtime: "Desktop", capturedAt, sourceCommit });
  process.stdout.write(`[release-analysis] ${file}\n`);
}

async function captureFullPanel(page, id, file, module, title, panel) {
  const source = page.getByTestId(id);
  if (!await source.isVisible()) throw new Error(`${id} is not visible`);
  await source.evaluate(element => {
    const clone = element.cloneNode(true);
    const width = Math.ceil(element.getBoundingClientRect().width);
    const host = document.createElement("div");
    host.id = "release-full-panel-capture";
    host.style.cssText = `position:absolute;left:0;top:0;z-index:2147483647;width:${width}px;background:#fff;padding:0`;
    clone.style.setProperty("height", "auto", "important");
    clone.style.setProperty("min-height", "0", "important");
    clone.style.setProperty("max-height", "none", "important");
    clone.style.setProperty("overflow", "visible", "important");
    clone.style.setProperty("display", "block", "important");
    host.append(clone);
    document.body.append(host);
  });
  try {
    await page.locator("#release-full-panel-capture").screenshot({ path: join(output, file), animations: "disabled", timeout: 30_000 });
  } finally {
    await page.locator("#release-full-panel-capture").evaluate(element => element.remove());
  }
  entries.push({ file, module, title, view: "Analysis", panel, runtime: "Desktop", fullHeight: true, capturedAt, sourceCommit });
  process.stdout.write(`[release-analysis] ${file}\n`);
}

for (const module of ["Surfaces", "Mesh", "Geometry"]) {
  const profile = await mkdtemp(join(tmpdir(), "math3d-release-analysis-"));
  const env = { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ args: ["."], cwd: root, env, timeout: 60_000 });
    const page = await app.firstWindow();
    page.setDefaultTimeout(30_000);
    await page.waitForLoadState("domcontentloaded");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1800, 1100));
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    await page.getByTestId(`workspace-nav-${module.toLowerCase()}`).click();

    if (module === "Mesh") {
      await page.getByRole("button", { name: "Mesh presets", exact: true }).first().click();
      await page.getByTestId("mesh-preset-card-mesh_icosphere").click();
      await page.getByTestId("mesh-panel-tools").click();
    }
    if (module === "Geometry") await page.getByRole("button", { name: "Procedural", exact: true }).first().click();
    if (module === "Geometry") await page.getByTestId("geometry-professional-panel-analysis").click();
    else await page.getByTestId("surfaces-left-tab-analysis").click();
    const rightId = module === "Geometry" ? "geometry-right-panel" : "surface-right-panel";
    await page.getByTestId(module === "Geometry" ? "geometry-right-panel-tab-analysis" : "shared-inspector-tab-analysis").click();

    if (module === "Geometry") {
      const left = page.getByTestId("geometry-left-panel");
      await left.getByRole("button", { name: "volume / area / centroid / bounds", exact: true }).click();
      await page.getByTestId(rightId).getByText("Basic metrics", { exact: true }).first().waitFor();
    }
    if (module === "Mesh") await page.getByTestId(rightId).getByText("Gaussian curvature K", { exact: true }).first().waitFor();

    await capture(page, `${module.toLowerCase()}-analysis-workspace.png`, module, `${module} analysis workspace`, "Workspace");
    await captureFullPanel(page, module === "Geometry" ? "geometry-left-panel" : "surface-left-panel",
      `${module.toLowerCase()}-analysis-left-full.png`, module, `${module} analysis tools · full height`, "Left tools");
    await captureFullPanel(page, rightId, `${module.toLowerCase()}-analysis-right-full.png`, module,
      `${module} analysis inspector · full height`, "Right inspector");

    if (module === "Geometry") {
      await page.getByTestId("geometry-left-panel").getByRole("button", { name: "V / E / F / Euler / boundaries / manifold", exact: true }).click();
      await page.getByTestId(rightId).getByText("Topology summary", { exact: true }).first().waitFor();
      await captureFullPanel(page, rightId, "geometry-analysis-right-topology-full.png", module,
        "Geometry topology result · full height", "Right inspector");
    } else {
      const legacy = page.getByTestId("surface-analysis-legacy-tools");
      if (await legacy.getAttribute("open") === null) await legacy.locator(":scope > summary").click();
      await captureFullPanel(page, "surface-left-panel", `${module.toLowerCase()}-analysis-left-advanced-full.png`, module,
        `${module} advanced analysis tools · full height`, "Left tools");
      if (module === "Mesh") {
        await page.getByTestId("mesh-analyze-taxonomy").scrollIntoViewIfNeeded();
        await capture(page, "mesh-analysis-computations-workspace.png", module, "Mesh analysis computations", "Workspace");
      }
    }
  } finally {
    if (app) await app.close();
    if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-release-analysis-"))
      throw new Error("Unsafe temporary profile cleanup path");
    await rm(profile, { recursive: true, force: true });
  }
}

await writeFile(join(output, "manifest.json"), JSON.stringify({ schemaVersion: 1, capturedAt, sourceCommit, entries }, null, 2) + "\n");
process.stdout.write(`[release-analysis] ${entries.length} screenshots captured\n`);
