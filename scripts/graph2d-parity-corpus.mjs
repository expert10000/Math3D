import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(root, "output/graph2d-parity"); mkdirSync(output, { recursive: true });
const runs = [{ id: "utc", timezone: "UTC", lang: "en_US.UTF-8" },
  { id: "auckland", timezone: "Pacific/Auckland", lang: "pl_PL.UTF-8" }];
const reports = [];
for (const run of runs) {
  const path = resolve(output, `${run.id}.json`);
  const child = spawnSync(process.execPath, [resolve(root, "renderer/node_modules/vitest/vitest.mjs"), "run", "--config", "renderer/vite.config.ts",
    "tests/unit/mobileGraphParityCorpus.test.ts"], { cwd: root, stdio: "inherit", env: { ...process.env, TZ: run.timezone, LANG: run.lang, GRAPH2D_CORPUS_REPORT: path } });
  if (child.error || child.status !== 0) throw child.error ?? new Error(`Corpus failed in ${run.id}.`);
  const report = JSON.parse(readFileSync(path, "utf8"));
  if (report.runtime.timezone !== run.timezone) throw new Error(`Requested timezone ${run.timezone} was not applied.`);
  const hash = createHash("sha256").update(JSON.stringify(report.portable)).digest("hex");
  reports.push({ ...report.runtime, hash });
}
if (reports[0].hash !== reports[1].hash) throw new Error("Portable corpus diverges between process locale/timezone environments.");
console.log(JSON.stringify({ ok: true, runs: reports }, null, 2));
