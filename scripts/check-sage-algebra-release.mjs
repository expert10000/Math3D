#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const matrixPath = resolve(root, "docs/evidence/sage-algebra-release-matrix-2026-11-06.json");
const requireFile = (path) => {
  if (typeof path !== "string" || isAbsolute(path) || path.includes("\\"))
    throw new TypeError("Release evidence path must be repository-relative.");
  const absolute = resolve(root, path), inside = relative(root, absolute);
  if (!inside || inside.startsWith(`..${sep}`) || inside === ".." || !existsSync(absolute))
    throw new TypeError(`Missing or invalid release evidence: ${path}`);
  return absolute;
};

export const auditSageAlgebraRelease = (matrix) => {
  if (!matrix || matrix.format !== "math3d.sage-algebra-release-matrix" || matrix.schemaVersion !== 1 ||
      matrix.evidenceStatus !== "historical" || !Array.isArray(matrix.milestones) ||
      matrix.milestones.length !== 7 || !matrix.b08) throw new TypeError("Invalid algebra release matrix.");
  for (let index = 0; index < 7; index++) {
    const item = matrix.milestones[index];
    if (item?.id !== `M${index}` || !Array.isArray(item.evidence) || item.evidence.length < 1 ||
        !Array.isArray(item.tests) || item.tests.length < 1) throw new TypeError(`Invalid milestone M${index}.`);
    for (const path of [...item.evidence, ...item.tests]) requireFile(path);
  }
  const bytes = readFileSync(requireFile(matrix.b08.path));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== matrix.b08.sha256) throw new TypeError("B08 recorded artifact hash differs from the release matrix.");
  const b08 = JSON.parse(bytes.toString("utf8"));
  if (b08.fixtureCount !== matrix.b08.fixtureCount || b08.fixtureCount !== 16 ||
      b08.local?.version !== matrix.b08.localVersion || b08.docker?.version !== matrix.b08.dockerVersion ||
      b08.local?.status !== "passed" || b08.docker?.status !== "passed" ||
      b08.local?.failures?.length !== 0 || b08.docker?.failures?.length !== 0 ||
      b08.differences?.length !== 0 || Object.keys(b08.local?.cases ?? {}).length !== 16 ||
      Object.keys(b08.docker?.cases ?? {}).length !== 16)
    throw new TypeError("B08 recorded parity result is incomplete or failed.");
  return { status: "historical-evidence-verified", milestones: matrix.milestones.map((item) => item.id),
    b08: { local: b08.local.version, docker: b08.docker.version, casesPerRoute: 16, differences: 0,
      artifactSha256: digest }, currentLiveGate: "not-run" };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8"));
    const result = auditSageAlgebraRelease(matrix);
    if (process.argv.includes("--probe-live")) {
      const docker = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"],
        { encoding: "utf8", timeout: 6000 });
      const wsl = process.platform === "win32" ? spawnSync("wsl", ["-d", "Ubuntu", "-e", "sage", "--version"],
        { encoding: "utf8", timeout: 6000 }) : null;
      result.runtimeProbe = { docker: docker.status === 0 ? docker.stdout.trim() : "unavailable",
        localSage: wsl?.status === 0 ? wsl.stdout.trim() : "unavailable" };
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(`Algebra release audit failed: ${error.message}`); process.exitCode = 1; }
}
