import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { bytesToMiB, sampleProcessTreeSafely } from "./helpers/processMemory";

type Sample = { phase: string; atMs: number; rssMiB: number; error?: string };
type Profile = { samplesMs: number[]; p50Ms: number; p95Ms: number; peakRssMiB: number; sampleCount: number };

const requestedCount = Number(process.env.MATH3D_PERF_SAMPLES || 3);
if (!Number.isInteger(requestedCount) || requestedCount < 3 || requestedCount > 8)
  throw new Error("MATH3D_PERF_SAMPLES must be an integer from 3 to 8.");
const count = requestedCount;
const meshPath = path.resolve("tests/assets/meshes/stress/12_dragon_medium.obj");
const round = (value: number) => Number(value.toFixed(1));
const percentile = (values: number[], q: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(q * values.length) - 1)] ?? 0;

async function sample(pid: number, phase: string, started: number): Promise<Sample> {
  const memory = await sampleProcessTreeSafely(pid, Math.round(performance.now() - started));
  return { phase, atMs: memory.atMs, rssMiB: round(bytesToMiB(memory.rssBytes)), ...(memory.error ? { error: memory.error } : {}) };
}

function sampler(pid: number) {
  const started = performance.now();
  const samples: Sample[] = [];
  let active = true;
  let phase = "idle";
  const loop = (async () => {
    while (active) {
      samples.push(await sample(pid, phase, started));
      await new Promise(resolve => setTimeout(resolve, 750));
    }
  })();
  return {
    samples,
    setPhase: (value: string) => { phase = value; },
    checkpoint: async (value: string) => { samples.push(await sample(pid, value, started)); },
    stop: async () => { active = false; await loop; },
  };
}

function profile(values: number[], samples: Sample[], phase: string): Profile {
  const valid = samples.filter(item => item.phase === phase && item.rssMiB > 0);
  if (!valid.length) throw new Error(`No valid process-memory sample for ${phase}`);
  return { samplesMs: values.map(round), p50Ms: round(percentile(values, 0.5)),
    p95Ms: round(percentile(values, 0.95)), peakRssMiB: Math.max(...valid.map(item => item.rssMiB)), sampleCount: valid.length };
}

async function guided(page: Page, id: string): Promise<void> {
  const panel = page.getByTestId("project-explorer-panel");
  if (!(await panel.isVisible())) await page.getByTestId("projects-toggle").click();
  if (await panel.getByTestId("project-research-nav-gallery").isVisible())
    await panel.getByTestId("project-research-nav-gallery").click();
  else await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
  if (await panel.getByTestId("project-gallery-guided").isVisible()) await panel.getByTestId("project-gallery-guided").click();
  await panel.getByTestId(`curated-study-open-${id}`).click();
  await expect(panel.getByTestId("project-study-view")).toBeVisible({ timeout: 60_000 });
}

test("M3D20-10 source checkout performance profiles", async ({}, testInfo) => {
  test.setTimeout(15 * 60_000);
  const launch = { cold: [] as number[], warm: [] as number[] };
  let ctx: LaunchedSurfaceApp | null = null;
  const reportPath = path.resolve(process.env.MATH3D_PERF_REPORT || testInfo.outputPath("release20-performance.json"));
  try {
    for (let index = 0; index < count; index++) {
      const coldStart = performance.now();
      ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
      launch.cold.push(performance.now() - coldStart);
      const profileDir = ctx.profileDir;
      await ctx.app.close(); ctx = null;
      const warmStart = performance.now();
      ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }, profileDir);
      launch.warm.push(performance.now() - warmStart);
      await closeSurfaceApp(ctx); ctx = null;
    }
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await resetSurfaceAppState(ctx.page);
    console.info(`[release20-perf] measured ${count} cold and warm launches`);
    const page = ctx.page;
    const pid = ctx.app.process().pid;
    if (!pid) throw new Error("Electron process ID unavailable");
    const memory = sampler(pid);
    const durations: Record<string, number[]> = { gallery: [], mesh: [], volume: [], project: [] };
    let meshSummary = "";
    let resultCount = 0;
    try {
      for (let index = 0; index < count; index++) {
        memory.setPhase("gallery");
        const started = performance.now();
        await guided(page, "catenary-study");
        durations.gallery.push(performance.now() - started);
        await memory.checkpoint("gallery");
      }
      console.info(`[release20-perf] measured ${count} first-Study opens`);
      await page.getByTestId("project-research-nav-source").click();
      await expect(page.getByTestId("project-explorer-panel")).toHaveCount(0);
      const meshNav = page.getByTestId("workspace-nav-mesh");
      await meshNav.click();
      await expect(meshNav).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
      await page.getByTestId("mesh-panel-tools").click();
      await expect(page.getByTestId("mesh-workspace-open-mesh-file")).toBeVisible();
      const file = page.getByTestId("mesh-workspace-open-mesh-file").locator('input[type="file"]');
      for (let index = 0; index < count; index++) {
        memory.setPhase("mesh");
        const started = performance.now();
        await file.setInputFiles(meshPath);
        if (index === 0) {
          const summary = page.getByTestId("mesh-workspace-source-summary");
          await expect(summary).toContainText("12_dragon_medium", { timeout: 120_000 });
          meshSummary = (await summary.innerText()).replace(/\s+/g, " ").trim();
        } else {
          await expect(page.getByTestId("mesh-workspace-open-mesh-file")
            .getByRole("button", { name: "Load STL/OBJ/PLY/GLTF" })).toBeEnabled({ timeout: 120_000 });
          await expect(page.getByText("Selected mesh object: 12_dragon_medium.obj")).toBeVisible();
        }
        durations.mesh.push(performance.now() - started);
        await memory.checkpoint("mesh");
        if (index === 0) await page.getByTestId("mesh-workspace-source-summary").getByRole("button", { name: "+ Add" }).click();
      }
      console.info(`[release20-perf] measured ${count} Mesh file loads`);
      await page.getByTestId("workspace-nav-volume").click();
      const controls = page.getByTestId("volume-detailed-controls");
      for (let index = 0; index < count; index++) {
        memory.setPhase("volume");
        const started = performance.now();
        for (const axis of ["Nx", "Ny", "Nz"]) await controls.getByLabel(`Volume dim ${axis}`).fill("128");
        if (await controls.getByTestId("volume-apply-sampling").isEnabled()) await controls.getByTestId("volume-apply-sampling").click();
        await controls.getByTestId("volume-apply-isosurface").click();
        await expect(controls.getByTestId("volume-isosurface-lifecycle")).toContainText("complete", { timeout: 120_000 });
        durations.volume.push(performance.now() - started);
        await memory.checkpoint("volume");
        // Change the source generation so each run performs real sampling and extraction.
        await controls.getByLabel("Volume dim Nx").fill("127");
        await controls.getByTestId("volume-apply-sampling").click();
      }
      console.info(`[release20-perf] measured ${count} Volume extractions`);
      for (let index = 0; index < count; index++) {
        memory.setPhase("project");
        const started = performance.now();
        await guided(page, "mesh-comparison-study");
        const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
        resultCount = project.workspace.results.length;
        expect(resultCount).toBeGreaterThanOrEqual(3);
        await page.getByTestId("project-research-nav-results").click();
        await expect(page.getByTestId("project-detail-tab-results")).toHaveAttribute("aria-current", "page");
        durations.project.push(performance.now() - started);
        await memory.checkpoint("project");
      }
    } finally { await memory.stop(); }
    const allSamples = memory.samples;
    const report = {
      schema: "math3d.release20.performance.v1", recordedAt: new Date().toISOString(),
      build: JSON.parse(readFileSync("dist/build-identity.json", "utf8")),
      hardware: { os: `${os.platform()} ${os.release()}`, arch: os.arch(), cpu: os.cpus()[0]?.model,
        logicalCpus: os.cpus().length, ramGiB: round(os.totalmem() / 1024 ** 3) },
      method: { host: "Windows Electron source checkout", samplesPerProfile: count,
        start: "action invocation", stop: "visible target or completed worker result",
        memory: "sampled process-tree RSS; not GPU allocation", samplePeriodMs: 750,
        firstRouteSample: "fresh UI route; later Gallery and Project samples are warm copies",
        quantiles: "nearest rank; p95 of three observations is the maximum, not a release budget" },
      datasets: { mesh: { path: "tests/assets/meshes/stress/12_dragon_medium.obj",
        bytes: statSync(meshPath).size, sha256: createHash("sha256").update(readFileSync(meshPath)).digest("hex"), summary: meshSummary },
      volume: { dimensions: [128, 128, 128], cells: 128 ** 3, operation: "full isosurface" },
      project: { starterId: "mesh-comparison-study", savedResultCount: resultCount } },
      profiles: { coldStart: { samplesMs: launch.cold.map(round), p50Ms: round(percentile(launch.cold, 0.5)),
        p95Ms: round(percentile(launch.cold, 0.95)) },
      warmStart: { samplesMs: launch.warm.map(round), p50Ms: round(percentile(launch.warm, 0.5)),
        p95Ms: round(percentile(launch.warm, 0.95)) },
      gallery: { ...profile(durations.gallery, allSamples, "gallery"),
        freshFirstMs: round(durations.gallery[0]!), warmCopyMs: durations.gallery.slice(1).map(round) },
      mesh: profile(durations.mesh, allSamples, "mesh"),
      volume: profile(durations.volume, allSamples, "volume"),
      project: { ...profile(durations.project, allSamples, "project"),
        freshFirstMs: round(durations.project[0]!), warmCopyMs: durations.project.slice(1).map(round) } },
      peakProcessTreeRssMiB: Math.max(...allSamples.map(item => item.rssMiB)),
      memorySamples: allSamples,
    };
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  } finally { if (ctx) await closeSurfaceApp(ctx); }
});
