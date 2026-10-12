#!/usr/bin/env node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import { ensureElectronExecutablePath } from "./ensure-electron-install.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const executablePath = await ensureElectronExecutablePath();
const runs = [];

for (let i = 0; i < 3; i++) {
  const profile = await mkdtemp(join(tmpdir(), "math3d-ssr-footprint-"));
  const start = performance.now();
  let app;
  try {
    app = await electron.launch({ executablePath, args: ["."], cwd: root,
      env: { ...process.env, MATH3D_E2E: "1", MATH3D_E2E_USER_DATA_DIR: join(profile, "user-data") }, timeout: 60_000 });
    const page = await app.firstWindow();
    await page.getByTestId("app-shell").waitFor({ state: "visible", timeout: 30_000 });
    const readyMs = Math.round(performance.now() - start);
    await page.waitForTimeout(2_000);
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics());
    const rendererHeapBytes = await page.evaluate(() =>
      "memory" in performance ? Number((performance.memory)?.usedJSHeapSize ?? 0) : null);
    runs.push({ readyMs, processCount: metrics.length,
      workingSetKiB: metrics.reduce((sum, item) => sum + Number(item.memory?.workingSetSize ?? 0), 0),
      rendererHeapBytes });
  } finally {
    if (app) await app.close();
    if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-ssr-footprint-"))
      throw new Error("Unsafe temporary profile cleanup path");
    await rm(profile, { recursive: true, force: true });
  }
}

const median = (values) => [...values].sort((a, b) => a - b)[1];
process.stdout.write(`${JSON.stringify({ runs, median: {
  readyMs: median(runs.map(run => run.readyMs)),
  workingSetKiB: median(runs.map(run => run.workingSetKiB)),
  rendererHeapBytes: median(runs.map(run => run.rendererHeapBytes ?? 0)),
} }, null, 2)}\n`);
