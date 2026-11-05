import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const { BUNDLED_QUANTUM_SCENE_EXAMPLES } = require("../dist/main/quantumScene/examples.js");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const savedQwz = [
  { id: "saved-qwz-curvature", folder: "run-05ce1036d70c466eb4f900944a85c474.qscene",
    fingerprint: "efdbea1c511bfb35270fe0870406834848cc53d2aee21b2ea5907248017e9747" },
  { id: "saved-qwz-bands", folder: "run-05ce1036d70c466eb4f900944a85c474-bands.qscene",
    fingerprint: "d4c5fa4d12fcf3046584e990621e84e618f182191b2c531e81bc3e09edad1bb8" },
];
const savedQec = { id: "saved-ideal-qec", group: "quantum-qec",
  folder: "run-ee2889dc341d4cb88e638f2af4ec6d2d-qec.qscene",
  fingerprint: "e879c0f3e5033429ef0b89fdf59536099d51d61bd346e44ea29651c9a01a2391" };
const fixtures = [
  ...BUNDLED_QUANTUM_SCENE_EXAMPLES.map(item => ({ id: item.id, folder: item.folder,
    group: item.fixtureGroup, fingerprint: item.fingerprint })),
  ...savedQwz.map(item => ({ ...item, group: "quantum-qi01" })),
  savedQec,
].sort((a, b) => a.id.localeCompare(b.id));
assert.equal(BUNDLED_QUANTUM_SCENE_EXAMPLES.length, 36);
assert.equal(new Set(fixtures.map(item => item.id)).size, fixtures.length);
const rows = [];
for (const fixture of fixtures) {
  const folder = resolve("tests/fixtures", fixture.group, fixture.folder);
  const [sceneBytes, imported] = await Promise.all([
    readFile(join(folder, "scene.json")), importQuantumSceneBundle(folder),
  ]);
  const scene = imported.source;
  assert.equal(sceneFingerprint(imported), fixture.fingerprint, fixture.id);
  assert.match(scene.provenance.resultSha256, /^[a-f0-9]{64}$/, fixture.id);
  assert.ok(scene.schema === "quantum-scene/v1" || scene.schema === "quantum-scene/v2", fixture.id);
  rows.push({ id: fixture.id, model: scene.provenance.model, schema: scene.schema,
    runId: scene.provenance.runId, resultSha256: scene.provenance.resultSha256,
    sceneSha256: sha(sceneBytes), fingerprint: fixture.fingerprint,
    datasets: scene.datasets.length, datasetBytes: scene.datasets.reduce((sum, item) => sum + item.bytes, 0),
    objects: scene.objects.length, fields: scene.fields?.length ?? 0 });
}
const report = { schema: "math3d.quantum-release-matrix/v1", fixtureCount: rows.length,
  readerVersions: [...new Set(rows.map(row => row.schema))].sort(), fixtures: rows };
const bytes = JSON.stringify(report, null, 2) + "\n";
const destination = resolve("docs/evidence/quantum-qi40-scene-matrix.json");
if (process.argv.includes("--write")) await writeFile(destination, bytes);
else if (process.argv.includes("--check"))
  assert.equal((await readFile(destination, "utf8")).replaceAll("\r\n", "\n"), bytes,
    "Golden scene matrix changed; review fixtures before updating it");
else process.stdout.write(bytes);
console.error(`Verified ${rows.length} pinned v1/v2 scene fixtures and importer fingerprints`);
