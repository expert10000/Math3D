import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const outputDir = path.join(repoRoot, "output");
const meshIds = process.argv.slice(2).filter((value) => !value.startsWith("-"));
const targets = meshIds.length ? meshIds : ["stanford-bunny", "armadillo", "dragon-medium"];

const run = (meshId) => new Promise((resolve) => {
  const child = spawn(process.execPath, ["scripts/mesh-full-trace.mjs", meshId], {
    cwd: repoRoot,
    env: { ...process.env, MATH3D_MESH_TRACE_MODE: "analysis" },
    stdio: "inherit",
    windowsHide: true,
  });
  child.once("exit", (code, signal) => resolve({ code, signal }));
});

const eventsFrom = (artifact) => (artifact.meshDebugEvents ?? [])
  .map((entry) => entry?.packet?.event)
  .filter(Boolean);

const eventByLabel = (events, label) => events.findLast((event) => event.label === label) ?? null;
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const summarize = (meshId, artifact) => {
  const events = eventsFrom(artifact);
  const load = events.findLast((event) => event.kind === "load" && String(event.label).startsWith("Load ready:"));
  const curvature = eventByLabel(events, "analysis:curvatureWorker");
  const curvatureQueued = eventByLabel(events, "analysis:curvatureQueued");
  const features = eventByLabel(events, "analysis:surfaceFeaturesWorker");
  const overlay = eventByLabel(events, "analysis:overlayReady");
  const probe = events.findLast((event) => event.kind === "interaction" && String(event.label).includes("analysis-probe:"));
  const stalls = events.filter((event) => event.kind === "stall");
  const allStallMs = stalls.map((event) => numeric(event.ms)).filter((value) => value != null);
  const analysisStallMs = stalls
    .filter((event) => curvatureQueued && Number(event.ts) >= Number(curvatureQueued.ts))
    .map((event) => numeric(event.ms))
    .filter((value) => value != null);
  const loadReadyIndex = (artifact.meshDebugEvents ?? []).findLastIndex((entry) => {
    const event = entry?.packet?.event;
    return event?.kind === "load" && String(event.label).startsWith("Load ready:");
  });
  const memory = (artifact.meshDebugEvents ?? [])
    .slice(Math.max(0, loadReadyIndex))
    .map((entry) => numeric(entry?.memory?.workingSetBytes))
    .filter((value) => value != null);
  return {
    meshId,
    ok: artifact.ok === true && !!curvature && !!features && !!overlay && !!probe,
    loadMs: numeric(load?.ms),
    curvatureComputeMs: numeric(curvature?.ms),
    curvatureQueueAndComputeMs: numeric(curvature?.details?.queueAndComputeMs),
    surfaceFeaturesComputeMs: numeric(features?.ms),
    surfaceFeaturesQueueAndComputeMs: numeric(features?.details?.queueAndComputeMs),
    overlayReadyMs: numeric(overlay?.ms),
    probeLatencyMs: numeric(probe?.ms),
    loadWorstUiBlockMs: allStallMs.length ? Math.max(...allStallMs) : 0,
    analysisWorstUiBlockMs: analysisStallMs.length ? Math.max(...analysisStallMs) : 0,
    memoryDeltaBytes: memory.length > 1 ? Math.max(...memory) - memory[0] : null,
  };
};

const ms = (value) => value == null ? "n/a" : `${value.toFixed(1)} ms`;
const mb = (value) => value == null ? "n/a" : `${(value / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  mkdirSync(outputDir, { recursive: true });
  const results = [];
  for (const meshId of targets) {
    console.log(`[mesh-analysis-profile] ${meshId}`);
    const execution = await run(meshId);
    const artifactPath = path.join(outputDir, `mesh-analysis-trace-${meshId.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.json`);
    if (execution.code !== 0 || !existsSync(artifactPath)) {
      results.push({ meshId, ok: false, error: `trace exited ${execution.code ?? execution.signal}` });
      continue;
    }
    results.push(summarize(meshId, JSON.parse(readFileSync(artifactPath, "utf8"))));
  }
  const report = { ok: results.every((result) => result.ok), generatedAt: new Date().toISOString(), results };
  writeFileSync(path.join(outputDir, "mesh-analysis-profile-suite.json"), JSON.stringify(report, null, 2));
  const markdown = [
    "# Mesh Analyze worker profile",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Mesh | Load | Curvature worker | Features worker | Overlay | Probe | Analysis block | Load block | Memory delta |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...results.map((result) => `| ${result.meshId} | ${ms(result.loadMs)} | ${ms(result.curvatureComputeMs)} | ${ms(result.surfaceFeaturesComputeMs)} | ${ms(result.overlayReadyMs)} | ${ms(result.probeLatencyMs)} | ${ms(result.analysisWorstUiBlockMs)} | ${ms(result.loadWorstUiBlockMs)} | ${mb(result.memoryDeltaBytes)} |`),
    "",
  ].join("\n");
  writeFileSync(path.join(outputDir, "mesh-analysis-profile-suite.md"), markdown);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
