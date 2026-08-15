import { _electron as electron } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const meshId = process.argv[2] || process.env.MATH3D_MESH_TRACE_ID || "3dbenchy";
const safeMeshId = meshId.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
const outDir = path.join(repoRoot, "output");
const outFile = path.join(outDir, `mesh-full-trace-${safeMeshId}.json`);
const screenshotPath = path.join(outDir, `mesh-full-trace-${safeMeshId}.png`);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, ms, fallback) =>
  Promise.race([promise, wait(ms).then(() => (typeof fallback === "function" ? fallback() : fallback))]);

async function closeElectron(app) {
  const proc = app.process();
  const close = app.close().catch(() => undefined);
  const timeout = wait(5_000).then(() => {
    if (proc && !proc.killed) proc.kill();
  });
  await Promise.race([close, timeout]);
}

function parseMeshDebugEvents(electronLogs) {
  const events = [];
  for (const item of electronLogs) {
    for (const line of item.text.split(/\r?\n/)) {
      const marker = "[mesh-debug-trace]";
      const index = line.indexOf(marker);
      if (index < 0) continue;
      const jsonText = line.slice(index + marker.length).trim();
      try {
        events.push(JSON.parse(jsonText));
      } catch {
        events.push({ parseError: true, raw: jsonText });
      }
    }
  }
  return events;
}

async function readUiState(page) {
  return page.evaluate(() => ({
    url: location.href,
    textLength: document.body?.innerText?.trim().length ?? 0,
    bodyPrefix: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
    hasRoot: !!document.querySelector("#root"),
    hasMath3dHeading: Array.from(document.querySelectorAll("h1")).some((node) =>
      /^math3d$/i.test((node.textContent ?? "").trim())
    ),
    debugDrawerText: Array.from(document.querySelectorAll('[data-testid="mesh-debug-drawer"] *'))
      .map((node) => node.textContent ?? "")
      .join("\n")
      .slice(0, 80_000),
  }));
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const electronLogs = [];
  const rendererLogs = [];
  const pageErrors = [];
  const runnerEvents = [];
  const checks = [];
  const startedAt = Date.now();
  let pageCrashed = false;
  let finalUiState = null;

  const writeArtifact = (extra = {}) => {
    const meshDebugEvents = parseMeshDebugEvents(electronLogs);
    writeFileSync(
      outFile,
      JSON.stringify(
        {
          meshId,
          startedAt: new Date(startedAt).toISOString(),
          snapshotAt: new Date().toISOString(),
          elapsedMs: Date.now() - startedAt,
          outFile,
          screenshotPath,
          runnerEvents,
          checks,
          finalUiState,
          meshDebugEvents,
          rendererLogs,
          electronLogs,
          pageErrors,
          ...extra,
        },
        null,
        2
      )
    );
  };

  const env = {
    ...process.env,
    MATH3D_E2E: "1",
    MATH3D_SKIP_AUTOSAVE_RECOVERY: "1",
    MATH3D_RENDERER_MEMORY_AUTO_RELOAD: process.env.MATH3D_RENDERER_MEMORY_AUTO_RELOAD ?? "0",
  };
  delete env.ELECTRON_RUN_AS_NODE;

  let app;
  let page;
  try {
    app = await electron.launch({ args: ["."], cwd: repoRoot, env });
    const child = app.process();
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      process.stdout.write(text);
      electronLogs.push({ stream: "stdout", at: Date.now(), text });
      if (text.includes("[mesh-debug-trace]") || text.includes("render-process-gone")) {
        writeArtifact({ partial: true });
      }
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      process.stderr.write(text);
      electronLogs.push({ stream: "stderr", at: Date.now(), text });
      writeArtifact({ partial: true });
    });

    page = await app.firstWindow({ timeout: 30_000 });
    page.on("console", (msg) => {
      const item = { at: Date.now(), type: msg.type(), text: msg.text() };
      rendererLogs.push(item);
      if (/\b(mesh|full|bench|trace|error|warn)\b/i.test(item.text)) {
        console.log(`[renderer:${item.type}] ${item.text}`);
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push({ at: Date.now(), message: error.message, stack: error.stack });
      console.error("[pageerror]", error);
    });
    page.on("crash", () => {
      pageCrashed = true;
      runnerEvents.push({ at: Date.now(), event: "page-crash" });
      writeArtifact({ partial: true, pageCrashed: true });
      console.error("[trace] page crashed");
    });
    page.on("close", () => {
      runnerEvents.push({ at: Date.now(), event: "page-close" });
    });

    await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    await page.setViewportSize({ width: 1760, height: 980 });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__MATH3D_E2E_MESH_BENCHMARK__?.runFullTrace, null, {
      timeout: 45_000,
    });
    runnerEvents.push({ at: Date.now(), event: "e2e-hook-ready" });

    const result = await page.evaluate((id) => window.__MATH3D_E2E_MESH_BENCHMARK__.runFullTrace(id), meshId);
    runnerEvents.push({ at: Date.now(), event: "runFullTrace-returned", result });
    if (!result?.ok) throw new Error(result?.error || "runFullTrace failed");

    const waitMs = Number(process.env.MATH3D_FULL_TRACE_WAIT_MS ?? 30_000);
    const pollEveryMs = Number(process.env.MATH3D_FULL_TRACE_POLL_MS ?? 1_000);
    const breakOnPollTimeout = ["1", "true", "yes", "on"].includes(
      String(process.env.MATH3D_FULL_TRACE_BREAK_ON_POLL_TIMEOUT ?? "").toLowerCase()
    );
    for (let elapsed = 0; elapsed < waitMs; elapsed += pollEveryMs) {
      if (pageCrashed || page.isClosed()) break;
      const state = await withTimeout(
        page
          .evaluate((elapsedMs) => ({
            at: Date.now(),
            elapsed: elapsedMs,
            textLength: document.body?.innerText?.trim().length ?? 0,
            hasRoot: !!document.querySelector("#root"),
            hasViewer: /Mesh viewer|Full preview|Loading full|3DBenchy|Armadillo|Dragon/i.test(
              document.body?.innerText ?? ""
            ),
            bodyPrefix: (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 260),
          }), elapsed)
          .catch((error) => ({ at: Date.now(), elapsed, error: String(error?.message ?? error) })),
        Math.max(250, Math.floor(pollEveryMs * 0.8)),
        () => ({ at: Date.now(), elapsed, error: `poll-timeout after ${Math.max(250, Math.floor(pollEveryMs * 0.8))} ms` })
      );
      checks.push(state);
      writeArtifact({ partial: true, pageCrashed });
      if ("error" in state && breakOnPollTimeout) break;
      await wait(pollEveryMs);
    }

    if (!pageCrashed && !page.isClosed()) {
      finalUiState = await withTimeout(
        readUiState(page).catch((error) => ({ error: String(error?.message ?? error) })),
        2_000,
        { error: "final-ui-state-timeout after 2000 ms" }
      );
      if (!finalUiState?.error) {
        await withTimeout(
          page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined),
          2_000,
          undefined
        );
      }
    }
  } finally {
    writeArtifact({ finishedAt: new Date().toISOString(), pageCrashed });
    console.log(`[trace] wrote ${outFile}`);
    if (app) await closeElectron(app);
  }
}

main().catch((error) => {
  console.error("[trace] failed", error);
  process.exitCode = 1;
});
