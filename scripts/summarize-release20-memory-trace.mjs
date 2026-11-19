import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const [receiptPath, tracePath, outputPath, variant = "unspecified"] = process.argv.slice(2);
if (!receiptPath || !tracePath || !outputPath) {
  throw new Error("Usage: node scripts/summarize-release20-memory-trace.mjs <receipt.json> <trace.json[.gz]> <summary.json> [variant]");
}

const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
const traceBytes = readFileSync(tracePath);
const trace = JSON.parse((tracePath.endsWith(".gz") ? gunzipSync(traceBytes) : traceBytes).toString("utf8"));
const rendererPid = trace.traceEvents.find(event => event.name === "process_name" && event.args?.name === "Renderer")?.pid;
if (!rendererPid) throw new Error("Chromium trace has no named Renderer process.");
const dumps = trace.traceEvents.filter(event => event.ph === "v" && event.pid === rendererPid && event.args?.dumps?.allocators)
  .sort((left, right) => left.ts - right.ts);
const postGc = receipt.cycles.map(cycle => cycle.samples.find(sample => sample.action === 101));
if (receipt.status !== "smoke" || dumps.length !== postGc.length || postGc.some(sample => !sample)) {
  throw new Error(`Trace/receipt cycle mismatch: ${dumps.length} dumps, ${postGc.filter(Boolean).length} post-GC samples, status ${receipt.status}.`);
}

const mib = bytes => Number((bytes / 1024 ** 2).toFixed(1));
const allocatorMiB = (allocators, key) => {
  const hex = allocators[key]?.attrs?.size?.value;
  return hex ? mib(Number.parseInt(hex, 16)) : 0;
};
const categories = ["cc/image_memory", "partition_alloc", "partition_alloc/partitions/buffer",
  "v8", "blink_gc", "malloc", "shared_memory", "discardable"];
const snapshots = dumps.map((event, index) => {
  const allocators = event.args.dumps.allocators;
  const gpuImagePath = Object.keys(allocators).find(key => /^cc\/image_memory\/cache_0x[0-9A-Fa-f]+\/gpu$/.test(key));
  const gpuImages = Object.keys(allocators).filter(key => /^cc\/image_memory\/cache_0x[0-9A-Fa-f]+\/gpu\/image_/.test(key)
    && allocators[key]?.attrs?.size?.value);
  return {
    cycle: index + 1,
    rendererPrivateMiB: postGc[index].rendererPrivateMiB,
    gpuPrivateMiB: postGc[index].gpuPrivateMiB,
    v8UsedMiB: postGc[index].v8UsedMiB,
    compositorGpuImageCount: gpuImages.length,
    compositorGpuImageMiB: gpuImagePath ? allocatorMiB(allocators, gpuImagePath) : 0,
    allocatorsMiB: Object.fromEntries(categories.map(key => [key, allocatorMiB(allocators, key)])),
  };
});
const first = snapshots[0], last = snapshots.at(-1);
const delta = (key) => Number((last[key] - first[key]).toFixed(1));
const summary = {
  schema: "math3d.release20.chromium-memory-trace.v1",
  variant,
  traceSha256: createHash("sha256").update(traceBytes).digest("hex"),
  build: receipt.build,
  host: receipt.host,
  routeSequence: receipt.method.routeSequence,
  elapsedMinutes: Number((receipt.elapsedMs / 60_000).toFixed(1)),
  cycles: snapshots.length,
  note: "Allocator categories can alias memory in other processes; do not sum them or equate their deltas to renderer private bytes.",
  rendererPrivateDeltaMiB: delta("rendererPrivateMiB"),
  compositorImageDeltaMiB: Number((last.allocatorsMiB["cc/image_memory"] - first.allocatorsMiB["cc/image_memory"]).toFixed(1)),
  compositorGpuImageCountDelta: last.compositorGpuImageCount - first.compositorGpuImageCount,
  snapshots,
};
writeFileSync(outputPath, JSON.stringify(summary, null, 2) + "\n");
