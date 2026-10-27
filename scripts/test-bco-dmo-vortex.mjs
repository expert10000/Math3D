import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, cp, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { readScientificSceneBundle } = require("../dist/main/scientificScene/bundle.js");
const { openScientificGraphDatasets, previewScientificGraphVectorVolume,
  previewScientificGraphVectorSamples } = require("../dist/main/scientificScene/graphDataset.js");
const { scientificTileLayout, scientificTileSampleLocation } =
  require("../dist/shared/scientificSceneManifest.js");
const exec = promisify(execFile);
const directory = resolve("output/scientific-burgers-horizontal-level1.sscene");
const names = ["vx", "vy", "vz"];
const shape = [47, 85, 55], target = [22, 43, 26];
const observed = [0.000005, -0.000163, -0.000459];
const bounded = shape.map(size => Array.from({ length: Math.min(size, 32) }, (_, index) =>
  Math.round(index * (size - 1) / (Math.min(size, 32) - 1))));

async function flip(path, offset) {
  const file = await open(path, "r+");
  try {
    const byte = Buffer.alloc(1);
    await file.read(byte, 0, 1, offset);
    byte[0] ^= 1;
    await file.write(byte, 0, 1, offset);
  } finally { await file.close(); }
}

async function measure(view, path) {
  global.gc?.();
  const before = process.memoryUsage(), peak = { rss: before.rss, external: before.external };
  const sample = () => { const now = process.memoryUsage();
    peak.rss = Math.max(peak.rss, now.rss); peak.external = Math.max(peak.external, now.external); };
  const timer = setInterval(sample, 2), started = performance.now();
  try {
    const source = await openScientificGraphDatasets(path);
    let transferred;
    if (view === "overview") transferred = await previewScientificGraphVectorVolume(path,
      source.fingerprint, "field", names, 8);
    else transferred = await previewScientificGraphVectorSamples(path, source.fingerprint,
      "field", names, view === "slice" ? { kind: "slice", normalAxis: 2, fixedIndex: 26 } :
        { kind: "probe", indices: target });
    sample();
    return { view, firstTransferMs: Math.round((performance.now() - started) * 10) / 10,
      peakRssDeltaMiB: Math.round((peak.rss - before.rss) / 1048576 * 10) / 10,
      peakExternalDeltaMiB: Math.round((peak.external - before.external) / 1048576 * 10) / 10,
      valuesPerComponent: view === "overview" ? transferred[0].values.length :
        transferred.components[0].values.length };
  } finally { clearInterval(timer); }
}

if (process.argv[2] === "measure") {
  process.stdout.write(`${JSON.stringify(await measure(process.argv[3], process.argv[4]))}\n`);
} else {
  const recipe = JSON.parse(await readFile(resolve("output/scientific-burgers-horizontal-level1.curation.json"),
    "utf8"));
  assert.equal(recipe.source.sha256,
    "31aa11b267183803bd3c4f40b30e5758a3d9ca7f09f539232341547375a79982");
  assert.equal(recipe.source.doi, "10.26008/1912/bco-dmo.834530.1");
  assert.deepEqual(recipe.selection.shape, shape);
  assert.equal(recipe.selection.missingValues, 0);
  assert.equal(recipe.selection.duplicateCells, 0);
  const full = await readScientificSceneBundle(directory);
  assert.equal(full.fingerprint, recipe.output.fingerprint);
  assert.equal(full.manifest.source.sha256, recipe.source.sha256);
  assert.deepEqual(full.manifest.datasets[0].shape, shape);
  assert.deepEqual(full.manifest.resources.map(item => item.sha256),
    recipe.output.resourceSha256);
  const axes = full.manifest.coordinates[0];
  assert.deepEqual(axes.axes.map(axis => axis.unit), ["m", "m", "m"]);
  assert.equal(full.manifest.datasets[0].quantity.unit, "m/s");
  const points = [
    { indices: [0, 84, 0], rawMm: [-9.817061, 13.817061, 0.182939],
      velocity: [-0.000049, -0.000397, -0.000939] },
    { indices: target, rawMm: [-1.767754, -1.183920, 9.695756], velocity: observed },
    { indices: [46, 0, 54], rawMm: [7.013308, -16.916657, 19.940329],
      velocity: [0.000009, 0.000836, 0.000924] },
  ];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis++)
      assert(Math.abs(axes.origin[axis] + point.indices[axis] * axes.spacing[axis] -
        point.rawMm[axis] / 1000) <= 1.1e-9, "Source coordinate orientation or conversion changed");
    const offset = (point.indices[0] * shape[1] + point.indices[1]) * shape[2] + point.indices[2];
    names.forEach((name, component) => assert.equal(full.resources.get(name).readDoubleLE(offset * 8),
      point.velocity[component], `Source ${name} sample axis order changed`));
  }
  const probe = await previewScientificGraphVectorSamples(directory, full.fingerprint, "field", names,
    { kind: "probe", indices: target });
  assert.deepEqual(probe.components.map(part => part.values[0]), observed);
  for (const normalAxis of [0, 1, 2]) {
    const slice = await previewScientificGraphVectorSamples(directory, full.fingerprint,
      "field", names, { kind: "slice", normalAxis, fixedIndex: target[normalAxis] });
    const plane = [0, 1, 2].filter(axis => axis !== normalAxis);
    const at = bounded[plane[0]].indexOf(target[plane[0]]) * bounded[plane[1]].length +
      bounded[plane[1]].indexOf(target[plane[1]]);
    assert(at >= 0);
    assert.deepEqual(slice.components.map(part => part.values[at]), observed,
      `Plane ${normalAxis} disagrees with the same physical probe`);
    assert(slice.components.every(part => part.verifiedTiles.length > 0));
  }
  const overview = await previewScientificGraphVectorVolume(directory, full.fingerprint,
    "field", names, 8);
  assert(overview.every(part => part.verifiedOverview && part.values.length === 512));
  const root = await mkdtemp(join(tmpdir(), "m3d-bco-dmo-test-"));
  try {
    const changedOverview = join(root, "overview.sscene");
    await cp(directory, changedOverview, { recursive: true });
    await flip(join(changedOverview, "vx.overview.f64"), 0);
    await assert.rejects(previewScientificGraphVectorVolume(changedOverview, full.fingerprint,
      "field", names, 8), /overview integrity/);
    const changedTile = join(root, "tile.sscene");
    await cp(directory, changedTile, { recursive: true });
    const resource = full.manifest.resources.find(item => item.id === "vx");
    const layout = scientificTileLayout(shape, resource.tileShape);
    const location = scientificTileSampleLocation(shape, resource.tileShape, target, layout);
    await flip(join(changedTile, "vx.f64"), layout[location.tileIndex].offsetBytes +
      location.offsetBytes);
    await assert.rejects(previewScientificGraphVectorSamples(changedTile, full.fingerprint,
      "field", names, { kind: "probe", indices: target }), /tile integrity/);
  } finally {
    const path = resolve(root), relativePath = relative(resolve(tmpdir()), path);
    if (relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." &&
        !isAbsolute(relativePath) && basename(path).startsWith("m3d-bco-dmo-test-"))
      await rm(path, { recursive: true, force: true });
  }
  const performance = {};
  for (const view of ["overview", "slice", "probe"]) {
    const runs = [];
    for (let index = 0; index < 3; index++) {
      const { stdout } = await exec(process.execPath,
        ["--expose-gc", fileURLToPath(import.meta.url), "measure", view, directory]);
      runs.push(JSON.parse(stdout));
    }
    const median = key => runs.map(run => run[key]).sort((a, b) => a - b)[1];
    performance[view] = { firstTransferMs: median("firstTransferMs"),
      peakRssDeltaMiB: median("peakRssDeltaMiB"),
      peakExternalDeltaMiB: median("peakExternalDeltaMiB"),
      valuesPerComponent: runs[0].valuesPerComponent };
  }
  process.stdout.write(`${JSON.stringify({ fingerprint: full.fingerprint,
    sourceRows: recipe.selection.rows, shape, probe: observed, performance })}\n`);
}
