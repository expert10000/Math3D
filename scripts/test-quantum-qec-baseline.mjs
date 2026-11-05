import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` :
  value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}` : JSON.stringify(value);
const root = resolve("tests/fixtures/quantum-qec");
const manifest = JSON.parse(await readFile(join(root, "saved-run.json"), "utf8"));
assert.equal(manifest.schema, "qec-repetition-run-manifest/v1");
assert.equal(sha(manifest.payload), manifest.sha256);
const saved = JSON.parse(manifest.payload);
assert.equal(saved.schema, "qec-repetition-run/v1");
assert.equal(saved.runId, "run-ee2889dc341d4cb88e638f2af4ec6d2d");
assert.deepEqual(saved.flips, [0, -1, 1]);
assert.equal(sha(canonical(saved.result)), saved.resultSha256);
const { sha256, ...traceBody } = saved.result;
assert.equal(sha(canonical(traceBody)), sha256);

const expected = { syndrome: [], defects: [], bits: [] };
const bits = [0, 0, 0]; let prior = [0, 0];
for (const [round, flip] of saved.flips.entries()) {
  if (flip >= 0) bits[flip] ^= 1;
  const syndrome = [bits[0] ^ bits[1], bits[1] ^ bits[2]];
  const defects = syndrome.map((bit, index) => bit ^ prior[index]);
  assert.deepEqual(saved.result.rounds[round], { round, flip, syndrome, defects, dataBits: [...bits] });
  expected.syndrome.push(...syndrome);
  expected.defects.push(...defects);
  expected.bits.push(...bits);
  prior = syndrome;
}
assert.deepEqual(saved.result.decoder, { method: "final-syndrome-minimum-weight",
  correctionBit: 2, correctedBits: [1, 1, 1], logicalResult: 1, ambiguousMultipleErrors: true });

const bundle = join(root, `${saved.runId}-qec.qscene`);
const imported = await importQuantumSceneBundle(bundle);
assert.equal(sceneFingerprint(imported), "e879c0f3e5033429ef0b89fdf59536099d51d61bd346e44ea29651c9a01a2391");
assert.equal(imported.source.schema, "quantum-scene/v1");
assert.equal(imported.source.provenance.runId, saved.runId);
assert.equal(imported.source.provenance.jobId, saved.jobId);
assert.equal(imported.source.provenance.resultSha256, saved.resultSha256);
assert.equal(imported.source.provenance.model, "qec_repetition_ideal");
for (const [id, values] of [["qec-syndrome", expected.syndrome],
  ["qec-defects", expected.defects], ["qec-data-bits", expected.bits]])
  assert.deepEqual([...imported.arrays.get(id)], values, id);
console.log("Pinned QEC saved run, 3 rounds, 21 exact recorded bits and scene fingerprint verified");
