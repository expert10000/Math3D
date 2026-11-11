import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index < 0 ? fallback : args[index + 1];
};
const mode = args.includes("--installed") ? "installed" : "source";
const root = process.cwd();
const policyPath = path.resolve(value("--budget", "docs/releases/2.0.0/PERFORMANCE_BUDGETS.json"));
const reportPath = path.resolve(value("--report", "docs/releases/2.0.0/evidence/m3d20-10-source-final.json"));
const stressDir = path.resolve(value("--stress-dir", "docs/releases/2.0.0/evidence"));
const outputPath = path.resolve(value("--output", "test-results/m3d20-10-gate.json"));
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const checks = [];
const check = (name, actual, limit, pass, detail = "") => checks.push({ name, actual, limit, pass, ...(detail ? { detail } : {}) });
const finish = () => {
  const result = { schema: "math3d.release20.performance-gate.v1", mode, checkedAt: new Date().toISOString(),
    policy: path.relative(root, policyPath), report: path.relative(root, reportPath),
    status: checks.every(item => item.pass) ? "pass" : "fail", checks };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}: ${item.actual} (limit ${item.limit})${item.detail ? ` — ${item.detail}` : ""}`);
  console.log(`${result.status.toUpperCase()} ${outputPath}`);
  if (result.status !== "pass") process.exitCode = 1;
};

try {
  const policy = read(policyPath);
  const budget = policy[mode];
  if (!budget?.qualified) {
    check("qualified budget", false, true, false, `${mode} candidate has no measured, frozen budget`);
    finish();
    process.exit();
  }
  const report = read(reportPath);
  check("receipt schema", report.schema, "math3d.release20.performance.v1", report.schema === "math3d.release20.performance.v1");
  check("host", `${report.hardware?.os} | ${report.hardware?.arch} | ${report.hardware?.cpu}`,
    `${budget.hardware.os} | ${budget.hardware.arch} | ${budget.hardware.cpu}`,
    report.hardware?.os === budget.hardware.os && report.hardware?.arch === budget.hardware.arch && report.hardware?.cpu === budget.hardware.cpu);
  check("logical CPUs", report.hardware?.logicalCpus, budget.hardware.logicalCpus, report.hardware?.logicalCpus === budget.hardware.logicalCpus);
  check("RAM GiB", report.hardware?.ramGiB, budget.hardware.ramGiB, report.hardware?.ramGiB === budget.hardware.ramGiB);
  check("build identity", `${report.build?.commit ?? "missing"} / dirty=${report.build?.dirty}`,
    "commit + renderer hash + clean build", !!report.build?.commit && !!report.build?.rendererHash && report.build?.dirty === false);
  if (mode === "installed") {
    check("installed package", report.method?.host, "installed candidate with verified package hash",
      report.method?.host === "Windows installed candidate" && report.package?.sha256 === budget.packageSha256);
  } else {
    check("source host", report.method?.host, "Windows Electron source checkout", report.method?.host === "Windows Electron source checkout");
  }
  check("mesh dataset", `${report.datasets?.mesh?.bytes} / ${report.datasets?.mesh?.sha256}`,
    `${budget.datasets.mesh.bytes} / ${budget.datasets.mesh.sha256}`,
    report.datasets?.mesh?.bytes === budget.datasets.mesh.bytes && report.datasets?.mesh?.sha256 === budget.datasets.mesh.sha256);
  check("volume dataset", report.datasets?.volume?.dimensions?.join("×"), budget.datasets.volume.dimensions.join("×"),
    report.datasets?.volume?.dimensions?.join("×") === budget.datasets.volume.dimensions.join("×"));
  check("Project dataset", `${report.datasets?.project?.starterId} / ${report.datasets?.project?.savedResultCount}`,
    `${budget.datasets.project.starterId} / ${budget.datasets.project.savedResultCount}`,
    report.datasets?.project?.starterId === budget.datasets.project.starterId &&
      report.datasets?.project?.savedResultCount === budget.datasets.project.savedResultCount);
  for (const [name, limits] of Object.entries(budget.profiles)) {
    const profile = report.profiles?.[name];
    check(`${name} samples`, profile?.samplesMs?.length, `at least ${budget.minSamples}`, profile?.samplesMs?.length >= budget.minSamples);
    check(`${name} p95 ms`, profile?.p95Ms, limits.p95Ms, Number.isFinite(profile?.p95Ms) && profile.p95Ms <= limits.p95Ms);
    if (limits.peakRssMiB != null)
      check(`${name} peak RSS MiB`, profile?.peakRssMiB, limits.peakRssMiB,
        Number.isFinite(profile?.peakRssMiB) && profile.peakRssMiB <= limits.peakRssMiB);
    if (limits.warmCopyMaxMs != null)
      check(`${name} warm copy max ms`, Math.max(...(profile?.warmCopyMs ?? [])), limits.warmCopyMaxMs,
        profile?.warmCopyMs?.length === 2 && profile.warmCopyMs.every(value => value <= limits.warmCopyMaxMs));
  }
  check("whole profile peak RSS MiB", report.peakProcessTreeRssMiB, budget.peakProcessTreeRssMiB,
    Number.isFinite(report.peakProcessTreeRssMiB) && report.peakProcessTreeRssMiB <= budget.peakProcessTreeRssMiB);
  if (mode === "source") {
    for (const [name, validate] of Object.entries({
      "m3d20-10-navigation-100": value => value.actionCount === 100 && value.checkpoints?.length === 12 &&
        value.pageErrors?.length === 0 && value.peakSampledRssMiB <= budget.navigationPeakRssMiB,
      "m3d20-10-volume-failures": value => value.contextLoss === "observed and restored" &&
        value.cancellation === "cancelled old extraction" && value.newerResult === "complete",
      "m3d20-10-quad-restart": value => value.panes === 4 && value.lazyPreviewAfterRestart === true &&
        value.savedProjectReopened === true,
    })) {
      const stress = read(path.join(stressDir, `${name}.json`));
      check(`${name} build`, stress.build?.rendererHash, report.build?.rendererHash,
        stress.build?.rendererHash === report.build?.rendererHash);
      check(name, validate(stress), true, validate(stress));
    }
  }
} catch (error) {
  check("receipt read/validation", error instanceof Error ? error.message : String(error), "valid files", false);
}
finish();
