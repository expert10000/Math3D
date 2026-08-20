import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "output");
const suiteDir = path.join(outDir, "mesh-profile-suite");
const defaultMeshes = ["stanford-bunny", "armadillo", "dragon-medium"];

function parseArgs(argv) {
  const args = [...argv];
  const options = { runs: 5, warmup: 1, meshes: [], reuse: false };
  while (args.length) {
    const item = args.shift();
    if (item === "--runs") {
      options.runs = Math.max(1, Number.parseInt(args.shift() ?? "5", 10));
    } else if (item === "--warmup") {
      options.warmup = Math.max(0, Number.parseInt(args.shift() ?? "1", 10));
    } else if (item === "--reuse") {
      options.reuse = true;
    } else if (item === "--help" || item === "-h") {
      options.help = true;
    } else if (item) {
      options.meshes.push(item);
    }
  }
  if (!options.meshes.length) options.meshes = defaultMeshes;
  return options;
}

function percentile(values, p) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil((p / 100) * clean.length) - 1));
  return clean[index];
}

function median(values) {
  return percentile(values, 50);
}

function roundMs(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function formatMs(value) {
  return value == null ? "n/a" : `${roundMs(value)} ms`;
}

function safeMeshId(meshId) {
  return meshId.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

function readRegistry() {
  const registryPath = path.join(repoRoot, "tests", "assets", "meshes", "registry.json");
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

function meshFileBytes(registry, meshId) {
  const model = registry.models.find((entry) => entry.id === meshId);
  if (!model) return null;
  const filePath = path.join(repoRoot, "tests", "assets", "meshes", model.file);
  return existsSync(filePath) ? statSync(filePath).size : null;
}

function runCommand(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const logs = [];
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      process.stdout.write(text);
      logs.push({ stream: "stdout", text });
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      process.stderr.write(text);
      logs.push({ stream: "stderr", text });
    });
    child.once("exit", (code, signal) => resolve({ code, signal, logs }));
  });
}

function parseProfileFromLogs(logs, marker) {
  for (const entry of logs.slice().reverse()) {
    for (const line of String(entry.text).split(/\r?\n/).reverse()) {
      const index = line.indexOf(marker);
      if (index < 0) continue;
      try {
        return JSON.parse(line.slice(index + marker.length).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

function extractPhaseMs(profile, phaseName) {
  if (!profile?.phases) return null;
  let total = 0;
  let seen = false;
  for (const phase of profile.phases) {
    if (phase?.name !== phaseName) continue;
    const ms = Number(phase.ms);
    if (!Number.isFinite(ms)) continue;
    total += ms;
    seen = true;
  }
  return seen ? total : null;
}

function eventPayload(entry) {
  return entry?.packet?.event ?? null;
}

function eventDetails(entry) {
  return eventPayload(entry)?.details ?? {};
}

function extractEventPhaseMs(artifact, phaseName) {
  let total = 0;
  let seen = false;
  for (const entry of artifact.meshDebugEvents ?? []) {
    const event = eventPayload(entry);
    if (event?.label !== phaseName) continue;
    const ms = Number(event.ms);
    if (!Number.isFinite(ms)) continue;
    total += ms;
    seen = true;
  }
  return seen ? total : null;
}

function findEvent(artifact, predicate) {
  return (artifact.meshDebugEvents ?? []).map(eventPayload).find((event) => event && predicate(event)) ?? null;
}

function lastEvent(artifact, predicate) {
  return (artifact.meshDebugEvents ?? [])
    .map(eventPayload)
    .filter((event) => event && predicate(event))
    .at(-1) ?? null;
}

function summarizeDebugEvents(artifact) {
  const summary = {
    peakWorkingSetBytes: null,
    peakJsHeapBytes: null,
    peakGpuEstimateBytes: null,
    workerBufferBytes: null,
    stallCount: 0,
    worstStallMs: null,
    interactionMs: [],
    gpuChunkTotalMs: null,
    gpuChunkMaxMs: null,
    gpuChunkCount: null,
  };
  for (const entry of artifact.meshDebugEvents ?? []) {
    const memory = entry.memory;
    const event = eventPayload(entry);
    const details = event?.details ?? {};
    const workingSet = Number(memory?.workingSetBytes);
    const heap = Number(memory?.jsHeapUsedBytes ?? details.jsHeapUsedBytes);
    const gpu = Number(memory?.gpuEstimateBytes ?? details.gpuMemoryEstimateBytes ?? details.gpuEstimateBytes);
    if (Number.isFinite(workingSet)) {
      summary.peakWorkingSetBytes = Math.max(summary.peakWorkingSetBytes ?? 0, workingSet);
    }
    if (Number.isFinite(heap)) {
      summary.peakJsHeapBytes = Math.max(summary.peakJsHeapBytes ?? 0, heap);
    }
    if (Number.isFinite(gpu)) {
      summary.peakGpuEstimateBytes = Math.max(summary.peakGpuEstimateBytes ?? 0, gpu);
    }
    if (event?.kind === "stall") {
      const ms = Number(event.ms ?? details.ms);
      summary.stallCount += 1;
      if (Number.isFinite(ms)) summary.worstStallMs = Math.max(summary.worstStallMs ?? 0, ms);
    }
    if (event?.kind === "interaction") {
      const ms = Number(event.ms);
      if (Number.isFinite(ms)) summary.interactionMs.push(ms);
    }
    if (event?.label === "full:gpuChunkUpload") {
      const total = Number(details.totalChunkMs ?? event.ms);
      const max = Number(details.maxChunkMs);
      const chunks = Number(details.chunkUploadChunks ?? details.chunks ?? details.chunkIndex);
      if (Number.isFinite(total)) summary.gpuChunkTotalMs = total;
      if (Number.isFinite(max)) summary.gpuChunkMaxMs = max;
      if (Number.isFinite(chunks)) summary.gpuChunkCount = chunks;
    }
    const workerBytes = Number(details.workerBufferBytes ?? details.geometryBytes ?? details.expectedGeometryBytes ?? details.bufferBytes);
    if (Number.isFinite(workerBytes)) {
      summary.workerBufferBytes = Math.max(summary.workerBufferBytes ?? 0, workerBytes);
    }
  }
  return summary;
}

function summarizeArtifact(artifact, meshId, fileBytes) {
  const profile =
    parseProfileFromLogs(artifact.electronLogs ?? [], "[mesh-profile:first-frame]") ??
    parseProfileFromLogs(artifact.electronLogs ?? [], "[mesh-profile]");
  const fullFrame = parseProfileFromLogs(artifact.electronLogs ?? [], "[mesh-full-frame-profile]");
  const debug = summarizeDebugEvents(artifact);
  const loadReady = findEvent(artifact, (event) => event.kind === "load" && String(event.label ?? "").startsWith("Load ready:"));
  const firstFrame = findEvent(artifact, (event) => event.kind === "viewer" && String(event.label ?? "").startsWith("First visible frame:"));
  const fullReady = lastEvent(artifact, (event) => event.kind === "full" && String(event.label ?? "").startsWith("Dedicated Full viewer ready:"));
  const fullWorker = lastEvent(artifact, (event) => event.kind === "full" && String(event.label ?? "").startsWith("Full worker ready:"));
  const phases = [
    "import:fileRead",
    "import:parse",
    "import:fastObjDetect",
    "import:fastObjParse",
    "import:vertexParse",
    "import:faceParse",
    "import:indexBuild",
    "prep:total",
    "prep:validate",
    "app:reactCommit",
    "app:onSampleSet",
    "app:postCommitInspectorState",
    "viewer:meshRebuild",
    "viewer:sampleSetBuilt",
    "viewer:attributeUpdate",
    "viewer:geometryUpdate",
    "viewer:render",
    "full:workerTransferPrepare",
    "full:workerBuild",
    "full:workerNormalCompute",
    "full:workerTransferRoundTrip",
    "full:bufferStorePublish",
    "full:dedicatedViewerReady",
    "full:firstFullFrame",
    "full:viewerAttributeUpdate",
    "full:viewerGeometryUpdate",
    "full:viewerRender",
    "full:gpuChunkUpload",
  ];
  const phaseMs = Object.fromEntries(
    phases.map((phase) => [phase, extractPhaseMs(profile, phase) ?? extractPhaseMs(fullFrame, phase) ?? extractEventPhaseMs(artifact, phase)])
  );
  return {
    meshId,
    ok: artifact.ok === true,
    elapsedMs: artifact.elapsedMs ?? null,
    fileBytes,
    vertexCount: profile?.vertexCount ?? fullFrame?.vertexCount ?? loadReady?.details?.vertices ?? fullWorker?.details?.vertexCount ?? null,
    triangleCount: profile?.triangleCount ?? fullFrame?.triangleCount ?? loadReady?.details?.triangles ?? fullWorker?.details?.triangleCount ?? null,
    firstFrameMs: profile?.firstFrameMs ?? firstFrame?.ms ?? loadReady?.ms ?? null,
    fullFrameMs: fullFrame?.firstFullFrameMs ?? fullReady?.ms ?? null,
    phasesMs: phaseMs,
    stallCount: debug.stallCount,
    worstStallMs: debug.worstStallMs,
    interactionMedianMs: median(debug.interactionMs),
    interactionP90Ms: percentile(debug.interactionMs, 90),
    peakWorkingSetBytes: debug.peakWorkingSetBytes,
    peakJsHeapBytes: debug.peakJsHeapBytes,
    peakGpuEstimateBytes: debug.peakGpuEstimateBytes,
    workerBufferBytes: debug.workerBufferBytes,
    gpuChunkTotalMs: debug.gpuChunkTotalMs,
    gpuChunkMaxMs: debug.gpuChunkMaxMs,
    gpuChunkCount: debug.gpuChunkCount,
  };
}

function aggregateRuns(meshId, runs, fileBytes) {
  const metrics = [
    "elapsedMs",
    "firstFrameMs",
    "fullFrameMs",
    "stallCount",
    "worstStallMs",
    "interactionMedianMs",
    "interactionP90Ms",
    "peakWorkingSetBytes",
    "peakJsHeapBytes",
    "peakGpuEstimateBytes",
    "workerBufferBytes",
    "gpuChunkTotalMs",
    "gpuChunkMaxMs",
  ];
  const phaseNames = Array.from(new Set(runs.flatMap((run) => Object.keys(run.phasesMs ?? {}))));
  const stats = {};
  for (const metric of metrics) {
    const values = runs.map((run) => Number(run[metric])).filter(Number.isFinite);
    stats[metric] = { median: median(values), p90: percentile(values, 90), values };
  }
  const phases = {};
  for (const phase of phaseNames) {
    const values = runs.map((run) => Number(run.phasesMs?.[phase])).filter(Number.isFinite);
    if (values.length) phases[phase] = { median: median(values), p90: percentile(values, 90), values };
  }
  return {
    meshId,
    ok: runs.every((run) => run.ok),
    fileBytes,
    vertexCount: runs.find((run) => run.vertexCount != null)?.vertexCount ?? null,
    triangleCount: runs.find((run) => run.triangleCount != null)?.triangleCount ?? null,
    runCount: runs.length,
    stats,
    phases,
  };
}

function mb(bytes) {
  return bytes == null ? "n/a" : `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

function writeMarkdownReport(report, outFile) {
  const lines = [
    "# Math3D Mesh Profile Suite",
    "",
    `Generated: ${report.finishedAt}`,
    `Runs: ${report.runsPerMesh} measured, ${report.warmupRuns} warmup`,
    "",
    "| Mesh | File | V/F | First frame med/p90 | Full med/p90 | Parse med/p90 | GPU chunk med/p90 | Worst stall med/p90 | Peak RSS med/p90 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const mesh of report.meshes) {
    const parse = mesh.phases["import:parse"];
    const gpu = mesh.stats.gpuChunkTotalMs;
    lines.push(
      [
        mesh.meshId,
        mb(mesh.fileBytes),
        `${mesh.vertexCount ?? "?"}/${mesh.triangleCount ?? "?"}`,
        `${formatMs(mesh.stats.firstFrameMs.median)} / ${formatMs(mesh.stats.firstFrameMs.p90)}`,
        `${formatMs(mesh.stats.fullFrameMs.median)} / ${formatMs(mesh.stats.fullFrameMs.p90)}`,
        `${formatMs(parse?.median ?? null)} / ${formatMs(parse?.p90 ?? null)}`,
        `${formatMs(gpu.median)} / ${formatMs(gpu.p90)}`,
        `${formatMs(mesh.stats.worstStallMs.median)} / ${formatMs(mesh.stats.worstStallMs.p90)}`,
        `${mb(mesh.stats.peakWorkingSetBytes.median)} / ${mb(mesh.stats.peakWorkingSetBytes.p90)}`,
      ].join(" | ")
    );
  }

  lines.push("", "## Full Worker / GPU Split", "");
  lines.push("| Mesh | Worker prepare | Worker build | Normal compute | Transfer round trip | Buffer publish | Dedicated Full ready | GPU chunks |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const mesh of report.meshes) {
    lines.push(
      [
        mesh.meshId,
        formatMs(mesh.phases["full:workerTransferPrepare"]?.median ?? null),
        formatMs(mesh.phases["full:workerBuild"]?.median ?? null),
        formatMs(mesh.phases["full:workerNormalCompute"]?.median ?? null),
        formatMs(mesh.phases["full:workerTransferRoundTrip"]?.median ?? null),
        formatMs(mesh.phases["full:bufferStorePublish"]?.median ?? null),
        formatMs(mesh.stats.fullFrameMs.median),
        formatMs(mesh.stats.gpuChunkTotalMs.median),
      ].join(" | ")
    );
  }

  lines.push("", "## UI / Interaction", "");
  lines.push("| Mesh | React commit | Post-commit inspector | Sample set | Interaction med/p90 | Worst stall med/p90 |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const mesh of report.meshes) {
    lines.push(
      [
        mesh.meshId,
        `${formatMs(mesh.phases["app:reactCommit"]?.median ?? null)} / ${formatMs(mesh.phases["app:reactCommit"]?.p90 ?? null)}`,
        `${formatMs(mesh.phases["app:postCommitInspectorState"]?.median ?? null)} / ${formatMs(mesh.phases["app:postCommitInspectorState"]?.p90 ?? null)}`,
        `${formatMs(mesh.phases["viewer:sampleSetBuilt"]?.median ?? null)} / ${formatMs(mesh.phases["viewer:sampleSetBuilt"]?.p90 ?? null)}`,
        `${formatMs(mesh.stats.interactionMedianMs.median)} / ${formatMs(mesh.stats.interactionP90Ms.p90)}`,
        `${formatMs(mesh.stats.worstStallMs.median)} / ${formatMs(mesh.stats.worstStallMs.p90)}`,
      ].join(" | ")
    );
  }

  lines.push("", "## Memory", "");
  lines.push("| Mesh | Peak RSS med/p90 | Peak JS heap med/p90 | Worker buffers | GPU estimate |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const mesh of report.meshes) {
    lines.push(
      [
        mesh.meshId,
        `${mb(mesh.stats.peakWorkingSetBytes.median)} / ${mb(mesh.stats.peakWorkingSetBytes.p90)}`,
        `${mb(mesh.stats.peakJsHeapBytes.median)} / ${mb(mesh.stats.peakJsHeapBytes.p90)}`,
        `${mb(mesh.stats.workerBufferBytes.median)} / ${mb(mesh.stats.workerBufferBytes.p90)}`,
        `${mb(mesh.stats.peakGpuEstimateBytes.median)} / ${mb(mesh.stats.peakGpuEstimateBytes.p90)}`,
      ].join(" | ")
    );
  }

  lines.push("", "## OBJ Sub-Stages", "");
  lines.push("| Mesh | fastObjDetect | fastObjParse | vertexParse | faceParse | indexBuild |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const mesh of report.meshes) {
    lines.push(
      [
        mesh.meshId,
        formatMs(mesh.phases["import:fastObjDetect"]?.median ?? null),
        formatMs(mesh.phases["import:fastObjParse"]?.median ?? null),
        formatMs(mesh.phases["import:vertexParse"]?.median ?? null),
        formatMs(mesh.phases["import:faceParse"]?.median ?? null),
        formatMs(mesh.phases["import:indexBuild"]?.median ?? null),
      ].join(" | ")
    );
  }
  writeFileSync(outFile, `${lines.join("\n")}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/mesh-profile-suite.mjs [--runs N] [--warmup N] [--reuse] [mesh-id ...]");
    return;
  }
  mkdirSync(suiteDir, { recursive: true });
  const registry = readRegistry();
  const startedAt = new Date().toISOString();
  const meshReports = [];
  const failures = [];

  for (const meshId of options.meshes) {
    const fileBytes = meshFileBytes(registry, meshId);
    const runs = [];
    const totalRuns = options.warmup + options.runs;
    for (let index = 0; index < totalRuns; index += 1) {
      const warmup = index < options.warmup;
      const runNumber = warmup ? index + 1 : index - options.warmup + 1;
      console.log(`[mesh-profile-suite] ${meshId} ${warmup ? "warmup" : "run"} ${runNumber}/${warmup ? options.warmup : options.runs}`);
      const copyName = `${safeMeshId(meshId)}-${warmup ? "warmup" : "run"}-${runNumber}.json`;
      const copyPath = path.join(suiteDir, copyName);
      const traceFile = path.join(outDir, `mesh-full-trace-${safeMeshId(meshId)}.json`);
      const result = options.reuse && existsSync(copyPath) ? { code: 0, signal: null } : await runCommand(process.execPath, ["scripts/mesh-full-trace.mjs", meshId], {});
      let artifact = null;
      if (options.reuse && existsSync(copyPath)) {
        artifact = JSON.parse(readFileSync(copyPath, "utf8"));
      } else if (existsSync(traceFile)) {
        copyFileSync(traceFile, copyPath);
        artifact = JSON.parse(readFileSync(traceFile, "utf8"));
      }
      if (result.code !== 0 || !artifact?.ok) {
        failures.push({ meshId, warmup, runNumber, code: result.code, signal: result.signal, traceFile: existsSync(traceFile) ? copyPath : null });
        if (!warmup) {
          runs.push({ meshId, ok: false, elapsedMs: null, phasesMs: {}, fileBytes });
        }
        continue;
      }
      if (!warmup) {
        runs.push(summarizeArtifact(artifact, meshId, fileBytes));
      }
    }
    meshReports.push(aggregateRuns(meshId, runs, fileBytes));
  }

  const report = {
    ok: failures.length === 0 && meshReports.every((mesh) => mesh.ok),
    startedAt,
    finishedAt: new Date().toISOString(),
    runsPerMesh: options.runs,
    warmupRuns: options.warmup,
    meshes: meshReports,
    failures,
  };
  const jsonOut = path.join(outDir, "mesh-profile-suite.json");
  const mdOut = path.join(outDir, "mesh-profile-suite.md");
  writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  writeMarkdownReport(report, mdOut);
  console.log(`[mesh-profile-suite] wrote ${jsonOut}`);
  console.log(`[mesh-profile-suite] wrote ${mdOut}`);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[mesh-profile-suite] failed", error);
  process.exitCode = 1;
});
