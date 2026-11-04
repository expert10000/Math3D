import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const lab = resolve(process.argv[2] ?? "../theory-lab");
const report = process.argv[3] ? resolve(process.argv[3]) : null;
const root = await mkdtemp(join(tmpdir(), "quantum-review-roundtrip-"));
const cases = [
  { name: "BBH finite density", script: "export-bbh-fixture.ts", result: "bbh-producer-result.json",
    dataset: "midgap-density", expected: value => value.analysis.finite.midgapDensity },
  { name: "Rice–Mele periodic bands", script: "export-rice-mele-fixture.ts", result: "rice-mele-producer-result.json",
    dataset: "band-energy-0", expected: value => value.analysis.lowerBand },
  { name: "Landau level fan", script: "export-landau-fixture.ts", result: "landau-producer-result.json",
    dataset: "level-0-energy", expected: value => value.analysis.energies.map(row => row[0]) },
];
const evidence = [];
try {
  for (const [index, item] of cases.entries()) {
    const output = join(root, `case-${index}`);
    await mkdir(output);
    const code = await new Promise((res, rej) => {
      const child = spawn(process.execPath,
        [join(lab, "node_modules", "tsx", "dist", "cli.mjs"), join(lab, "scripts", item.script), output],
        { cwd: lab, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", data => { stderr += data; });
      child.stdout.on("data", data => process.stdout.write(data));
      child.on("error", rej);
      child.on("close", status => status === 0 ? res(status) : rej(new Error(`${item.script}: exit ${status}\n${stderr}`)));
    });
    assert.equal(code, 0);
    const resultBytes = await readFile(join(output, item.result));
    const saved = JSON.parse(resultBytes.toString("utf8"));
    const folders = (await readdir(output)).filter(name => name.endsWith(".qscene"));
    const matches = [];
    for (const folder of folders) {
      const directory = join(output, folder);
      const imported = await importQuantumSceneBundle(directory);
      if (imported.source.provenance.resultSha256 === sha(resultBytes) &&
          imported.arrays.has(item.dataset)) matches.push({ directory, imported });
    }
    assert.equal(matches.length, 1, `${item.name}: matching scene`);
    const { directory, imported } = matches[0];
    assert.equal(imported.source.provenance.runId, saved.runId, `${item.name}: run ID`);
    assert.deepEqual(imported.source.provenance.parameters, saved.model.parameters, `${item.name}: inputs`);
    assert.equal(imported.source.provenance.model, saved.model.type, `${item.name}: model`);
    const actual = imported.arrays.get(item.dataset), expected = item.expected(saved);
    assert.equal(actual.length, expected.length, `${item.name}: sample count`);
    const indices = [0, Math.floor(actual.length / 2), actual.length - 1];
    for (const i of indices) assert(Math.abs(actual[i] - expected[i]) < 1e-10, `${item.name}: sample ${i}`);
    const dataset = imported.source.datasets.find(entry => entry.id === item.dataset);
    assert(dataset?.unit && imported.source.coordinates.units.every(Boolean), `${item.name}: units`);
    const binary = join(directory, dataset.path);
    const bytes = await readFile(binary);
    const damaged = Buffer.from(bytes); damaged[0] ^= 1;
    await writeFile(binary, damaged);
    await assert.rejects(importQuantumSceneBundle(directory), /integrity|SHA|hash/i, `${item.name}: tamper refusal`);
    evidence.push({ case: item.name, producer: item.script, runId: saved.runId, resultSha256: sha(resultBytes),
      scene: folderName(directory), sceneSchema: imported.source.schema, model: saved.model.type,
      coordinateUnits: imported.source.coordinates.units, dataset: item.dataset, datasetUnit: dataset.unit,
      sampleIndices: indices, sampleValues: indices.map(i => actual[i]), tamperRefused: true });
    console.log(`${item.name}: saved bytes, imported samples, units and tamper refusal passed`);
  }
  if (report) await writeFile(report, JSON.stringify({ format: "quantum-roundtrip-review/v1", cases: evidence }, null, 2));
} finally {
  if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("quantum-review-roundtrip-"))
    throw new Error("Unsafe round-trip cleanup path");
  await rm(root, { recursive: true, force: true });
}

function folderName(path) { return path.split(/[\\/]/).at(-1); }
