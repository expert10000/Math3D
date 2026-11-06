import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const input = process.argv[2];
const output = process.argv[3];
assert(input && output, "Usage: node evaluate-quantum-scene-memory-budget.mjs <stress.json> <budget.json>");
const report = JSON.parse(await readFile(resolve(input), "utf8"));
assert.equal(report.schema, "math3d.quantum-stress/v1");
assert(report.cycles >= 80 && report.samples.length >= 80, "Memory budget needs at least 80 paired scene cycles");
assert(report.heapComposition?.baselineByType?.string && report.heapComposition?.finalByType?.string,
  "Memory budget needs heap snapshots at baseline and final close");

const closedHeap = cycle => report.samples[cycle - 1].closed.heapBytes;
const warmupCycle = 20;
const lastCycle = 80;
const maxLateHeapGrowthBytes = 2 * 1024 * 1024;
const lateHeapGrowthBytes = closedHeap(lastCycle) - closedHeap(warmupCycle);
const stringSelfBytesGrowth = report.heapComposition.finalByType.string.selfBytes -
  report.heapComposition.baselineByType.string.selfBytes;
const result = {
  schema: "math3d/qi40-scene-memory-budget/v1",
  source: input,
  cycles: report.cycles,
  installed: report.installed,
  method: "Forced-GC closed-preview renderer heap; cycle 20 is warmup, cycle 80 is steady-state check",
  warmupCycle,
  lastCycle,
  warmupHeapBytes: closedHeap(warmupCycle),
  finalHeapBytes: closedHeap(lastCycle),
  lateHeapGrowthBytes,
  maxLateHeapGrowthBytes,
  stringSelfBytesGrowth,
  targetMet: lateHeapGrowthBytes <= maxLateHeapGrowthBytes,
  note: "Provisional source target. Installed-build and workload coverage are required before QI-40 memory signoff.",
};
await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(resolve(output), JSON.stringify(result, null, 2) + "\n");
process.stdout.write(JSON.stringify(result) + "\n");
