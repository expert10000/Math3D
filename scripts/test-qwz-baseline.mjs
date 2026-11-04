import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const root = resolve("tests/fixtures/quantum-scene");
const runId = "run-97a132d1d712414bb62bb8c9212f517e";
const resultSha256 = "abbcae23a0bb3fe113205cab2ffd769c8c22c79f83cd4369215aba24328d9713";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const cases = [
  {
    folder: `${runId}.qscene`, sceneSha256: "7fbeeecc8b2dda7bd1b6d74dc9e0f8dc67ced7af50d4b295b81f3030fae724a1",
    fingerprint: "a0c0e7947516f2f4132b15155096b9711b3c7eae207f805e9a066371035570b3",
    dataset: "curvature", datasetSha256: "ef18becd24e876a3008ea27daecf3d286b7c2c420f6b54a393d526f81beb1bd9",
    samples: [[0, 0.05555347936383225], [220, -0.5], [440, 0.05555347936383225]],
  },
  {
    folder: `${runId}-bands.qscene`, sceneSha256: "d069ede689bc93219b85e9c3c6f499032ad55f1134a0f6e0d99a5b608c805963",
    fingerprint: "06d389b6094b1633a161252bf0bb8c4bba64f0266294578a3b0b0fd8b7c4e061",
    dataset: "band-energy-0", datasetSha256: "c0ae0cf60f85ff5bf6f8ebb3dee91289e3f7dbd85fb770b3530ed465ab70d7bd",
    samples: [[0, -3], [220, -1.0001247426624473], [440, -2.940838315423097]],
  },
  {
    folder: "run-05ce1036d70c466eb4f900944a85c474.qscene", saved: true,
    sceneSha256: "38f8275bfd0e568251ef44742fe7ef412c958cb066e713558768cc2872af65b5",
    fingerprint: "efdbea1c511bfb35270fe0870406834848cc53d2aee21b2ea5907248017e9747",
    dataset: "curvature", datasetSha256: "ef18becd24e876a3008ea27daecf3d286b7c2c420f6b54a393d526f81beb1bd9",
    samples: [[0, 0.05555347936383225], [220, -0.5], [440, 0.05555347936383225]],
  },
  {
    folder: "run-05ce1036d70c466eb4f900944a85c474-bands.qscene", saved: true,
    sceneSha256: "9759d1e5555fd8c7af7614a08e372593d55398894960f5d96eb41a349555890b",
    fingerprint: "d4c5fa4d12fcf3046584e990621e84e618f182191b2c531e81bc3e09edad1bb8",
    dataset: "band-energy-0", datasetSha256: "c0ae0cf60f85ff5bf6f8ebb3dee91289e3f7dbd85fb770b3530ed465ab70d7bd",
    samples: [[0, -3], [220, -1.0001247426624473], [440, -2.940838315423097]],
  },
];
for (const item of cases) {
  const directory = item.saved ? resolve("tests/fixtures/quantum-qi01", item.folder) : join(root, item.folder);
  const sceneBytes = await readFile(join(directory, "scene.json"));
  assert.equal(sha(sceneBytes), item.sceneSha256);
  const imported = await importQuantumSceneBundle(directory);
  assert.equal(imported.source.schema, "quantum-scene/v1");
  assert.equal(imported.source.provenance.runId, item.saved ? "run-05ce1036d70c466eb4f900944a85c474" : runId);
  assert.equal(imported.source.provenance.resultSha256, item.saved ?
    "01eb644e4a07df9f4aa6f49ce27a61a1e98d920aabd794962f57420ca2d2decf" : resultSha256);
  assert.equal(imported.source.provenance.parameters.mass, -1);
  assert.equal(imported.source.provenance.parameters.grid, 21);
  assert.equal(sceneFingerprint(imported), item.fingerprint);
  const dataset = imported.source.datasets.find(d => d.id === item.dataset);
  assert.equal(dataset.sha256, item.datasetSha256);
  assert.equal(dataset.count, 441);
  for (const [index, value] of item.samples) assert.equal(imported.arrays.get(item.dataset)[index], value);
  if (item.dataset === "band-energy-0") {
    assert.deepEqual(imported.source.bands.grid, [21, 21]);
    assert.equal(imported.source.bands.bulkGap, 2);
    assert.equal(imported.source.datasets.find(d => d.id === "band-energy-1").sha256,
      "b374a679c6c22421dd8330ee31dfe8bfe695670f0321c8deeb8b427474d53654");
    assert.equal(imported.arrays.get("band-energy-1")[220], 1.0001247426624473);
  } else {
    assert.equal(imported.source.topology.invariants.find(i => i.id === "chern").value, -1);
  }
  console.log(`QI-01 Math3D opened ${item.folder}: ${item.fingerprint}`);
}
