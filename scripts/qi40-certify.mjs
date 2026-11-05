import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const option = name => {
  const at = args.indexOf(name);
  if (at < 0) return null;
  if (!args[at + 1] || args[at + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return args[at + 1];
};
const lab = option("--lab");
const reportPath = resolve(option("--report") ?? join(tmpdir(), "math3d-qi40-certification.json"));
const live = args.includes("--live");
const installedLab = option("--installed-lab");
const installedMath3D = option("--installed-math3d");
if (!lab || !isAbsolute(lab)) throw new Error("Pass an absolute Theory Lab checkout with --lab");
if (Boolean(installedLab) !== Boolean(installedMath3D))
  throw new Error("Pass both installed executable paths or neither");
if ((installedLab || installedMath3D) && (!live || !isAbsolute(installedLab) || !isAbsolute(installedMath3D)))
  throw new Error("Installed executable paths require --live and absolute paths");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (command, commandArgs, cwd, env = process.env) => {
  const result = spawnSync(command, commandArgs, { cwd, env, stdio: "inherit",
    shell: process.platform === "win32", timeout: 600_000 });
  if (result.error) throw result.error;
  return result.status ?? 1;
};
const revision = cwd => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(result.stdout.trim()))
    throw new Error("QI-40 requires a committed Git checkout for each app");
  return result.stdout.trim();
};
const gates = [];
const gate = (name, command, commandArgs, cwd, env) => {
  console.log(`\nQI-40 gate: ${name}`);
  const started = Date.now();
  let status = 1;
  try { status = run(command, commandArgs, cwd, env); }
  catch (error) { console.error(`${name}: ${String(error.message ?? error)}`); }
  gates.push({ name, status: status === 0 ? "pass" : "fail", exitCode: status,
    durationMs: Date.now() - started });
};

const math3dCommit = revision(root), theoryLabCommit = revision(lab);
gate("math3d-quantum-release-matrix", npm, ["run", "test:quantum:release:math3d"], root);
gate("theory-lab-types", npm, ["run", "typecheck"], lab);
gate("theory-lab-typescript-tests", npm, ["test"], lab);
gate("theory-lab-worker", npm, ["run", "test:worker"], lab);
gate("theory-lab-scenes", npm, ["run", "test:scenes"], lab);

if (live && gates.every(entry => entry.status === "pass")) {
  gate("theory-lab-build", npm, ["run", "build"], lab);
  if (gates.every(entry => entry.status === "pass")) {
    const env = { ...process.env, QLAB_E2E_CHECKOUT: lab };
    gate("real-two-app-handoff", npx, ["playwright", "test",
      "tests/e2e/quantum-q09-two-app.spec.ts", "--reporter=list"], root, env);
    if (installedLab && installedMath3D && gates.every(entry => entry.status === "pass")) {
      gate("installed-five-run-return", npx, ["playwright", "test",
        "tests/e2e/quantum-rice-mele-two-app.spec.ts", "--reporter=list"], root,
        { ...env, QLAB_E2E_INSTALLED_EXE: installedLab,
          MATH3D_E2E_INSTALLED_EXE: installedMath3D });
    }
  }
}

const report = {
  schema: "math3d.qi40-certification/v1", generatedAt: new Date().toISOString(),
  math3dCommit, theoryLabCommit,
  requested: { live, installed: Boolean(installedLab) },
  gates,
  gateStatus: gates.some(entry => entry.status === "fail") ? "fail" : "pass",
  releaseCertification: "partial",
  limitation: "Source-checkout and installed-app gates are recorded separately; this report alone does not certify QI-40 or a release.",
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "w" });
console.log(`\nQI-40 gate report: ${reportPath}`);
if (report.gateStatus !== "pass") process.exitCode = 1;
