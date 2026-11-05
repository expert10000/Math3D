import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const { resolveFluxSourceRun } = require("../dist/main/quantumScene/fluxSourceRun.js");
const fixture = resolve("tests/fixtures/quantum-scene/fixture-hofstadter-flux-pq4-butterfly.qscene");
const producer = require("../tests/fixtures/quantum-scene/hofstadter-flux-producer-result.json");
const imported = await importQuantumSceneBundle(fixture);
for (const point of producer.points) {
  const request = { fingerprint: sceneFingerprint(imported), objectId: `flux-${point.index}`,
    sampleIndex: 0, runId: point.runId, resultSha256: point.resultSha256 };
  const linked = resolveFluxSourceRun(imported, request);
  assert.equal(linked.runId, point.runId);
  assert.equal(linked.resultSha256, point.resultSha256);
  assert.equal(linked.energy, point.energies[0][0]);
  assert.throws(() => resolveFluxSourceRun(imported, { ...request, runId: "wrong" }), /identity/);
  assert.throws(() => resolveFluxSourceRun(imported, { ...request, sampleIndex: 999999 }), /outside/);
}
assert.throws(() => resolveFluxSourceRun(imported, { fingerprint: sceneFingerprint(imported),
  objectId: "source-0", sampleIndex: 0, runId: producer.points[0].runId,
  resultSha256: producer.points[0].resultSha256 }), /Invalid flux/);
console.log("QI-20 linked flux: every producer run, exact energy, wrong identity and bounds passed");
