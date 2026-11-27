/** Recheck retained installed class-D producer and Math3D consumer evidence by hash. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const [rootArgument, consumerName = "consumer-r4"] = process.argv.slice(2);
if (!rootArgument) throw new Error("Pass installed-pair evidence root and optional consumer directory name");
const root = resolve(rootArgument), require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const { inspectVerifiedUte2TopologyReceipt, inspectVerifiedUte2EdgeReceipt } =
  require("../dist/main/quantumScene/ute2TopologyReceipt.js");
const { openQuantumProjectPack } = require("../dist/main/quantumScene/portableProject.js");
const hashFile = async path => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const producerPath = join(root, "producer", "producer.json"), consumerPath = join(root, consumerName, "consumer.json"),
  mutationPath = join(root, "lab-mutation", "mutation.json");
const producer = await readJson(producerPath), consumer = await readJson(consumerPath), mutation = await readJson(mutationPath);
assert.equal(producer.status, "passed"); assert.equal(consumer.status, "passed");
assert.equal(mutation.status, "passed"); assert.equal(mutation.bulkWithheld, true);
assert.equal(mutation.dependentStripWithheld, true);
assert.equal(consumer.producerSha256, await hashFile(producerPath));
assert.equal(consumer.runId, producer.bulk.runId);
assert.equal(consumer.resultSha256, producer.bulk.resultSha256);
assert.equal(consumer.changedSourceWithheld, true);
const installed = {
  theoryLab: join(root, "install", "TheoryLab"), math3d: join(root, "install", "Math3DDev"),
};
const candidates = {
  theoryLab: join(root, "theory-lab"), math3d: join(root, "math3d"),
};
const binary = {
  theoryLab: "Quantum Hamiltonian Lab.exe", math3d: "Math3D Dev.exe",
};
const installers = {
  theoryLab: "Quantum-Hamiltonian-Lab-Setup-0.1.0.exe", math3d: "Math3D Dev Setup 2.0.0.exe",
};
for (const key of ["theoryLab", "math3d"]) {
  const receipt = key === "theoryLab" ? producer : consumer;
  const exe = join(installed[key], binary[key]);
  assert.equal(await hashFile(exe), receipt.executableSha256);
  assert.equal(await hashFile(join(candidates[key], "win-unpacked", binary[key])), receipt.executableSha256);
  assert.equal(await hashFile(join(installed[key], "resources", "app.asar")), receipt.appAsarSha256);
  const worker = key === "theoryLab" ? "quantum-worker/quantum-worker.exe" : "python-worker/worker.exe";
  assert.equal(await hashFile(join(installed[key], "resources", worker)), receipt.workerSha256);
  assert.equal(await hashFile(join(candidates[key], "win-unpacked", "resources", worker)), receipt.workerSha256);
}
const bulk = await importQuantumSceneBundle(producer.bulk.scene), edge = await importQuantumSceneBundle(producer.edge.scene);
const bulkReceipt = inspectVerifiedUte2TopologyReceipt(bulk, { fingerprint: sceneFingerprint(bulk) });
const edgeReceipt = inspectVerifiedUte2EdgeReceipt(edge, { fingerprint: sceneFingerprint(edge) });
assert.equal(bulkReceipt.runId, producer.bulk.runId);
assert.equal(bulkReceipt.resultSha256, producer.bulk.resultSha256);
assert.equal(bulkReceipt.chern, -1);
assert.equal(edgeReceipt.source.bulkRunId, bulkReceipt.runId);
assert.equal(edgeReceipt.source.bulkResultSha256, bulkReceipt.resultSha256);
assert.equal(edgeReceipt.source.bulkChern, bulkReceipt.chern);
assert.equal(await hashFile(join(producer.bulk.scene, "scene.json")), producer.bulk.sceneSha256);
assert.equal(await hashFile(join(producer.edge.scene, "scene.json")), producer.edge.sceneSha256);
assert.equal(await hashFile(join(producer.profile, "ute2-topology-runs", producer.bulk.runId, "result.json")),
  producer.bulk.resultSha256);
const reportPath = join(root, consumerName, "study-evidence.json"), report = await readJson(reportPath);
assert.equal(await hashFile(reportPath), consumer.studyEvidenceSha256);
assert.equal(report.runId, bulkReceipt.runId);
assert.equal(report.resultSha256, bulkReceipt.resultSha256);
assert.equal(report.values.receipt.chern, -1);
assert.equal(report.values.receipt.bulkGap, bulkReceipt.bulkGap);
assert.equal(report.sources[0].sceneFingerprint, consumer.sceneFingerprint);
assert.ok(report.omissions.some(text => /no UTe₂ material.*Majorana claim/i.test(text)));
const openedPack = await openQuantumProjectPack(consumer.transferredPack, join(root, "verify-pack-cache"));
assert.ok(openedPack.references.some(item => item.sceneFingerprint === consumer.sceneFingerprint));
assert.equal(consumer.transferredProjectId, consumer.projectId);
for (const image of [join(root, "producer", "lab-topology.png"), join(root, consumerName, "math3d-study.png")])
  assert.ok((await stat(image)).size > 10_000);
const manifest = {
  schema: "ute2/installed-two-app-acceptance/v1", status: "passed", checkedAtUtc: new Date().toISOString(),
  scope: "unsigned installed Theory Lab and Math3D Dev pair; source and artifact hashes; toy class-D only",
  theoryLab: { sourceCommit: producer.sourceCommit, installerSha256: await hashFile(join(candidates.theoryLab, installers.theoryLab)),
    executableSha256: producer.executableSha256, workerSha256: producer.workerSha256,
    appAsarSha256: producer.appAsarSha256, signature: "NotSigned" },
  math3d: { sourceCommit: consumer.sourceCommit, installerSha256: await hashFile(join(candidates.math3d, installers.math3d)),
    executableSha256: consumer.executableSha256, workerSha256: consumer.workerSha256,
    appAsarSha256: consumer.appAsarSha256, signature: "NotSigned" },
  runId: bulkReceipt.runId, resultSha256: bulkReceipt.resultSha256,
  bulkSceneSha256: producer.bulk.sceneSha256, edgeSceneSha256: producer.edge.sceneSha256,
  sceneFingerprint: consumer.sceneFingerprint, projectId: consumer.projectId, workbookId: consumer.workbookId,
  studyEvidenceSha256: consumer.studyEvidenceSha256,
  portableProjectSha256: await hashFile(join(consumer.transferredPack, "project.json")),
  portableManifestSha256: await hashFile(join(consumer.transferredPack, "manifest.json")),
  retained: { producerSha256: await hashFile(producerPath), consumerSha256: await hashFile(consumerPath),
    mutationSha256: await hashFile(mutationPath),
    labScreenshotSha256: await hashFile(join(root, "producer", "lab-topology.png")),
    math3dScreenshotSha256: await hashFile(join(root, consumerName, "math3d-study.png")) },
  checks: ["fresh installed producer", "installed result restart", "source-bound bulk and strip export",
    "installed consumer receipt", "Project save and restart", "Workbook citation and evidence JSON",
    "portable Project transfer", "changed Math3D scene withheld", "changed Lab bulk and dependent strip withheld",
    "visible toy and material claim limits"],
  open: ["same-product upgrade and rollback", "publisher signing", "installed memory qualification"],
};
const manifestPath = join(root, "acceptance.json");
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Installed class-D pair passed: ${manifestPath}`);
