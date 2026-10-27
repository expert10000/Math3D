import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chunkScientificScene } from "./chunk-scientific-scene.mjs";
import { tileScientificScene } from "./tile-scientific-scene.mjs";

const require = createRequire(import.meta.url);
const { readScientificSceneBundle, readScientificSceneBundleMetadata } =
  require("../dist/main/scientificScene/bundle.js");
const { scientificTileLayout } = require("../dist/shared/scientificSceneManifest.js");
const { openScientificGraphDatasets, previewScientificGraphVectorVolume,
  previewScientificGraphVectorSamples } =
  require("../dist/main/scientificScene/graphDataset.js");
const exec = promisify(execFile);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const names = ["east", "north", "up"];
const shape = [64, 64, 64], count = shape.reduce((product, size) => product * size, 1);

async function writeLegacyFixture(directory) {
  await mkdir(directory);
  const resources = [];
  for (let component = 0; component < 3; component++) {
    const bytes = Buffer.alloc(count * 8);
    for (let index = 0; index < count; index++)
      bytes.writeDoubleLE(((index % 64) - 31.5) * (component + 1) / 64, index * 8);
    await writeFile(join(directory, `${names[component]}.f64`), bytes);
    resources.push({ id: names[component], path: `${names[component]}.f64`, format: "f64le",
      count, bytes: bytes.length, sha256: sha(bytes) });
  }
  const manifest = Buffer.from(`${JSON.stringify({ schema: "scientific-scene/v1",
    sceneId: "chunked-vector-fixture", title: "Chunked vector fixture",
    source: { producer: "math3d-fixture", sourceId: "chunked-vector-v1",
      sourceSchema: "scientific-fixture/v1", sha256: "0".repeat(64) },
    resources, coordinates: [{ id: "space", kind: "cartesian",
      axes: names.map((_, index) => ({ name: ["x", "y", "z"][index], unit: "m" })),
      origin: [0, 0, 0], spacing: [1, 1, 1], periodic: [false, false, false] }],
    datasets: [{ id: "field", semanticType: "vector-field", coordinateSystem: "space", shape,
      order: "last-axis-fastest", quantity: { name: "Velocity", unit: "m/s" },
      components: names.map(name => ({ name, resource: name })) }], views: [],
  }, null, 2)}\n`);
  await writeFile(join(directory, "manifest.json"), manifest);
  await writeFile(join(directory, "bundle.json"), `${JSON.stringify({
    schema: "scientific-scene-bundle/v1",
    manifest: { path: "manifest.json", bytes: manifest.length, sha256: sha(manifest) },
  }, null, 2)}\n`);
}

async function changeByte(path, offset) {
  const file = await open(path, "r+");
  try {
    const byte = Buffer.alloc(1);
    await file.read(byte, 0, 1, offset);
    byte[0] ^= 1;
    await file.write(byte, 0, 1, offset);
  } finally { await file.close(); }
}

async function measure(directory, mode = "overview") {
  if (global.gc) global.gc();
  const before = process.memoryUsage();
  const peak = { rss: before.rss, heapUsed: before.heapUsed, external: before.external };
  const sample = () => { const current = process.memoryUsage();
    for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], current[key]); };
  const interval = setInterval(sample, 2);
  const started = performance.now();
  try {
    const opened = await openScientificGraphDatasets(directory);
    const lazy = JSON.parse(opened.manifestJson).schema !== "scientific-scene/v1";
    const axis = mode.startsWith("slice-") ? Number(mode.slice(6)) : 0;
    const selection = mode === "probe" ? { kind: "probe", indices: [0, 0, 0] } :
      { kind: "slice", normalAxis: axis, fixedIndex: 0 };
    const transfer = mode === "overview" || !lazy ?
      await previewScientificGraphVectorVolume(directory, opened.fingerprint, "field", names,
        mode === "overview" ? 8 : 32) :
      await previewScientificGraphVectorSamples(directory, opened.fingerprint,
        "field", names, selection);
    const parts = Array.isArray(transfer) ? transfer : transfer.components;
    sample();
    return { firstViewMs: Math.round((performance.now() - started) * 10) / 10,
      peakRssDeltaMiB: Math.round((peak.rss - before.rss) / 1048576 * 10) / 10,
      peakHeapDeltaMiB: Math.round((peak.heapUsed - before.heapUsed) / 1048576 * 10) / 10,
      peakExternalDeltaMiB: Math.round((peak.external - before.external) / 1048576 * 10) / 10,
      transferredValues: parts.reduce((sum, part) => sum + part.values.length, 0),
      verifiedChunks: parts.map(part => part.verifiedChunks?.length ?? null),
      verifiedTiles: parts.map(part => part.verifiedTiles?.length ?? null),
      verifiedOverview: parts.map(part => part.verifiedOverview ?? null) };
  } finally { clearInterval(interval); }
}

if (process.argv[2] === "measure") {
  process.stdout.write(`${JSON.stringify(await measure(process.argv[3], process.argv[4]))}\n`);
} else {
  const root = await mkdtemp(join(tmpdir(), "m3d-scientific-chunks-"));
  const legacy = join(root, "legacy.sscene"), chunked = join(root, "chunked.sscene"),
    tiled = join(root, "tiled.sscene"), tiledPlain = join(root, "tiled-plain.sscene");
  try {
    await writeLegacyFixture(legacy);
    const legacyBundle = await readScientificSceneBundle(legacy);
    assert.equal(legacyBundle.manifest.schema, "scientific-scene/v1");
    const converted = await chunkScientificScene(legacy, chunked, 65536);
    const metadata = await readScientificSceneBundleMetadata(chunked);
    const tiledConversion = await tileScientificScene(chunked, tiled, [16, 16, 16]);
    const plainConversion = await tileScientificScene(chunked, tiledPlain, [16, 16, 16],
      { overview: false });
    assert.equal(tiledConversion.overviewBytes, 3 * 8 ** 3 * 8);
    assert.equal(plainConversion.overviewBytes, 0);
    const tileMetadata = await readScientificSceneBundleMetadata(tiled);
    assert.equal(tileMetadata.fingerprint, tiledConversion.fingerprint);
    assert.equal(tileMetadata.manifest.schema, "scientific-scene/v3");
    const tiledBundle = await readScientificSceneBundle(tiled);
    assert.equal(tiledBundle.manifest.schema, "scientific-scene/v3");
    for (const resource of legacyBundle.manifest.resources)
      assert.deepEqual(tiledBundle.resources.get(resource.id), legacyBundle.resources.get(resource.id));
    assert.equal(metadata.fingerprint, converted.fingerprint);
    assert.equal(metadata.manifest.schema, "scientific-scene/v2");
    assert.equal((await readScientificSceneBundle(chunked)).manifest.schema, "scientific-scene/v2");
    const oldPreview = await previewScientificGraphVectorVolume(legacy, legacyBundle.fingerprint,
      "field", names, 8);
    const first = await previewScientificGraphVectorVolume(chunked, converted.fingerprint,
      "field", names, 8);
    assert.deepEqual(first.map(volume => volume.values), oldPreview.map(volume => volume.values));
    assert.deepEqual(first.map(volume => volume.sampleSha256), oldPreview.map(volume => volume.sampleSha256));
    const totalChunks = metadata.manifest.resources[0].chunkSha256.length;
    const full = await previewScientificGraphVectorVolume(legacy, legacyBundle.fingerprint,
      "field", names);
    for (const axis of [0, 1, 2]) {
      const selection = { kind: "slice", normalAxis: axis, fixedIndex: 0 };
      const sparse = await previewScientificGraphVectorSamples(chunked, converted.fingerprint,
        "field", names, selection);
      const tiledSlice = await previewScientificGraphVectorSamples(tiled, tiledConversion.fingerprint,
        "field", names, selection);
      assert.deepEqual(tiledSlice.components.map(part => part.values), sparse.components.map(part => part.values));
      assert(tiledSlice.components.every(part => part.verifiedTiles.length === 16));
      const plane = [0, 1, 2].filter(item => item !== axis);
      const positions = plane.map(item => Array.from({ length: 32 }, (_, index) => Math.round(index * 63 / 31)));
      for (let part = 0; part < 3; part++) {
        const expected = [];
        for (const a of positions[0]) for (const b of positions[1]) {
          const point = [0, 0, 0]; point[plane[0]] = a; point[plane[1]] = b;
          const sampled = point.map(index => Math.round(index * 31 / 63));
          expected.push(full[part].values[(sampled[0] * 32 + sampled[1]) * 32 + sampled[2]]);
        }
        assert.deepEqual(sparse.components[part].values, expected);
      }
      assert(sparse.components.every(part => part.verifiedChunks.length > 0 &&
        part.verifiedChunks.length <= totalChunks));
      if (axis === 0) assert(sparse.components.every(part => part.verifiedChunks.length < totalChunks));
      const stencil = await previewScientificGraphVectorSamples(chunked, converted.fingerprint,
        "field", names, { kind: "stencil-slice", normalAxis: axis, fixedIndex: 0 });
      const tiledStencil = await previewScientificGraphVectorSamples(tiled, tiledConversion.fingerprint,
        "field", names, { kind: "stencil-slice", normalAxis: axis, fixedIndex: 0 });
      assert.deepEqual(tiledStencil.components.map(part => part.values), stencil.components.map(part => part.values));
      assert(stencil.components.every(part => part.values.length === 3 * 32 * 32));
      assert.deepEqual(stencil.components.map(part => part.values.slice(0, 32 * 32)),
        sparse.components.map(part => part.values));
    }
    const probeSelection = { kind: "probe", indices: [0, 0, 0] };
    const probe = await previewScientificGraphVectorSamples(chunked, converted.fingerprint,
      "field", names, probeSelection);
    const tiledProbe = await previewScientificGraphVectorSamples(tiled, tiledConversion.fingerprint,
      "field", names, probeSelection);
    assert.deepEqual(tiledProbe.components.map(part => part.values), probe.components.map(part => part.values));
    assert(tiledProbe.components.every(part => part.verifiedTiles.length === 1));
    const tiledOverview = await previewScientificGraphVectorVolume(tiled, tiledConversion.fingerprint,
      "field", names, 8);
    assert.deepEqual(tiledOverview.map(part => part.values), first.map(part => part.values));
    assert(tiledOverview.every((part, index) => part.verifiedOverview ===
      tileMetadata.manifest.resources[index].overview.sha256));
    const plainOverview = await previewScientificGraphVectorVolume(tiledPlain, plainConversion.fingerprint,
      "field", names, 8);
    assert.deepEqual(plainOverview.map(part => part.values), tiledOverview.map(part => part.values));
    assert(plainOverview.every(part => part.verifiedTiles.length === 64));
    const overviewPath = join(tiled, tileMetadata.manifest.resources[0].overview.path);
    await changeByte(overviewPath, 0);
    await assert.rejects(previewScientificGraphVectorVolume(tiled, tiledConversion.fingerprint,
      "field", names, 8), /overview integrity/);
    await assert.rejects(readScientificSceneBundle(tiled), /overview integrity/);
    await changeByte(overviewPath, 0);
    const tileLayout = scientificTileLayout(shape, [16, 16, 16]);
    const firstTile = tileLayout[0];
    await changeByte(join(tiled, "east.f64"), firstTile.offsetBytes);
    for (const axis of [0, 1, 2])
      await assert.rejects(previewScientificGraphVectorSamples(tiled, tiledConversion.fingerprint,
        "field", names, { kind: "slice", normalAxis: axis, fixedIndex: 0 }), /tile integrity/);
    await assert.rejects(previewScientificGraphVectorSamples(tiled, tiledConversion.fingerprint,
      "field", names, probeSelection), /tile integrity/);
    await changeByte(join(tiled, "east.f64"), firstTile.offsetBytes);
    const unsampledTile = tileLayout[63];
    await changeByte(join(tiled, "east.f64"), unsampledTile.offsetBytes);
    await previewScientificGraphVectorSamples(tiled, tiledConversion.fingerprint,
      "field", names, { kind: "slice", normalAxis: 0, fixedIndex: 0 });
    await assert.rejects(readScientificSceneBundle(tiled), /resource integrity/);
    await changeByte(join(tiled, "east.f64"), unsampledTile.offsetBytes);
    assert.deepEqual(probe.components.map(part => part.values), full.map(part => [part.values[0]]));
    assert(probe.components.every(part => part.verifiedChunks.length === 1));
    const sliceChunk = (await previewScientificGraphVectorSamples(chunked, converted.fingerprint,
      "field", names, { kind: "slice", normalAxis: 2, fixedIndex: 0 })).components[0].verifiedChunks[0];
    await changeByte(join(chunked, "east.f64"), sliceChunk * 65536);
    await assert.rejects(previewScientificGraphVectorSamples(chunked, converted.fingerprint,
      "field", names, { kind: "slice", normalAxis: 2, fixedIndex: 0 }), /chunk integrity/);
    await assert.rejects(previewScientificGraphVectorSamples(chunked, converted.fingerprint,
      "field", names, { kind: "stencil-slice", normalAxis: 2, fixedIndex: 0 }), /chunk integrity/);
    await assert.rejects(previewScientificGraphVectorSamples(chunked, converted.fingerprint,
      "field", names, probeSelection), /chunk integrity/);
    await changeByte(join(chunked, "east.f64"), sliceChunk * 65536);
    assert(first.every(volume => volume.verifiedChunks.length > 0 &&
      volume.verifiedChunks.length < totalChunks));
    const resourcePath = join(chunked, "east.f64");
    const sampled = first[0].verifiedChunks[0];
    await changeByte(resourcePath, sampled * 65536);
    await assert.rejects(previewScientificGraphVectorVolume(chunked, converted.fingerprint,
      "field", names, 8), /chunk integrity/);
    await changeByte(resourcePath, sampled * 65536);
    const unsampled = Array.from({ length: totalChunks }, (_, index) => index)
      .find(index => !first[0].verifiedChunks.includes(index));
    assert.notEqual(unsampled, undefined);
    await changeByte(resourcePath, unsampled * 65536);
    await previewScientificGraphVectorVolume(chunked, converted.fingerprint, "field", names, 8);
    await assert.rejects(readScientificSceneBundle(chunked), /resource integrity/);
    await changeByte(resourcePath, unsampled * 65536);
    const results = {};
    for (const [name, directory] of [["v1", legacy], ["v2", chunked],
      ["v3-no-overview", tiledPlain], ["v3", tiled]])
      for (const mode of ["overview", "slice-0", "slice-1", "slice-2", "probe"]) {
      const samples = [];
      for (let index = 0; index < 3; index++) {
        const { stdout } = await exec(process.execPath,
          ["--expose-gc", fileURLToPath(import.meta.url), "measure", directory, mode]);
        samples.push(JSON.parse(stdout));
      }
      const sorted = samples.map(item => item.firstViewMs).sort((a, b) => a - b);
      results[`${name}-${mode}`] = { medianFirstViewMs: sorted[1],
        medianPeakRssDeltaMiB: samples.map(item => item.peakRssDeltaMiB).sort((a, b) => a - b)[1],
        medianPeakExternalDeltaMiB: samples.map(item => item.peakExternalDeltaMiB).sort((a, b) => a - b)[1],
        transferredValues: samples[0].transferredValues,
        verifiedChunks: samples[0].verifiedChunks, verifiedTiles: samples[0].verifiedTiles,
        verifiedOverview: samples[0].verifiedOverview };
    }
    process.stdout.write(`${JSON.stringify({ sourceShape: shape, chunkBytes: 65536,
      tileShape: [16, 16, 16], sourceBytes: count * 8 * 3,
      overviewBytes: tiledConversion.overviewBytes,
      totalChunksPerComponent: totalChunks, totalTilesPerComponent: tileLayout.length, results })}\n`);
  } finally {
    const path = resolve(root), relativePath = relative(resolve(tmpdir()), path);
    if (relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." &&
        !isAbsolute(relativePath)) await rm(path, { recursive: true, force: true });
  }
}
