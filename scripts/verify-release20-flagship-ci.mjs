#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const [artifactDir, outputFile] = process.argv.slice(2);
if (!artifactDir || !outputFile) throw new Error("Usage: verify-release20-flagship-ci.mjs <downloaded-artifacts> <receipt-json>");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const read = path => existsSync(path) ? readFileSync(path) : null;
const hash = bytes => bytes ? createHash("sha256").update(bytes).digest("hex") : null;
const root = resolve(artifactDir);
const desktopBytes = read(join(root, "release20-flagship-desktop", "scope-evidence", "desktop.json"));
const sourceBytes = read(join(root, "release20-flagship-sage", "scope-evidence", "source.txt"));
const sageBytes = read(join(root, "release20-flagship-sage", "scope-evidence", "sage-live.json"));
const healthBytes = read(join(root, "release20-flagship-sage", "scope-evidence", "sage-health.json"));
const desktop = desktopBytes ? JSON.parse(desktopBytes) : null;
const sage = sageBytes ? JSON.parse(sageBytes) : null;
const source = sourceBytes?.toString().trim() ?? null;
const receipt = {
  schema: "math3d.release20-flagship-ci/v1", sourceCommit: commit,
  scope: "source desktop journeys and live Docker Sage; installed candidate qualification remains separate",
  jobs: { desktop: process.env.DESKTOP_RESULT ?? null, sage: process.env.SAGE_RESULT ?? null },
  desktop: { sourceCommit: desktop?.sourceCommit ?? null, caseStatus: desktop?.cases?.map(item =>
    ({ id: item.id, status: item.status, tests: item.tests?.map(test => ({ file: test.file,
      testSha256: test.testSha256, outputSha256: test.outputSha256 })) })) ?? [],
    receiptSha256: hash(desktopBytes) },
  sage: { sourceCommit: source, resultSha256: hash(sageBytes), healthSha256: hash(healthBytes),
    expected: sage?.stats?.expected ?? null, unexpected: sage?.stats?.unexpected ?? null },
  status: "failed",
};
const passed = receipt.jobs.desktop === "success" && receipt.jobs.sage === "success"
  && desktop?.sourceCommit === commit && source === commit
  && desktop?.cases?.length === 3 && desktop.cases.every(item => item.status === "passed")
  && sage?.stats?.unexpected === 0 && sage.stats.expected > 0 && healthBytes;
receipt.status = passed ? "passed" : "failed";
const target = resolve(outputFile);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(receipt, null, 2) + "\n");
if (!passed) throw new Error(`Flagship source evidence incomplete; partial receipt: ${target}`);
console.log(`Verified one-commit flagship evidence at ${commit}`);
