import { expect, test } from "@playwright/test";
import { closeSync, mkdirSync, openSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { bytesToMiB, sampleProcessTreeSafely } from "./helpers/processMemory";

const routes = ["graphs", "surfaces", "mesh", "volume", "projects"] as const;
const selectedRoutes = process.env.MATH3D_MEMORY_PROFILE_ROUTE?.split(",").map(item => item.trim()) ?? [];
const profileRoutes = selectedRoutes.length && selectedRoutes.every(item => routes.includes(item as typeof routes[number]))
  ? [...new Set(["graphs" as const, ...selectedRoutes as (typeof routes[number])[]])] : routes;
const cycleCount = Number(process.env.MATH3D_MEMORY_PROFILE_CYCLES ?? 3);
const actionsPerCycle = Number(process.env.MATH3D_MEMORY_PROFILE_ACTIONS ?? 100);
const mib = (bytes: number) => Number(bytesToMiB(bytes).toFixed(1));

test("profile retained renderer allocations across Project and viewer navigation", async ({}, testInfo) => {
  test.skip(process.env.MATH3D_MEMORY_PROFILE !== "1", "Run explicitly for the source navigation diagnostic.");
  test.setTimeout(15 * 60_000);
  const output = path.resolve(process.env.MATH3D_MEMORY_PROFILE_REPORT ?? testInfo.outputPath("navigation-profile.json"));
  const report = { schema: "math3d.release20.navigation-profile/v1", runtimeE2e: null as boolean | null,
    cycles: [] as unknown[], failure: null as string | null };
  const save = () => { mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); };
  let ctx: LaunchedSurfaceApp | null = null;
  save();
  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "0" });
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page, pid = ctx.app.process().pid;
    report.runtimeE2e = !!await page.evaluate(() => window.appRuntime?.e2e);
    if (report.runtimeE2e) throw new Error("Navigation profile requires production runtime mode.");
    if (!pid) throw new Error("Electron PID unavailable.");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Memory.startSampling", { samplingInterval: 32768 });
    await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768 });
    try {
      for (let cycle = 0; cycle < cycleCount; cycle++) {
        for (let action = 0; action < actionsPerCycle; action++) {
          const route = profileRoutes[action % profileRoutes.length]!;
          if (route === "projects") {
            await page.getByTestId("projects-toggle").click();
            const panel = page.getByTestId("project-explorer-panel");
            await expect(panel).toBeVisible();
            await panel.getByRole("button", { name: "Close project explorer" }).click();
            await expect(panel).toHaveCount(0);
          } else {
            await page.getByTestId(`workspace-nav-${route}`).click();
            await expect(page.getByTestId(`workspace-nav-${route}`)).toHaveAttribute("aria-pressed", "true");
          }
        }
        // The Electron test launcher installs inspection globals that are absent
        // from a shipped build and can otherwise anchor entire old App closures.
        const testHooksRemaining = await page.evaluate(() => {
          for (const key of Object.keys(window))
            if (key.startsWith("__MATH3D_E2E_")) delete (window as unknown as Record<string, unknown>)[key];
          return Object.keys(window).filter(key => key.startsWith("__MATH3D_E2E_")).length;
        });
        if (testHooksRemaining) throw new Error(`${testHooksRemaining} test hooks remained after cleanup.`);
        await cdp.send("HeapProfiler.collectGarbage");
        await page.waitForTimeout(2_000);
        if (process.env.MATH3D_MEMORY_PROFILE_SNAPSHOT === "1") {
          const snapshotPath = output.replace(/\.json$/, `-cycle${cycle + 1}.heapsnapshot`);
          const fd = openSync(snapshotPath, "w");
          const receive = ({ chunk }: { chunk: string }) => { writeSync(fd, chunk); };
          cdp.on("HeapProfiler.addHeapSnapshotChunk", receive);
          try { await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false }); }
          finally { cdp.off("HeapProfiler.addHeapSnapshotChunk", receive); closeSync(fd); }
        }
        const heap = await cdp.send("Runtime.getHeapUsage");
        const dom = await cdp.send("Memory.getDOMCounters");
        const native = await cdp.send("Memory.getSamplingProfile");
        const js = await cdp.send("HeapProfiler.getSamplingProfile");
        const heapFrames: { name: string; url: string; line: number; column: number; size: number }[] = [];
        const walk = (node: typeof js.profile.head) => {
          if (node.selfSize > 0) heapFrames.push({ name: node.callFrame.functionName,
            url: node.callFrame.url, line: node.callFrame.lineNumber,
            column: node.callFrame.columnNumber, size: node.selfSize });
          node.children.forEach(walk);
        };
        walk(js.profile.head);
        const tree = await sampleProcessTreeSafely(pid, 0);
        if (tree.error) throw new Error(tree.error);
        const derivedMeshes = await page.evaluate(() => {
          const raw = localStorage.getItem("math3d.surfaceAnalysis.workspace.v1");
          if (!raw) return { count: 0, lastIds: [] as string[] };
          const records = JSON.parse(raw).derivedMeshes ?? [];
          return { count: records.length, lastIds: records.slice(-3).map((item: { identity: { meshId: string } }) => item.identity.meshId) };
        });
        report.cycles.push({ cycle: cycle + 1, rssMiB: mib(tree.rssBytes),
          byRoleMiB: Object.fromEntries(Object.entries(tree.byRole).map(([role, bytes]) => [role, mib(bytes)])),
          heapMiB: { used: mib(heap.usedSize), allocated: mib(heap.totalSize),
            backing: mib(heap.backingStorageSize ?? 0), embedder: mib(heap.embedderHeapUsedSize ?? 0) },
          dom, derivedMeshes, native: { samples: native.profile.samples.length,
            top: [...native.profile.samples].sort((a, b) => b.total - a.total).slice(0, 15)
              .map(item => ({ totalMiB: mib(item.total), sizeMiB: mib(item.size), stack: item.stack.slice(0, 5) })) },
          js: { samples: js.profile.samples.length, top: heapFrames.sort((a, b) => b.size - a.size)
            .slice(0, 20).map(item => ({ name: item.name, url: item.url, sizeMiB: mib(item.size) })) } });
        save();
      }
    } finally {
      await cdp.send("Memory.stopSampling");
      await cdp.send("HeapProfiler.stopSampling");
      await cdp.detach();
    }
  } catch (error) { report.failure = (error as Error).message; throw error; }
  finally { save(); await closeSurfaceApp(ctx); }
});
