import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const { inspectVerifiedUte2TopologyReceipt, inspectVerifiedUte2EdgeReceipt } =
  require("../dist/main/quantumScene/ute2TopologyReceipt.js");
const root = resolve("tests/fixtures/quantum-ute2");
const names = {
  nontrivial: "ute2-topology-e01f7946b06ec3b8c1cdc9f2.qscene",
  trivial: "ute2-topology-8c7e1adb52adbf67f3a985ba.qscene",
  closed: "ute2-topology-36afb5533e86e41cb5f62e02.qscene",
  unresolved: "ute2-topology-fa1a88ef616dc7e78163c7e9.qscene",
  edge: "ute2-edge-2c6dc075ccd12bc67ac92b2d.qscene",
};
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const temp = await mkdtemp(join(tmpdir(), "math3d-ute2-topology-test-"));
try {
  const imported = Object.fromEntries(await Promise.all(Object.entries(names).map(async ([key, name]) =>
    [key, await importQuantumSceneBundle(join(root, name))])));
  const bulk = key => inspectVerifiedUte2TopologyReceipt(imported[key],
    { fingerprint: sceneFingerprint(imported[key]) });
  const nontrivial = bulk("nontrivial"), trivial = bulk("trivial"), closed = bulk("closed"),
    unresolved = bulk("unresolved");
  assert.equal(nontrivial.status, "defined"); assert.equal(nontrivial.chern, -1);
  assert.ok(nontrivial.bulkGap > 0);
  assert.equal(trivial.status, "defined"); assert.equal(trivial.chern, 0);
  assert.equal(closed.status, "gap_closed"); assert.equal(closed.chern, null);
  assert.equal(closed.bulkGap, 0);
  assert.equal(unresolved.status, "mesh_unresolved"); assert.equal(unresolved.chern, null);
  const edge = inspectVerifiedUte2EdgeReceipt(imported.edge,
    { fingerprint: sceneFingerprint(imported.edge) });
  assert.equal(edge.source.bulkRunId, nontrivial.runId);
  assert.equal(edge.source.bulkResultSha256, nontrivial.resultSha256);
  assert.equal(edge.source.bulkChern, nontrivial.chern);
  assert.deepEqual(edge.widths.map(item => item.width), [12, 24]);
  assert.equal(edge.status, "localized_in_gap");

  const changed = join(temp, "changed.qscene");
  await cp(join(root, names.nontrivial), changed, { recursive: true });
  const pointPath = join(changed, "bulk-receipt-positions.f64"), bytes = await readFile(pointPath);
  bytes[0] ^= 1; await writeFile(pointPath, bytes);
  await assert.rejects(importQuantumSceneBundle(changed), /integrity/);

  const forged = join(temp, "forged.qscene");
  await cp(join(root, names.nontrivial), forged, { recursive: true });
  const scenePath = join(forged, "scene.json"), scene = JSON.parse(await readFile(scenePath, "utf8"));
  scene.provenance.parameters.bulkGap += 0.1;
  const sceneBytes = Buffer.from(JSON.stringify(scene, null, 2) + "\n");
  await writeFile(scenePath, sceneBytes);
  await writeFile(join(forged, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
    scene: { path: "scene.json", bytes: sceneBytes.length, sha256: sha(sceneBytes) } }, null, 2) + "\n");
  const forgedImport = await importQuantumSceneBundle(forged);
  assert.throws(() => inspectVerifiedUte2TopologyReceipt(forgedImport,
    { fingerprint: sceneFingerprint(forgedImport) }), /full-gap or mesh receipt/);
  console.log("Class-D bulk receipt, null withholding, linked finite strip, integrity and forged-gap refusal passed");
} finally { await rm(temp, { recursive: true, force: true }); }
