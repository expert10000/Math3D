import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { bytesToMiB, sampleProcessTreeSafely } from "./helpers/processMemory";

const minutesText = process.env.MATH3D_MEMORY_SOAK_MINUTES;
const minutes = Number(minutesText);
test.skip(minutesText === undefined, "Set MATH3D_MEMORY_SOAK_MINUTES=120 or more for an intentional long run.");

test("one Electron process retains responsive navigation and records long-run memory", async ({}, testInfo) => {
  if (!Number.isInteger(minutes) || minutes < 120 || minutes > 1440) throw new Error("Memory soak requires 120–1440 whole minutes.");
  test.setTimeout((minutes + 45) * 60_000);
  const reportPath = path.resolve(process.env.MATH3D_MEMORY_SOAK_REPORT || testInfo.outputPath("release20-long-memory.json"));
  const build = JSON.parse(readFileSync("dist/build-identity.json", "utf8"));
  if (build.dirty || !build.commit || !build.rendererHash) throw new Error("Memory soak requires a clean, identified source build.");
  const expectedCommit = process.env.MATH3D_RELEASE20_EXPECTED_COMMIT;
  if (expectedCommit && build.commit !== expectedCommit) throw new Error("Memory soak build differs from the frozen commit.");
  const started = Date.now(), deadline = started + minutes * 60_000;
  const report = {
    schema: "math3d.release20.long-memory.v1", status: "running", build,
    host: { os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length,
      totalMemoryGiB: Math.round(os.totalmem() / 1024 ** 3 * 10) / 10 },
    method: { host: process.env.MATH3D_PACKAGED_APP_EXE ? "installed candidate" : "source checkout",
      packageSha256: process.env.MATH3D_CANDIDATE_INSTALLER_SHA256 || null,
      measurement: "same-process sampled process-tree RSS; GPU allocation and forced-GC heap are not measured" },
    requestedMinutes: minutes, startedAtUtc: new Date(started).toISOString(), elapsedMs: 0,
    pid: 0, cycles: [] as Array<{ startedAtMs: number; finishedAtMs?: number; actions: number;
      samples: Array<{ action: number; elapsedMs: number; rssMiB: number }> }>, pageErrors: [] as string[],
    peakSampledRssMiB: 0, failure: null as string | null,
  };
  const save = () => { mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n"); };
  let ctx: LaunchedSurfaceApp | null = null;
  save();
  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page, pid = ctx.app.process().pid;
    if (!pid) throw new Error("Electron PID unavailable.");
    report.pid = pid;
    page.on("pageerror", error => { report.pageErrors.push(error.message); save(); });
    const routes = ["graphs", "surfaces", "mesh", "volume", "projects"] as const;
    const sample = async (action: number) => {
      const value = await sampleProcessTreeSafely(pid, Date.now() - started);
      if (value.error || value.rssBytes <= 0) throw new Error(value.error || "Process-tree RSS sample unavailable.");
      const rssMiB = Number(bytesToMiB(value.rssBytes).toFixed(1));
      report.peakSampledRssMiB = Math.max(report.peakSampledRssMiB, rssMiB);
      return { action, elapsedMs: Date.now() - started, rssMiB };
    };
    do {
      const cycle = { startedAtMs: Date.now() - started, actions: 0,
        samples: [] as Array<{ action: number; elapsedMs: number; rssMiB: number }>, finishedAtMs: undefined as number | undefined };
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
      if (report.pageErrors.length) throw new Error(`Page error: ${report.pageErrors[0]}`);
      cycle.finishedAtMs = Date.now() - started;
      report.elapsedMs = cycle.finishedAtMs; save();
    } while (Date.now() < deadline);
    report.status = "completed";
  } catch (error) { report.status = "failed"; report.failure = (error as Error).message; throw error; }
  finally {
    report.elapsedMs = Date.now() - started; save();
    await closeSurfaceApp(ctx);
  }
});
