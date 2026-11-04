import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BUNDLED_QUANTUM_SCENE_EXAMPLES, bundledQuantumSceneDirectory } =
  require("../dist/main/quantumScene/examples.js");
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reviewRoot = resolve(process.argv[2] ?? "output/quantum-review-package");
const fixtureRoot = resolve("tests/fixtures/quantum-scene");
const screenshots = JSON.parse(await readFile(join(reviewRoot, "Math3D", "capture-index.json"), "utf8"));
const screenshotById = new Map(screenshots.map(item => [item.id, item]));

const results = new Map();
for (const name of await readdir(fixtureRoot)) {
  if (!name.endsWith("producer-result.json")) continue;
  const bytes = await readFile(join(fixtureRoot, name));
  const parsed = JSON.parse(bytes.toString("utf8"));
  results.set(sha(bytes), { file: name, value: parsed });
}

const checked = [];
for (const example of BUNDLED_QUANTUM_SCENE_EXAMPLES) {
  const screenshot = screenshotById.get(example.id);
  assert(screenshot?.file && !screenshot.error, `Missing capture: ${example.id}`);
  await readFile(join(reviewRoot, "Math3D", screenshot.file));
  const directory = bundledQuantumSceneDirectory(example, resolve("."), "", false);
  const imported = await importQuantumSceneBundle(directory);
  const scene = imported.source;
  assert.equal(sceneFingerprint(imported), example.fingerprint, `${example.id}: pinned fingerprint`);
  assert.equal(scene.provenance.model.length > 0, true, `${example.id}: model`);
  assert.equal(scene.coordinates.axes.length, 3, `${example.id}: axes`);
  assert.equal(scene.coordinates.units.length, 3, `${example.id}: coordinate units`);
  assert(scene.datasets.every(item => item.unit && imported.arrays.has(item.id)), `${example.id}: dataset/unit`);
  const producer = results.get(scene.provenance.resultSha256);
  if (producer?.value?.schema === "quantum-result/v1") {
    assert.equal(producer.value.runId, scene.provenance.runId, `${example.id}: run ID`);
    assert.equal(producer.value.model.type, scene.provenance.model, `${example.id}: model type`);
    assert.deepEqual(producer.value.model.parameters, scene.provenance.parameters, `${example.id}: inputs`);
    assert.equal(producer.value.engine.name, scene.provenance.engine, `${example.id}: engine`);
  }
  checked.push({ id: example.id, label: example.label, labModel: scene.provenance.model,
    runId: scene.provenance.runId, resultSha256: scene.provenance.resultSha256,
    schema: scene.schema, coordinateAxes: scene.coordinates.axes, coordinateUnits: scene.coordinates.units,
    datasetUnits: [...new Set(scene.datasets.map(item => item.unit))], math3dView: example.label,
    screenshot: screenshot.file, variants: screenshot.variants ?? [], sceneFingerprint: example.fingerprint,
    producerResult: producer?.file ?? null,
    evidence: producer ? "scene and saved producer result bytes verified" : "scene bytes verified; producer result bytes not archived here" });
}

// Representative numerical round trips compare decoded Math3D data with immutable Lab values.
const sampleChecks = [
  { id: "bbh-finite", dataset: "midgap-density", result: "analysis.finite.midgapDensity" },
  { id: "rice-mele-bands", dataset: "band-energy-0", result: "analysis.lowerBand" },
  { id: "landau-levels", dataset: "level-0-energy", result: "analysis.energies[*][0]",
    expected: value => value.analysis.energies.map(row => row[0]) },
];
const samples = [];
for (const check of sampleChecks) {
  const row = checked.find(item => item.id === check.id);
  assert(row?.producerResult, `${check.id}: archived producer result required`);
  const imported = await importQuantumSceneBundle(bundledQuantumSceneDirectory(
    BUNDLED_QUANTUM_SCENE_EXAMPLES.find(item => item.id === check.id), resolve("."), "", false));
  const value = results.get(row.resultSha256).value;
  const expected = check.expected?.(value) ?? check.result.split(".").reduce((part, key) => part?.[key], value);
  const actual = imported.arrays.get(check.dataset);
  assert(Array.isArray(expected) && actual, `${check.id}: source samples`);
  assert.equal(actual.length, expected.length, `${check.id}: sample count`);
  for (const index of [0, Math.floor(actual.length / 2), actual.length - 1])
    assert(Math.abs(actual[index] - expected[index]) < 1e-10, `${check.id}: sample ${index}`);
  samples.push({ id: check.id, dataset: check.dataset, resultField: check.result,
    indices: [0, Math.floor(actual.length / 2), actual.length - 1],
    values: [actual[0], actual[Math.floor(actual.length / 2)], actual[actual.length - 1]] });
}

const lines = ["# Quantum scene scientific review", "",
  `Reviewed ${checked.length} pinned Math3D scenes and ${samples.length} independent numerical sample mappings.`,
  "", "A matching scene fingerprint verifies the complete scene metadata and each dataset byte hash. A producer result match verifies the archived Lab result bytes against the scene's claimed result SHA-256, run ID, model, inputs and engine. It does not establish publisher identity. Scenes without an archived result are marked accordingly.",
  "", "| Math3D view | Lab model | Saved run | Result SHA-256 | Coordinates and units | Dataset units | Evidence | Screenshot |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...checked.map(item => `| ${item.math3dView} | \`${item.labModel}\` | \`${item.runId}\` | \`${item.resultSha256}\` | ${item.coordinateAxes.map((axis, i) => `${axis} (${item.coordinateUnits[i]})`).join("; ")} | ${item.datasetUnits.join("; ")} | ${item.producerResult ? `saved bytes: \`${item.producerResult}\`` : "scene only"} | [${item.screenshot}](Math3D/${item.screenshot}) |`),
  "", "## Exact value checks", "",
  ...samples.map(item => `- ${item.id}: decoded \`${item.dataset}\` samples ${item.indices.join(", ")} equal archived \`${item.resultField}\` values ${item.values.join(", ")}.`),
  "", "The pinned examples are offline fixtures. Their saved run IDs are source claims, not a guarantee that the same run exists in the user's current Theory Lab profile. Live handoff requires Lab to reverify its own run store.", ""];
await writeFile(join(reviewRoot, "scene-review-matrix.json"), JSON.stringify({ format: "quantum-scene-review/v1", scenes: checked, samples }, null, 2));
await writeFile(join(reviewRoot, "scene-review-matrix.md"), lines.join("\n"));
console.log(`Reviewed ${checked.length} scenes; ${checked.filter(item => item.producerResult).length} archived producer results; ${samples.length} numerical sample mappings.`);
