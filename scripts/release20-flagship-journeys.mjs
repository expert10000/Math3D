#!/usr/bin/env node

/** Source-checkout evidence for the three integrated journeys. Candidate installation is a separate gate. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = [
  { id: "surface", tests: [
    { file: "tests/e2e/project-curated-gallery.spec.ts", grep: "guided Catenoid Study" },
    { file: "tests/e2e/project-surface-ridge-publication.spec.ts" },
  ], claim: "Saved Surface and Mesh curvature error, promoted ridge Curve and Workbook survive restart and source change." },
  { id: "quantum", tests: [
    { file: "tests/e2e/quantum-qi08-study-handoff.spec.ts", grep: "Lab QWZ study handoff" },
  ], claim: "Verified producer QWZ samples match the authored Graph path and survive Project package transfer." },
  { id: "algebra", tests: [
    { file: "tests/e2e/sage-algebraic-locus-scene-desktop.spec.ts", grep: "SAGE-F01/F02 saves exact-source contract" },
    { file: "tests/e2e/sage-ideal-locus-publication.spec.ts" },
  ], claim: "Single-polynomial and two-generator locus evidence retain exact source and reopen offline." },
];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (run.status !== 0) throw new Error(run.stderr || `git ${args.join(" ")} failed`);
  return run.stdout.trim();
};
const planned = cases.map(item => ({ ...item, tests: item.tests.map(test => ({ ...test,
  sha256: sha256(readFileSync(resolve(root, test.file))) })) }));

if (process.argv[2] === "--plan") {
  process.stdout.write(JSON.stringify({ scope: "source-checkout only", cases: planned }, null, 2) + "\n");
  process.exit(0);
}
if (process.argv[2] !== "--run" || !process.argv[3] || process.argv.length !== 4)
  throw new Error("Usage: node scripts/release20-flagship-journeys.mjs --plan | --run <evidence-json>");
if (git("status", "--porcelain", "--untracked-files=no"))
  throw new Error("Flagship evidence requires a clean tracked source tree.");
if (!existsSync(resolve(root, "renderer/dist/index.html")) || !existsSync(resolve(root, "dist/main.js")))
  throw new Error("Build core before source-checkout flagship acceptance.");
const target = resolve(process.argv[3]);
mkdirSync(dirname(target), { recursive: true });
const receipt = { schema: "math3d.release20-flagship-source-evidence/v1", sourceCommit: git("rev-parse", "HEAD"),
  scope: "source-checkout desktop; no installed candidate, runtime availability or GA certification implied",
  startedAt: new Date().toISOString(), cases: [] };
const save = () => writeFileSync(target, JSON.stringify(receipt, null, 2) + "\n");
save();
for (const item of planned) {
  const results = [];
  for (const test of item.tests) {
    const args = [resolve(root, "node_modules/@playwright/test/cli.js"), "test", test.file,
      "--reporter=list", ...(test.grep ? ["--grep", test.grep] : [])];
    const started = Date.now();
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024, timeout: 20 * 60 * 1000 });
    const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
    const result = { file: test.file, grep: test.grep ?? null, testSha256: test.sha256,
      durationMs: Date.now() - started, exitCode: run.status, signal: run.signal,
      outputSha256: sha256(output), outputTail: output.slice(-4000) };
    results.push(result);
    receipt.cases.push({ id: item.id, claim: item.claim, status: run.status === 0 ? "passed" : "failed", tests: [...results] });
    save();
    if (run.status !== 0) throw new Error(`${item.id} journey failed at ${test.file}; partial receipt: ${target}`);
    receipt.cases.pop();
  }
  receipt.cases.push({ id: item.id, claim: item.claim, status: "passed", tests: results });
  save();
}
receipt.completedAt = new Date().toISOString();
save();
process.stdout.write(`Source-checkout flagship journey evidence: ${target}\n`);
