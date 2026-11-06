import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditSageAlgebraRelease } from "./check-sage-algebra-release.mjs";

const matrix = JSON.parse(readFileSync(resolve("docs/evidence/sage-algebra-release-matrix-2026-11-06.json"), "utf8"));

test("H08 accepts the recorded M0–M6 and exact B08 artifact without claiming a current live run", () => {
  assert.deepEqual(auditSageAlgebraRelease(matrix).milestones, ["M0", "M1", "M2", "M3", "M4", "M5", "M6"]);
  assert.equal(auditSageAlgebraRelease(matrix).currentLiveGate, "not-run");
});

test("H08 rejects missing evidence, path traversal and a changed B08 digest", () => {
  assert.throws(() => auditSageAlgebraRelease({ ...matrix, milestones: matrix.milestones.slice(0, 6) }),
    /Invalid algebra release matrix/);
  assert.throws(() => auditSageAlgebraRelease({ ...matrix, milestones: matrix.milestones.map((item, index) =>
    index === 0 ? { ...item, evidence: ["../outside.md"] } : item) }), /Missing or invalid release evidence/);
  assert.throws(() => auditSageAlgebraRelease({ ...matrix, b08: { ...matrix.b08, sha256: "0".repeat(64) } }),
    /artifact hash differs/);
});
