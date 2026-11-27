import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const { inspectVerifiedUte2ReducedBdgSample, inspectVerifiedUte2LatticeBdgSample } =
  require("../dist/main/quantumScene/ute2BdgSample.js");
const root = resolve("tests/fixtures/quantum-ute2");
const fixtures = {
  reducedGapped: join(root, "ute2-bdg-46b6942b44c6e313bc056327.qscene"),
  reducedNode: join(root, "ute2-bdg-826c7f692ef5569b4d169a6a.qscene"),
  latticeGapped: join(root, "ute2-lattice-90a9757e04f8738ba463d9df.qscene"),
  latticeNode: join(root, "ute2-lattice-9838f91e539472e71ee9655b.qscene"),
};
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const temp = await mkdtemp(join(tmpdir(), "math3d-ute2-bdg-test-"));
try {
  const rg = await importQuantumSceneBundle(fixtures.reducedGapped);
  const rn = await importQuantumSceneBundle(fixtures.reducedNode);
  const lg = await importQuantumSceneBundle(fixtures.latticeGapped);
  const ln = await importQuantumSceneBundle(fixtures.latticeNode);
  const reduced = (imported, sampleIndex) => inspectVerifiedUte2ReducedBdgSample(imported,
    { fingerprint: sceneFingerprint(imported), sampleIndex });
  const lattice = (imported, sampleIndex) => inspectVerifiedUte2LatticeBdgSample(imported,
    { fingerprint: sceneFingerprint(imported), sampleIndex });
  const gappedSector = reduced(rg, 25), closedSector = reduced(rn, 25);
  assert.equal(gappedSector.energies.positive, 0.5);
  assert.equal(gappedSector.pairingPhaseRad, 0.3);
  assert.equal(gappedSector.sampledNode, false);
  assert.equal(closedSector.sampledNode, true);
  assert.equal(closedSector.pairingPhaseRad, null);
  assert.equal(closedSector.electronWeight, null);
  assert.equal(reduced(rn, 26).electronWeight, 1);
  assert.throws(() => reduced(rg, 51), /outside/);

  const gappedLattice = lattice(lg, 0);
  assert.equal(gappedLattice.model, "square_lattice_px_py");
  assert.equal(gappedLattice.sampledNode, false);
  const definedPhase = lattice(lg, 1);
  assert.equal(definedPhase.pairing.phaseDefined, true);
  assert.ok(Number.isFinite(definedPhase.pairing.phaseRad));
  assert.equal(definedPhase.coherence.defined, true);
  const nodeMask = ln.arrays.get("node-mask-scalars");
  const nodeIndex = nodeMask.findIndex(value => value === 1);
  assert.ok(nodeIndex >= 0);
  const node = lattice(ln, nodeIndex);
  assert.equal(node.sampledNode, true);
  assert.equal(node.coherence.defined, false);
  assert.equal(node.coherence.electronWeight, null);
  assert.equal(node.pairing.phaseDefined, false);
  assert.equal(node.pairing.phaseRad, null);
  assert.throws(() => lattice(lg, 256), /outside/);

  const changed = join(temp, "changed.qscene");
  await cp(fixtures.latticeNode, changed, { recursive: true });
  const file = join(changed, "node-mask-scalars.f64"), bytes = await readFile(file);
  bytes[0] ^= 1; await writeFile(file, bytes);
  await assert.rejects(importQuantumSceneBundle(changed), /integrity/);

  const forged = join(temp, "forged.qscene");
  await cp(fixtures.latticeNode, forged, { recursive: true });
  const maskPath = join(forged, "node-mask-scalars.f64"), mask = await readFile(maskPath);
  mask.writeDoubleLE(1, 0); await writeFile(maskPath, mask);
  const scenePath = join(forged, "scene.json"), scene = JSON.parse(await readFile(scenePath, "utf8"));
  scene.datasets.find(item => item.id === "node-mask-scalars").sha256 = hash(mask);
  const sceneBytes = Buffer.from(JSON.stringify(scene, null, 2) + "\n"); await writeFile(scenePath, sceneBytes);
  await writeFile(join(forged, "bundle.json"), JSON.stringify({ schema: "quantum-scene-bundle/v1",
    scene: { path: "scene.json", bytes: sceneBytes.length, sha256: hash(sceneBytes) } }, null, 2) + "\n");
  const forgedImport = await importQuantumSceneBundle(forged);
  assert.throws(() => lattice(forgedImport, nodeIndex), /masks disagree/);
  console.log("UTe2 BdG reduced and lattice scenes, defined masks, changed bytes and forged mask refusal passed");
} finally { await rm(temp, { recursive: true, force: true }); }
