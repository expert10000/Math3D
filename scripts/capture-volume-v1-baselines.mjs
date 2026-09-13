#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const outputDirectory = path.join(repositoryRoot, "docs", "assets", "screenshots", "volume-v1");
const baseUrl = process.env.MATH3D_VOLUME_BASELINE_URL || "http://127.0.0.1:5177";
const timeoutMs = 60_000;

async function serverReady() { try { return (await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } }
async function ensurePreviewServer() {
  if (await serverReady()) return null;
  if (process.env.MATH3D_VOLUME_BASELINE_URL) throw new Error(`Volume baseline server unavailable: ${baseUrl}`);
  const viteBin = path.join(repositoryRoot, "renderer", "node_modules", "vite", "bin", "vite.js");
  const server = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", "5177", "--strictPort"], { cwd: path.join(repositoryRoot, "renderer"), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (server.exitCode != null) throw new Error(`Volume baseline preview exited with code ${server.exitCode}.`); if (await serverReady()) return server; await new Promise((resolve) => setTimeout(resolve, 150)); }
  server.kill(); throw new Error(`Timed out starting Volume baseline preview at ${baseUrl}.`);
}
const closeBounded = (callback) => Promise.race([callback(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
const server = await ensurePreviewServer();
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch({ timeout: timeoutMs });
fs.mkdirSync(outputDirectory, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(timeoutMs);
  await page.goto(`${baseUrl}?volume-v1-baseline=1`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.locator('[data-testid="workspace-nav-volume"]').click();
  await page.locator('[data-testid="volume-slice-grid"]').waitFor({ state: "visible" });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  const capture = async (name) => { await page.waitForTimeout(350); const outputPath = path.join(outputDirectory, `math3d-volume-v1-${name}.png`); await page.screenshot({ path: outputPath, animations: "disabled" }); process.stdout.write(`[volume-baseline] ${name} -> ${path.relative(repositoryRoot, outputPath)}\n`); };
  await capture("desktop-gallery-quad");
  await page.getByTestId("volume-detailed-controls").getByRole("button", { name: "3D", exact: true }).click();
  await capture("desktop-3d-render");
  for (const tab of ["analysis", "segmentation", "compare", "derived"]) {
    await page.getByTestId(`volume-inspector-tab-${tab}`).click();
    await capture(`desktop-${tab}`);
  }
  for (const size of [{ name: "tablet", width: 900, height: 1180 }, { name: "phone", width: 390, height: 844 }]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.getByTestId("workspace-nav-volume").click();
    await capture(`${size.name}-workspace`);
  }
  await page.close({ runBeforeUnload: false });
} finally {
  await closeBounded(() => browser.close());
  if (server) await closeBounded(async () => { server.kill(); });
}
