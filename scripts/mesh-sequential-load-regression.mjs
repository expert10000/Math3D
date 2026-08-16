import { _electron as electron } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "output");
const outFile = path.join(outDir, "mesh-sequential-load-regression.json");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function closeElectron(app) {
  const proc = app.process();
  const close = app.close().catch(() => undefined);
  const timeout = wait(5_000).then(() => {
    if (proc && !proc.killed) proc.kill();
  });
  await Promise.race([close, timeout]);
}

async function waitForText(page, pattern, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (pattern.test(text)) return text;
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${pattern}`);
}

async function loadBenchmark(page, id, expectedPattern) {
  const result = await page.evaluate((benchmarkId) => {
    return window.__MATH3D_E2E_MESH_BENCHMARK__.loadBenchmarkModel(benchmarkId);
  }, id);
  if (!result?.ok) throw new Error(result?.error || `loadBenchmarkModel(${id}) failed`);
  const text = await waitForText(page, expectedPattern);
  return {
    id,
    textPrefix: text.replace(/\s+/g, " ").trim().slice(0, 500),
    hasDedicatedFullViewer: /Dedicated Full viewer/i.test(text),
  };
}

async function waitForTraceLabel(electronLogs, pattern, timeoutMs = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (electronLogs.some((entry) => pattern.test(entry.text))) return true;
    await wait(250);
  }
  throw new Error(`Timed out waiting for trace ${pattern}`);
}

async function runFullTrace(page, electronLogs, id) {
  const result = await page.evaluate((benchmarkId) => {
    return window.__MATH3D_E2E_MESH_BENCHMARK__.runFullTrace(benchmarkId);
  }, id);
  if (!result?.ok) throw new Error(result?.error || `runFullTrace(${id}) failed`);
  await waitForTraceLabel(electronLogs, /Dedicated Full viewer ready:/i, 30_000);
  const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  return {
    id,
    textPrefix: text.replace(/\s+/g, " ").trim().slice(0, 500),
    ready: true,
  };
}

async function readDebugSummary(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    return {
      textLength: text.length,
      has3dbenchy: /3DBenchy|10_3dbenchy\.stl/i.test(text),
      hasArmadillo: /Armadillo|11_armadillo\.obj/i.test(text),
      hasDedicatedFullViewer: /Dedicated Full viewer/i.test(text),
      hasBlankRoot: !text.trim(),
      debugMonitor: Array.from(document.querySelectorAll('[data-testid="mesh-debug-drawer"] *'))
        .map((node) => node.textContent ?? "")
        .join("\n")
        .slice(0, 20_000),
      bodyPrefix: text.replace(/\s+/g, " ").trim().slice(0, 800),
    };
  });
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const startedAt = Date.now();
  const electronLogs = [];
  const rendererLogs = [];
  const checks = [];
  const env = {
    ...process.env,
    MATH3D_E2E: "1",
    MATH3D_SKIP_AUTOSAVE_RECOVERY: "1",
    MATH3D_RENDERER_MEMORY_AUTO_RELOAD: "0",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  let app;
  try {
    app = await electron.launch({ args: ["."], cwd: repoRoot, env });
    const child = app.process();
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      process.stdout.write(text);
      electronLogs.push({ stream: "stdout", at: Date.now(), text });
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      process.stderr.write(text);
      electronLogs.push({ stream: "stderr", at: Date.now(), text });
    });

    const page = await app.firstWindow({ timeout: 30_000 });
    page.on("console", (msg) => rendererLogs.push({ at: Date.now(), type: msg.type(), text: msg.text() }));
    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await page.setViewportSize({ width: 1760, height: 980 });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__MATH3D_E2E_MESH_BENCHMARK__?.loadBenchmarkModel, null, {
      timeout: 45_000,
    });

    checks.push({ name: "armadillo-load", ...(await loadBenchmark(page, "armadillo", /Armadillo|11_armadillo\.obj/i)) });
    checks.push({ name: "3dbenchy-after-armadillo", ...(await loadBenchmark(page, "3dbenchy", /3DBenchy|10_3dbenchy\.stl/i)) });
    const afterSequentialLoad = await readDebugSummary(page);
    if (!afterSequentialLoad.has3dbenchy || afterSequentialLoad.hasDedicatedFullViewer) {
      throw new Error("3DBenchy did not replace Armadillo cleanly after normal sequential load.");
    }

    checks.push({ name: "armadillo-full", ...(await runFullTrace(page, electronLogs, "armadillo")) });
    checks.push({
      name: "3dbenchy-after-armadillo-full",
      ...(await loadBenchmark(page, "3dbenchy", /3DBenchy|10_3dbenchy\.stl/i)),
    });
    const afterFullThenLoad = await readDebugSummary(page);
    if (!afterFullThenLoad.has3dbenchy || afterFullThenLoad.hasDedicatedFullViewer) {
      throw new Error("3DBenchy did not replace Armadillo cleanly after Armadillo Full.");
    }

    const artifact = {
      ok: true,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      checks,
      afterSequentialLoad,
      afterFullThenLoad,
      electronLogs,
      rendererLogs,
    };
    writeFileSync(outFile, JSON.stringify(artifact, null, 2));
    console.log(`[mesh-sequential-load-regression] PASS ${outFile}`);
  } catch (error) {
    const artifact = {
      ok: false,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      error: String(error?.message ?? error),
      stack: error?.stack,
      checks,
      electronLogs,
      rendererLogs,
    };
    writeFileSync(outFile, JSON.stringify(artifact, null, 2));
    console.error(`[mesh-sequential-load-regression] FAIL ${outFile}`);
    throw error;
  } finally {
    if (app) await closeElectron(app);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
