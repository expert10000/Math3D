import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");

const [artifactArgument, expectedReportSha256] = process.argv.slice(2);
if (!artifactArgument || !/^[a-f0-9]{64}$/.test(expectedReportSha256 || "")) {
  throw new Error("Usage: node scripts/review-qi40-installed-pair.mjs <downloaded-artifact-root> <installed-pair.json-sha256>");
}

const artifact = resolve(artifactArgument);
const pairDirectory = join(artifact, "test-results", "qi40-unsigned-dev-pair");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const fileSha = async path => sha(await readFile(path));
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const near = (actual, expected, label) => {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: non-finite value`);
  const difference = Math.abs(actual - expected);
  assert.ok(difference < 1e-12, `${label}: ${actual} differs from ${expected} by ${difference}`);
  return difference;
};
// Independent two-band QWZ oracle, using analytic energy and lower-band curvature.
const qwz = (kx, ky, mass) => {
  const sx = Math.sin(kx), sy = Math.sin(ky), cx = Math.cos(kx), cy = Math.cos(ky);
  const z = mass + cx + cy;
  const energy = Math.hypot(sx, sy, z);
  return {
    lower: -energy,
    upper: energy,
    curvature: -(sx * sx * cy + sy * sy * cx + z * cx * cy) / (2 * energy ** 3),
  };
};

const pairPath = join(pairDirectory, "installed-pair.json");
assert.equal(await fileSha(pairPath), expectedReportSha256, "installed pair report hash");
const pair = await readJson(pairPath);
assert.equal(pair.schema, "math3d/qi40-installed-pair/v1");
assert.equal(pair.status, "passed");
for (const check of ["candidate", "install", "freshProducer", "directLaunch", "twoViews"])
  assert.equal(pair.checks[check], "passed", check);
assert.equal(await fileSha(join(artifact, "candidate", "candidate-manifest.json")), pair.candidateManifestSha256);
assert.equal(await fileSha(join(pairDirectory, "consumer", "acceptance.json")), pair.consumerAcceptanceSha256);
assert.equal(await fileSha(join(pairDirectory, "direct", "acceptance.json")), pair.directAcceptanceSha256);

const { runId, resultSha256, mass, grid, chern, manifestSha256, scenes } = pair.freshRun;
assert.match(runId, /^run-[a-f0-9]{32}$/);
assert.equal(grid, 21);
assert.equal(mass, -1);
assert.equal(chern, -1);
assert.equal(scenes.length, 2);
const freshStudyDirectory = join(pairDirectory, "retained", "freshStudy");
const studyPath = join(freshStudyDirectory, "study.json");
assert.equal(await fileSha(studyPath), manifestSha256);
const study = await readJson(studyPath);
assert.equal(study.runId, runId);
assert.equal(study.resultSha256, resultSha256);
assert.deepEqual(study.scenes.map(scene => scene.role).sort(), ["bands", "curvature"]);
const freshRunDirectory = join(pairDirectory, "retained", "freshRun");
const runManifest = await readJson(join(freshRunDirectory, "manifest.json"));
assert.equal(runManifest.schema, "quantum-run-manifest/v1");
assert.equal(runManifest.runId, runId);
assert.equal(runManifest.hashes.result, resultSha256);
assert.equal(runManifest.files.job, "job.json");
assert.equal(runManifest.files.result, "result.json");
assert.equal(await fileSha(join(freshRunDirectory, "job.json")), runManifest.hashes.job);
const job = await readJson(join(freshRunDirectory, "job.json"));
assert.equal(job.schema, "quantum-job/v1");
assert.equal(job.jobId, runManifest.jobId);
assert.equal(job.model.type, "qwz");
assert.equal(job.model.parameters.mass, mass);
assert.equal(job.model.parameters.grid, grid);
const resultPath = join(freshRunDirectory, "result.json");
assert.equal(await fileSha(resultPath), resultSha256);
const result = await readJson(resultPath);
assert.equal(result.runId, runId);
assert.equal(result.jobId, job.jobId);
assert.equal(result.status, "completed");
assert.equal(result.analysis.chern, chern);
assert.equal(result.analysis.latticeChern, chern);
assert.equal(result.analysis.analyticChern, chern);
assert.equal(result.analysis.meshResolved, true);
assert.equal(result.analysis.gapClosed, false);
near(result.analysis.bulkGap, 2, "analytic bulk gap");
const sampledGap = Math.min(...result.analysis.upperBand.map((upper, index) => upper - result.analysis.lowerBand[index]));
near(result.analysis.sampledGap, sampledGap, "sampled band gap");
const cellArea = (2 * Math.PI / grid) ** 2;
const integratedChern = result.analysis.berryCurvature.reduce((sum, curvature) => sum + curvature * cellArea, 0) / (2 * Math.PI);
near(result.analysis.chernIntegral, integratedChern, "curvature Chern integral");
assert.ok(Math.abs(integratedChern - chern) < 1e-3, "curvature integral must resolve the declared Chern number");
assert.equal(result.analysis.bandKValues.length, grid);
for (let index = 0; index < grid; index++)
  near(result.analysis.bandKValues[index], -Math.PI + index * 2 * Math.PI / grid, `band k ${index}`);

const direct = await readJson(join(pairDirectory, "direct", "acceptance.json"));
const consumer = await readJson(join(pairDirectory, "consumer", "acceptance.json"));
for (const acceptance of [direct, consumer]) {
  assert.equal(acceptance.runId, runId);
  assert.equal(acceptance.resultSha256, resultSha256);
}
assert.equal(direct.sourceStudySha256, manifestSha256);
assert.equal(direct.launchedStudySha256, manifestSha256);
assert.equal(consumer.stagedViews, 2);
assert.deepEqual(consumer.viewed.slice().sort(), ["bands", "curvature"]);

const viewReview = [];
let maximumAbsoluteDifference = 0;
for (const role of ["curvature", "bands"]) {
  const folder = role === "curvature" ? `${runId}.qscene` : `${runId}-bands.qscene`;
  const named = study.scenes.find(scene => scene.role === role);
  assert.equal(named.folder, folder);
  const sceneDirectory = join(freshStudyDirectory, folder);
  const sceneSha256 = await fileSha(join(sceneDirectory, "scene.json"));
  assert.equal(sceneSha256, scenes.find(scene => scene.role === role).sceneSha256);
  const imported = await importQuantumSceneBundle(sceneDirectory);
  assert.equal(imported.source.schema, "quantum-scene/v1");
  assert.equal(imported.source.provenance.runId, runId);
  assert.equal(imported.source.provenance.resultSha256, resultSha256);
  assert.equal(imported.source.provenance.parameters.mass, mass);
  assert.equal(imported.source.provenance.parameters.grid, grid);
  const coordinateId = role === "curvature" ? "curvature-grid" : "band-k";
  const lowerId = role === "curvature" ? "curvature" : "band-energy-0";
  const coordinates = imported.arrays.get(coordinateId);
  const lower = imported.arrays.get(lowerId);
  const upper = role === "bands" ? imported.arrays.get("band-energy-1") : null;
  assert.equal(coordinates.length, grid * grid * 3);
  assert.equal(lower.length, grid * grid);
  if (upper) assert.equal(upper.length, grid * grid);
  for (let index = 0; index < grid * grid; index++) {
    const row = Math.floor(index / grid), column = index % grid;
    const centerOffset = role === "curvature" ? Math.PI / grid : 0;
    near(coordinates[index * 3], result.analysis.bandKValues[row] + centerOffset, `${role} kx ${index}`);
    near(coordinates[index * 3 + 1], result.analysis.bandKValues[column] + centerOffset, `${role} ky ${index}`);
    near(coordinates[index * 3 + 2], role === "curvature" ? lower[index] : 0, `${role} height ${index}`);
    const expected = qwz(coordinates[index * 3], coordinates[index * 3 + 1], mass);
    const resultValue = role === "curvature" ? result.analysis.berryCurvature[index] : result.analysis.lowerBand[index];
    const target = role === "curvature" ? expected.curvature : expected.lower;
    maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference,
      near(lower[index], target, `${role} scene sample ${index}`),
      near(resultValue, target, `${role} result sample ${index}`));
    if (upper) maximumAbsoluteDifference = Math.max(maximumAbsoluteDifference,
      near(upper[index], expected.upper, `upper scene sample ${index}`),
      near(result.analysis.upperBand[index], expected.upper, `upper result sample ${index}`));
  }
  const screenshot = consumer.screenshots.find(item => item.role === role);
  assert.ok(screenshot);
  const image = await readFile(join(pairDirectory, "consumer", screenshot.file));
  assert.equal(sha(image), screenshot.sha256);
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${role} PNG signature`);
  viewReview.push({ role, sceneSha256, screenshotSha256: screenshot.sha256,
    screenshotWidth: image.readUInt32BE(16), screenshotHeight: image.readUInt32BE(20), samples: grid * grid });
}

console.log(JSON.stringify({
  schema: "math3d/qi40-fresh-installed-pair-review/v1",
  status: "passed",
  scope: "unsigned Dev installed pair; exact fresh QWZ result and two views",
  installedPairReportSha256: expectedReportSha256,
  math3dCommit: pair.math3d.commit,
  math3dInstallerSha256: pair.math3d.installerSha256,
  theoryLabCommit: pair.theoryLab.commit,
  theoryLabInstallerSha256: pair.theoryLab.installerSha256,
  runId, resultSha256, studySha256: manifestSha256,
  grid, chern, bulkGap: result.analysis.bulkGap, sampledGap,
  independentlyIntegratedChern: integratedChern,
  maximumAbsoluteDifference,
  views: viewReview,
}, null, 2));
