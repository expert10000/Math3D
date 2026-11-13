#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const temp = mkdtempSync(join(tmpdir(), "math3d-flagship-ci-"));
const artifacts = join(temp, "downloaded");
const receipt = join(temp, "receipt.json");
const put = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
};
const run = (sageResult = "success") => spawnSync(process.execPath,
  ["scripts/verify-release20-flagship-ci.mjs", artifacts, receipt],
  { encoding: "utf8", env: { ...process.env, DESKTOP_RESULT: "success", SAGE_RESULT: sageResult } });
try {
  put(join(artifacts, "release20-flagship-desktop/scope-evidence/desktop.json"), {
    sourceCommit: commit, cases: ["surface", "quantum", "algebra"].map(id =>
      ({ id, status: "passed", tests: [{ file: `${id}.spec.ts`, testSha256: "a", outputSha256: "b" }] })) });
  const sourcePath = join(artifacts, "release20-flagship-sage/scope-evidence/source.txt");
  put(sourcePath, `${commit}\n`);
  put(join(artifacts, "release20-flagship-sage/scope-evidence/sage-live.json"),
    { stats: { expected: 4, unexpected: 0 } });
  put(join(artifacts, "release20-flagship-sage/scope-evidence/sage-health.json"), "{}\n");
  if (run().status !== 0 || JSON.parse(readFileSync(receipt, "utf8")).status !== "passed")
    throw new Error("Matching source evidence should pass");
  put(sourcePath, `${"0".repeat(40)}\n`);
  if (run().status === 0 || JSON.parse(readFileSync(receipt, "utf8")).status !== "failed")
    throw new Error("A stale Sage source must fail with a retained receipt");
  put(sourcePath, `${commit}\n`);
  if (run("failure").status === 0 || JSON.parse(readFileSync(receipt, "utf8")).status !== "failed")
    throw new Error("A failed Sage job must fail the joined receipt");
  console.log("Flagship CI receipt accepts matching source and rejects stale or failed Sage evidence.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
