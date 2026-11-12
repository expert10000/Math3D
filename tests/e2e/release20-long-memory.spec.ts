import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { bytesToMiB, sampleProcessTreeSafely } from "./helpers/processMemory";

const minutesText = process.env.MATH3D_MEMORY_SOAK_MINUTES;
const minutes = Number(minutesText);
const smoke = process.env.MATH3D_MEMORY_SOAK_SMOKE === "1";
const smokeCycles = Number(process.env.MATH3D_MEMORY_SOAK_SMOKE_CYCLES || "1");
const diagnosticRoute = process.env.MATH3D_MEMORY_SOAK_ROUTE;
test.skip(minutesText === undefined && !smoke, "Set MATH3D_MEMORY_SOAK_MINUTES=120 or more for an intentional long run.");

test("one Electron process retains responsive navigation and records long-run memory", async ({}, testInfo) => {
  if (!smoke && (!Number.isInteger(minutes) || minutes < 120 || minutes > 1440)) throw new Error("Memory soak requires 120–1440 whole minutes.");
  if (smoke && (!Number.isInteger(smokeCycles) || smokeCycles < 1 || smokeCycles > 20)) throw new Error("Smoke cycles must be 1–20.");
  if (diagnosticRoute && (!smoke || !["surfaces", "mesh", "volume", "projects"].includes(diagnosticRoute)))
    throw new Error("A diagnostic route requires smoke mode and one supported target.");
  const routes = diagnosticRoute ? ["graphs", diagnosticRoute] : ["graphs", "surfaces", "mesh", "volume", "projects"];
  test.setTimeout(smoke ? (smokeCycles * 3 + 5) * 60_000 : (minutes + 45) * 60_000);
  const reportPath = path.resolve(process.env.MATH3D_MEMORY_SOAK_REPORT || testInfo.outputPath("release20-long-memory.json"));
  const build = JSON.parse(readFileSync("dist/build-identity.json", "utf8"));
  if (!build.commit || !build.rendererHash || !smoke && build.dirty) throw new Error("Memory soak requires a clean, identified source build.");
  const expectedCommit = process.env.MATH3D_RELEASE20_EXPECTED_COMMIT;
  if (expectedCommit && build.commit !== expectedCommit) throw new Error("Memory soak build differs from the frozen commit.");
  const started = Date.now(), deadline = started + minutes * 60_000;
  const report = {
    schema: "math3d.release20.long-memory.v1", status: "running", build,
    host: { os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
      totalMemoryGiB: Math.round(os.totalmem() / 1024 ** 3 * 10) / 10 },
    method: { host: process.env.MATH3D_PACKAGED_APP_EXE ? "installed candidate" : "source checkout",
      packageSha256: process.env.MATH3D_CANDIDATE_INSTALLER_SHA256 || null,
      routeSequence: routes,
      measurement: "same-process process-tree RSS, Electron private bytes, CDP V8 heap, GPU-process RSS and context-loss events; GPU allocations are not measured",
      runtimeE2e: false },
    requestedMinutes: smoke ? 0 : minutes, startedAtUtc: new Date(started).toISOString(), elapsedMs: 0,
    pid: 0, cycles: [] as Array<{ startedAtMs: number; finishedAtMs?: number; actions: number;
      samples: Array<{ action: number; elapsedMs: number; rssMiB: number; processCount: number;
        byRoleMiB: Record<string, number>; electronPrivateMiB: number; rendererPrivateMiB: number;
        gpuPrivateMiB: number; gpuPid: number | null; contextLosses: number;
        jsHeapMiB: number | null; v8UsedMiB: number; v8TotalMiB: number; domNodes: number }> }>, pageErrors: [] as string[],
    peakSampledRssMiB: 0, failure: null as string | null,
  };
  const save = () => { mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n"); };
  let ctx: LaunchedSurfaceApp | null = null;
  save();
  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "0" });
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page, pid = ctx.app.process().pid;
    if (!pid) throw new Error("Electron PID unavailable.");
    if (await page.evaluate(() => (window as Window & { appRuntime?: { e2e?: boolean } }).appRuntime?.e2e ?? false))
      throw new Error("Memory soak must run without E2E runtime hooks.");
    const heapSession = await page.context().newCDPSession(page);
    report.pid = pid;
    page.on("pageerror", error => { report.pageErrors.push(error.message); save(); });
    await page.evaluate(() => {
      const state = window as Window & { __release20ContextLosses?: number };
      state.__release20ContextLosses = 0;
      document.addEventListener("webglcontextlost", () => { state.__release20ContextLosses!++; }, true);
    });
    const sample = async (action: number) => {
      const value = await sampleProcessTreeSafely(pid, Date.now() - started);
      if (value.error || value.rssBytes <= 0) throw new Error(value.error || "Process-tree RSS sample unavailable.");
      const rssMiB = Number(bytesToMiB(value.rssBytes).toFixed(1));
      const appMetrics = await ctx!.app.evaluate(({ app }) => app.getAppMetrics());
      const heap = await heapSession.send("Runtime.getHeapUsage");
      const privateMiB = (type: string) => Number((appMetrics.filter(metric => metric.type === type)
        .reduce((sum, metric) => sum + Number(metric.memory?.privateBytes ?? 0), 0) / 1024).toFixed(1));
      const renderer = await page.evaluate(() => ({
        jsHeapBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
        domNodes: document.getElementsByTagName("*").length,
        contextLosses: (window as Window & { __release20ContextLosses?: number }).__release20ContextLosses ?? 0,
      }));
      report.peakSampledRssMiB = Math.max(report.peakSampledRssMiB, rssMiB);
      return { action, elapsedMs: Date.now() - started, rssMiB, processCount: value.processCount,
        byRoleMiB: Object.fromEntries(Object.entries(value.byRole).map(([role, bytes]) =>
          [role, Number(bytesToMiB(bytes).toFixed(1))])),
        electronPrivateMiB: Number((appMetrics.reduce((sum, metric) => sum + Number(metric.memory?.privateBytes ?? 0), 0) / 1024).toFixed(1)),
        rendererPrivateMiB: privateMiB("Tab"), gpuPrivateMiB: privateMiB("GPU"),
        gpuPid: value.processes.find(entry => entry.role === "gpu-process")?.pid ?? null,
        contextLosses: renderer.contextLosses,
        jsHeapMiB: renderer.jsHeapBytes === null ? null : Number(bytesToMiB(renderer.jsHeapBytes).toFixed(1)),
        v8UsedMiB: Number(bytesToMiB(heap.usedSize).toFixed(1)),
        v8TotalMiB: Number(bytesToMiB(heap.totalSize).toFixed(1)),
        domNodes: renderer.domNodes };
    };
    do {
      const cycle = { startedAtMs: Date.now() - started, actions: 0,
        samples: [] as Array<{ action: number; elapsedMs: number; rssMiB: number; processCount: number;
          byRoleMiB: Record<string, number>; electronPrivateMiB: number; rendererPrivateMiB: number;
          gpuPrivateMiB: number; gpuPid: number | null; contextLosses: number;
          jsHeapMiB: number | null; v8UsedMiB: number; v8TotalMiB: number; domNodes: number }>, finishedAtMs: undefined as number | undefined };
      report.cycles.push(cycle);
      cycle.samples.push(await sample(0)); save();
      for (let action = 1; action <= 100; action++) {
        const route = routes[(action - 1) % routes.length]!;
        if (route === "projects") {
          await page.getByTestId("projects-toggle").click();
          const panel = page.getByTestId("project-explorer-panel");
          await expect(panel).toBeVisible();
          await panel.getByRole("button", { name: "Close project explorer" }).click();
          await expect(panel).toHaveCount(0);
        } else {
          const button = page.getByTestId(`workspace-nav-${route}`);
          await button.click();
          await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
        }
        cycle.actions = action;
        if (action % 10 === 0) { cycle.samples.push(await sample(action)); save(); }
      }
      await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
      if (smoke && process.env.MATH3D_MEMORY_SOAK_FORCE_GC === "1") {
        await heapSession.send("HeapProfiler.collectGarbage");
        await page.waitForTimeout(2_000);
        cycle.samples.push(await sample(101));
      }
      if (report.pageErrors.length) throw new Error(`Page error: ${report.pageErrors[0]}`);
      cycle.finishedAtMs = Date.now() - started;
      report.elapsedMs = cycle.finishedAtMs; save();
    } while (smoke ? report.cycles.length < smokeCycles : Date.now() < deadline);
    report.status = smoke ? "smoke" : "completed";
  } catch (error) { report.status = "failed"; report.failure = (error as Error).message; throw error; }
  finally {
    report.elapsedMs = Date.now() - started; save();
    await closeSurfaceApp(ctx);
  }
});
