import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const reportRoot = path.resolve(process.argv[2] ?? path.join(repoRoot, "output", "memory-profiles"));
const maxReports = Number(process.env.MATH3D_MEMORY_PROFILE_SUMMARY_LIMIT ?? 12);

const formatNumber = (value, digits = 1) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "";
};

const readReports = async () => {
  const entries = await fs.readdir(reportRoot, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(reportRoot, entry.name));

  const reports = [];
  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      const report = JSON.parse(await fs.readFile(file, "utf8"));
      reports.push({ file, stat, report });
    } catch (error) {
      console.warn(`[memory-profile-summary] skipped ${file}: ${String(error?.message ?? error)}`);
    }
  }

  return reports.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, maxReports);
};

const moduleRows = (report) => {
  const checkpoints = report.scenarioResult?.checkpoints ?? [];
  return checkpoints.map((checkpoint) => ({
    module: checkpoint.label,
    rssMiB: formatNumber((checkpoint.processMemory?.rssBytes ?? 0) / 1024 / 1024),
    rendererUsedHeapMiB: formatNumber((checkpoint.rendererMemory?.usedJSHeapSize ?? 0) / 1024 / 1024),
    atSec: formatNumber((checkpoint.atMs ?? 0) / 1000, 1),
  }));
};

const reports = await readReports();
if (!reports.length) {
  console.log(`[memory-profile-summary] no reports found in ${reportRoot}`);
  process.exit(0);
}

const rows = reports.map(({ file, report }) => ({
  scenario: report.scenario,
  module: report.scenarioResult?.targetModule ?? "",
  measuredAt: report.measuredAt,
  actions: report.scenarioResult?.actions ?? report.actionCount,
  aborted: report.scenarioResult?.aborted ? "yes" : "",
  delayMs: report.actionDelayMs ?? "",
  peakMiB: formatNumber(report.summary?.peakRssMiB),
  finalMiB: formatNumber(report.summary?.finalRssMiB),
  deltaMiB: formatNumber(report.summary?.deltaFinalMinusInitialMiB),
  rendererPeakMiB: formatNumber(report.summary?.rolePeakMiB?.renderer),
  gpuPeakMiB: formatNumber(report.summary?.rolePeakMiB?.["gpu-process"]),
  whiteScreens: report.whiteScreenEvents?.length ?? 0,
  report: path.relative(repoRoot, file),
}));

console.table(rows);

for (const { report } of reports) {
  if (report.scenario !== "module-sweep") continue;
  const rowsForModules = moduleRows(report);
  if (!rowsForModules.length) continue;
  console.log(`\nModule checkpoints for ${report.measuredAt}`);
  console.table(rowsForModules);
  break;
}
