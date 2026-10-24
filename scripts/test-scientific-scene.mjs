import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readScientificSceneBundle } = require("../dist/main/scientificScene/bundle.js");
const { openScientificGraphDatasets, previewScientificGraphSlice, previewScientificGraphPlane,
  previewScientificGraphVolume, previewScientificGraphComplexVolumeLines } =
  require("../dist/main/scientificScene/graphDataset.js");
const { adaptVerifiedHeightSurface, openScientificHeightSurface, inspectScientificHeightSample } = require("../dist/main/scientificScene/heightSurface.js");
const { importQuantumFieldScientificManifest } = require("../dist/main/quantumScene/scientificManifest.js");
const { normalizeScientificSceneManifest } = require("../dist/shared/scientificSceneManifest.js");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fixture = resolve("tests/fixtures/scientific-scene/sincos.sscene");
const thermalFixture = resolve("tests/fixtures/scientific-scene/thermal-gradient.sscene");

const thermalSource = await openScientificGraphDatasets(thermalFixture);
assert.equal(thermalSource.datasets[0].datasetId, "temperature");
assert.deepEqual(thermalSource.datasets[0].shape, [5, 7]);
const acrossTime = await previewScientificGraphSlice(thermalFixture, thermalSource.fingerprint, "temperature", 0, 2);
assert.deepEqual(acrossTime.values, [286, 286.75, 287.5, 288.25, 289]);
const acrossDistance = await previewScientificGraphSlice(thermalFixture, thermalSource.fingerprint, "temperature", 1, 3);
assert.deepEqual(acrossDistance.values, [282.25, 285.25, 288.25, 291.25, 294.25, 297.25, 300.25]);
await assert.rejects(previewScientificGraphSlice(thermalFixture, "0".repeat(64), "temperature", 0, 2), /fingerprint/);
await assert.rejects(previewScientificGraphSlice(thermalFixture, thermalSource.fingerprint, "temperature", 0, 7), /valid line/);

const graphPreset = name => resolve("tests/fixtures/scientific-scene", `${name}.sscene`);
const waveSource = await openScientificGraphDatasets(graphPreset("complex-wave"));
assert.deepEqual(waveSource.datasets.map(item => item.component), ["real", "imaginary"]);
const waveReal = await previewScientificGraphPlane(graphPreset("complex-wave"), waveSource.fingerprint,
  "field", "real", null, null);
assert.deepEqual(waveReal.shape, [41, 41]);
assert.equal(waveReal.values[20 * 41 + 20], 1);
const waveImaginary = await previewScientificGraphSlice(graphPreset("complex-wave"), waveSource.fingerprint,
  "field", 0, 24, "imaginary");
assert.equal(waveImaginary.values.length, 41);
assert.notEqual(waveImaginary.values[20], 0);
const waveVolumeSource = await openScientificGraphDatasets(graphPreset("complex-wave-volume"));
assert.equal(waveVolumeSource.fingerprint, "207290452e2066b36460e1b61e3bc09c18150ee147d5e2d3c9dd4fe4d92de0b4");
assert.deepEqual(waveVolumeSource.datasets.map(item => item.component), ["real", "imaginary"]);
assert.deepEqual(waveVolumeSource.datasets[0].shape, [41, 41, 17]);
const waveVolumeLines = await previewScientificGraphComplexVolumeLines(graphPreset("complex-wave-volume"),
  waveVolumeSource.fingerprint, "field", 2, 8, 0, 20);
assert.deepEqual(waveVolumeLines.map(item => item.component), ["real", "imaginary"]);
assert.deepEqual(waveVolumeLines.map(item => item.values.length), [41, 41]);
assert.equal(waveVolumeLines[0].values[20], 1);
assert.equal(waveVolumeLines[1].values[20], 0);
const vortexSource = await openScientificGraphDatasets(graphPreset("vortex-flow"));
assert.deepEqual(vortexSource.datasets.map(item => item.component), ["east", "north"]);
const vortexNorth = await previewScientificGraphSlice(graphPreset("vortex-flow"), vortexSource.fingerprint,
  "field", 0, 16, "north");
assert.equal(vortexNorth.values[16], 0);
assert.equal(vortexNorth.values[8], -vortexNorth.values[24]);
const volumeSource = await openScientificGraphDatasets(graphPreset("vortex-volume"));
assert.deepEqual(volumeSource.datasets.map(item => item.component), ["east", "north", "up"]);
const upPlane = await previewScientificGraphPlane(graphPreset("vortex-volume"), volumeSource.fingerprint,
  "field", "up", 2, 12);
assert.deepEqual(upPlane.shape, [21, 21]);
assert.equal(upPlane.values[10 * 21 + 10], 0.8);
const upVolume = await previewScientificGraphVolume(graphPreset("vortex-volume"), volumeSource.fingerprint,
  "field", "up");
assert.deepEqual(upVolume.sampleShape, [21, 21, 17]);
assert.equal(upVolume.values[(10 * 21 + 10) * 17 + 12], 0.8);

const scalar = await openScientificHeightSurface(fixture);
assert.equal(normalizeScientificSceneManifest(scalar.manifest).ok, true);
assert.equal(scalar.datasetId, "f");
assert.equal(scalar.values.length, 289);
assert.equal(scalar.values[12 * 17 + 8], 1);
assert.equal(scalar.values[8 * 17 + 8], 0);
const picked = await inspectScientificHeightSample(fixture, scalar.fingerprint, "f", 12 * 17 + 8);
assert.deepEqual(picked.grid, [12, 8]);
assert.deepEqual(picked.coordinates, [Math.PI / 2, 0]);
assert.deepEqual(picked.coordinateUnits, ["1", "1"]);
assert.equal(picked.value, 1);
assert.equal(picked.valueUnit, "1");
assert.equal(picked.sampleId, `${picked.sceneId}:f:212`);
await assert.rejects(inspectScientificHeightSample(fixture, scalar.fingerprint, "f", 289), /outside/);

const verified = await readScientificSceneBundle(fixture);
const overLimit = { ...verified,
  resources: new Map([[verified.manifest.datasets[0].real, Buffer.alloc(4097 * 8)]]) };
assert.throws(() => adaptVerifiedHeightSurface(overLimit), /bounded display sample limit/);
const unsupportedOperation = structuredClone(verified.manifest);
unsupportedOperation.views[0].operation = "unregistered-derivation";
assert.throws(() => adaptVerifiedHeightSurface({ ...verified, manifest: unsupportedOperation }), /no supported/);

const quantum = await importQuantumFieldScientificManifest(resolve("tests/fixtures/quantum-scene-orbitals/orbital-2p.qscene"));
assert.equal(normalizeScientificSceneManifest(quantum.manifest).ok, true);
assert.equal(quantum.manifest.datasets[0].semanticType, "complex-scalar-field");
assert.equal(quantum.manifest.source.sha256, "55379e422fa98bcb6f29ed1ac6380a34b6586face6070a37e1ca2436823526b5");

const root = await mkdtemp(join(tmpdir(), "m3d-ssr03-"));
try {
  const directory = join(root, "sincos.sscene");
  await cp(fixture, directory, { recursive: true });
  const dataPath = join(directory, "values.f64");
  const originalData = await readFile(dataPath);
  const changed = Buffer.from(originalData); changed[0] ^= 1;
  await writeFile(dataPath, changed);
  await assert.rejects(readScientificSceneBundle(directory), /resource integrity/);
  await writeFile(dataPath, originalData);

  const manifestPath = join(directory, "manifest.json");
  const originalManifest = await readFile(manifestPath);
  await writeFile(manifestPath, "{}\n");
  await assert.rejects(readScientificSceneBundle(directory), /size|integrity/);
  await writeFile(manifestPath, originalManifest);

  const bundlePath = join(directory, "bundle.json");
  const updateManifest = async mutation => {
    const manifest = JSON.parse(originalManifest.toString("utf8"));
    mutation(manifest);
    const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
    await writeFile(manifestPath, bytes);
    await writeFile(bundlePath, JSON.stringify({ schema: "scientific-scene-bundle/v1",
      manifest: { path: "manifest.json", bytes: bytes.length, sha256: hash(bytes) } }, null, 2) + "\n");
  };
  await updateManifest(manifest => { manifest.datasets[0].shape = [17, 18]; });
  await assert.rejects(readScientificSceneBundle(directory), /shape|manifest/i);
  await updateManifest(manifest => { manifest.schema = "scientific-scene/v2"; });
  await assert.rejects(readScientificSceneBundle(directory), /unsupported version/);
  await updateManifest(manifest => { manifest.title = "Changed but otherwise valid"; });
  await assert.rejects(inspectScientificHeightSample(directory, scalar.fingerprint, "f", 212), /changed since/);
  await writeFile(join(directory, "unexpected.txt"), "extra");
  await assert.rejects(readScientificSceneBundle(directory), /unexpected/);
} finally { await rm(root, { recursive: true, force: true }); }

console.log("SSR-02/03/04 shared validator, bounded display, registered view, exact sample IDs and tamper refusal passed");
