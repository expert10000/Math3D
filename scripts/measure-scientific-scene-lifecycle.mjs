#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { ensureElectronExecutablePath } from "./ensure-electron-install.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profile = await mkdtemp(join(tmpdir(), "math3d-ssr-lifecycle-"));
const executablePath = await ensureElectronExecutablePath();
let app;
try {
  app = await electron.launch({ executablePath, args: ["."], cwd: root,
    env: { ...process.env, MATH3D_E2E: "1", MATH3D_E2E_USER_DATA_DIR: join(profile, "user-data") }, timeout: 60_000 });
  const page = await app.firstWindow();
  await page.getByTestId("app-shell").waitFor({ state: "visible", timeout: 30_000 });
  const cdp = await page.context().newCDPSession(page);
  const snapshot = async phase => {
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await cdp.send("Runtime.getHeapUsage");
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics());
    const dom = await page.evaluate(() => ({ canvases: document.querySelectorAll("canvas").length,
      scientificDialogs: document.querySelectorAll('[data-testid="scientific-scene-preview"]').length,
      quantumDialogs: document.querySelectorAll('[data-testid="quantum-scene-preview"]').length }));
    return { phase, rendererHeapBytes: heap.usedSize,
      processWorkingSetKiB: metrics.reduce((sum, metric) => sum + Number(metric.memory?.workingSetSize ?? 0), 0),
      processCount: metrics.length, ...dom };
  };
  const chooser = async () => {
    await page.getByRole("button", { name: "Palette", exact: true }).click();
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
      .fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId("quantum-scene-examples").waitFor({ state: "visible" });
  };
  const baseline = await snapshot("idle-before");
  const cycles = [];
  for (let cycle = 1; cycle <= 3; cycle++) {
    await chooser();
    const start = performance.now();
    await page.getByTestId("scientific-example-sincos").click();
    await page.getByTestId("scientific-scene-preview").waitFor({ state: "visible" });
    await page.getByTestId("scientific-scene-preview").locator("canvas").first().waitFor({ state: "visible" });
    const openMs = Math.round(performance.now() - start);
    await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="scientific-scene-preview"] canvas');
      window.__ssrContextLost = false;
      canvas?.addEventListener("webglcontextlost", event => { event.preventDefault(); window.__ssrContextLost = true; }, { once: true });
    });
    const opened = await snapshot(`scalar-open-${cycle}`);
    await page.getByTestId("scientific-scene-preview").getByRole("button", { name: "Close" }).click();
    await page.getByTestId("scientific-scene-preview").waitFor({ state: "hidden" });
    await page.waitForTimeout(200);
    const closed = await snapshot(`scalar-closed-${cycle}`);
    const contextLost = await page.evaluate(() => Boolean(window.__ssrContextLost));
    assert.ok(opened.canvases > baseline.canvases, "scalar scene did not create a view canvas");
    assert.equal(closed.canvases, baseline.canvases, "scalar view canvas survived close");
    assert.equal(closed.scientificDialogs, 0, "scalar dialog survived close");
    assert.equal(contextLost, true, "scalar WebGL context was not released");
    cycles.push({ cycle, openMs, opened, closed, contextLost });
  }
  await chooser();
  const quantumStart = performance.now();
  await page.getByTestId("quantum-example-hydrogen-2p").click();
  await page.getByTestId("quantum-scene-preview").waitFor({ state: "visible" });
  const quantumOpenMs = Math.round(performance.now() - quantumStart);
  const quantumSurfaceStart = performance.now();
  await page.getByTestId("quantum-scene-preview").getByRole("button", { name: "Density surface" }).click();
  await page.getByTestId("quantum-surface-legend").waitFor({ state: "visible" });
  const quantumSurfaceMs = Math.round(performance.now() - quantumSurfaceStart);
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="quantum-scene-preview"] canvas');
    window.__ssrQuantumContextLost = false;
    canvas?.addEventListener("webglcontextlost", event => { event.preventDefault(); window.__ssrQuantumContextLost = true; }, { once: true });
  });
  const quantumSurface = await snapshot("quantum-surface-open");
  await page.getByTestId("quantum-scene-close").click();
  await page.getByTestId("quantum-scene-preview").waitFor({ state: "hidden" });
  await page.waitForTimeout(200);
  const quantumClosed = await snapshot("quantum-closed");
  const quantumContextLost = await page.evaluate(() => Boolean(window.__ssrQuantumContextLost));
  const final = await snapshot("idle-after");
  assert.ok(quantumSurface.canvases > baseline.canvases, "quantum surface did not create a view canvas");
  assert.equal(quantumClosed.canvases, baseline.canvases, "quantum surface canvas survived close");
  assert.equal(quantumClosed.quantumDialogs, 0, "quantum dialog survived close");
  assert.equal(quantumContextLost, true, "quantum WebGL context was not released");
  assert.equal(final.canvases, baseline.canvases, "scene canvas survived final idle");
  process.stdout.write(`${JSON.stringify({ baseline, cycles, quantum: { openMs: quantumOpenMs,
    surfaceMs: quantumSurfaceMs, surface: quantumSurface, closed: quantumClosed, contextLost: quantumContextLost }, final }, null, 2)}\n`);
} finally {
  if (app) await app.close();
  if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-ssr-lifecycle-"))
    throw new Error("Unsafe scientific lifecycle profile cleanup path");
  await rm(profile, { recursive: true, force: true });
}
