#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const outputDirectory = path.join(repositoryRoot, "docs", "assets", "screenshots", "curves-v1");
const baseUrl = process.env.MATH3D_CURVES_BASELINE_URL || "http://127.0.0.1:5176";
const timeoutMs = 60_000;
const baselines = [
  { name: "desktop-analysis", width: 1440, height: 960 },
  { name: "tablet-workspace", width: 900, height: 1180 },
  { name: "phone-workspace", width: 390, height: 844 },
];

async function serverReady() {
  try {
    return (await fetch(baseUrl, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

async function ensurePreviewServer() {
  if (await serverReady()) return null;
  if (process.env.MATH3D_CURVES_BASELINE_URL) throw new Error(`Curves baseline server unavailable: ${baseUrl}`);
  const viteBin = path.join(repositoryRoot, "renderer", "node_modules", "vite", "bin", "vite.js");
  const server = spawn(process.execPath, [viteBin, "preview", "--host", "127.0.0.1", "--port", "5176", "--strictPort"], {
    cwd: path.join(repositoryRoot, "renderer"),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode != null) throw new Error(`Curves baseline preview exited with code ${server.exitCode}.`);
    if (await serverReady()) return server;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  server.kill();
  throw new Error(`Timed out starting Curves baseline preview at ${baseUrl}.`);
}

async function closeBounded(callback) {
  await Promise.race([callback(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
}

const server = await ensurePreviewServer();
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch({ timeout: timeoutMs });
fs.mkdirSync(outputDirectory, { recursive: true });

try {
  for (const baseline of baselines) {
    const page = await browser.newPage({ viewport: { width: baseline.width, height: baseline.height }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(timeoutMs);
    await page.goto(`${baseUrl}?curves-v1-baseline=${baseline.name}`);
    await page.locator('[data-testid="app-shell"]').waitFor({ state: "visible" });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1");
    });
    await page.reload();
    await page.locator('[data-testid="workspace-nav-curves"]').evaluate((element) => element.click());
    await page.locator('[data-testid="main-viewer"]').waitFor({ state: "visible" });
    const analysis = page.locator('[data-testid="curve-panel-analysis"]');
    if (await analysis.isVisible().catch(() => false)) await analysis.click();
    await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }" });
    await page.waitForTimeout(600);
    const outputPath = path.join(outputDirectory, `math3d-curves-v1-${baseline.name}.png`);
    await page.screenshot({ path: outputPath, fullPage: false, animations: "disabled" });
    process.stdout.write(`[curves-baseline] ${baseline.name}: ${baseline.width}x${baseline.height} -> ${path.relative(repositoryRoot, outputPath)}\n`);
    await page.close({ runBeforeUnload: false });
  }
} finally {
  await closeBounded(() => browser.close());
  if (server) await closeBounded(async () => { server.kill(); });
}
