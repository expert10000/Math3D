import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { open, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tileScientificScene } from "./tile-scientific-scene.mjs";
import { writeLargeScientificV1 } from "./write-scientific-large-vortex.mjs";

const require = createRequire(import.meta.url);
const { readScientificSceneBundle, readScientificSceneBundleMetadata } =
  require("../dist/main/scientificScene/bundle.js");
const { openScientificGraphDatasets, previewScientificGraphVectorVolume } =
  require("../dist/main/scientificScene/graphDataset.js");
const exec = promisify(execFile);
const names = ["east", "north", "up"];

async function measure(directory) {
  global.gc?.();
  const before = process.memoryUsage(), peak = { rss: before.rss, external: before.external };
  const sample = () => { const now = process.memoryUsage();
    peak.rss = Math.max(peak.rss, now.rss); peak.external = Math.max(peak.external, now.external); };
  const timer = setInterval(sample, 2), started = performance.now();
  try {
    const opened = await openScientificGraphDatasets(directory);
    const volumes = await previewScientificGraphVectorVolume(directory, opened.fingerprint,
      "field", names, 8);
    sample();
    return { firstViewMs: Math.round((performance.now() - started) * 10) / 10,
      peakRssDeltaMiB: Math.round((peak.rss - before.rss) / 1048576 * 10) / 10,
      peakExternalDeltaMiB: Math.round((peak.external - before.external) / 1048576 * 10) / 10,
      verifiedTiles: volumes.map(volume => volume.verifiedTiles?.length ?? null),
      verifiedOverview: volumes.map(volume => volume.verifiedOverview !== undefined) };
  } finally { clearInterval(timer); }
}

if (process.argv[2] === "measure") {
  process.stdout.write(`${JSON.stringify(await measure(process.argv[3]))}\n`);
} else {
  const root = await mkdtemp(join(tmpdir(), "m3d-overview-test-"));
  const legacy = join(root, "legacy.sscene"), plain = join(root, "plain.sscene"),
    overview = join(root, "overview.sscene");
  try {
    const fixture = await writeLargeScientificV1(legacy, 80);
    const noSidecar = await tileScientificScene(legacy, plain, [16, 16, 16], { overview: false });
    const withSidecar = await tileScientificScene(legacy, overview);
    assert.equal(withSidecar.overviewBytes, 3 * 8 ** 3 * 8);
    const baseline = await readScientificSceneBundle(legacy);
    const expected = await previewScientificGraphVectorVolume(legacy, baseline.fingerprint,
      "field", names, 8);
    const first = await previewScientificGraphVectorVolume(overview, withSidecar.fingerprint,
      "field", names, 8);
    const old = await previewScientificGraphVectorVolume(plain, noSidecar.fingerprint,
      "field", names, 8);
    assert.deepEqual(first.map(item => item.values), expected.map(item => item.values));
    assert.deepEqual(old.map(item => item.values), expected.map(item => item.values));
    assert(first.every(item => item.verifiedOverview && !item.verifiedTiles));
    assert(old.every(item => item.verifiedTiles.length === 125));
    const metadata = await readScientificSceneBundleMetadata(overview);
    const path = join(overview, metadata.manifest.resources[0].overview.path);
    const file = await open(path, "r+");
    try {
      const byte = Buffer.alloc(1);
      await file.read(byte, 0, 1, 0);
      byte[0] ^= 1;
      await file.write(byte, 0, 1, 0);
    } finally { await file.close(); }
    await assert.rejects(previewScientificGraphVectorVolume(overview, withSidecar.fingerprint,
      "field", names, 8), /overview integrity/);
    await assert.rejects(readScientificSceneBundle(overview), /overview integrity/);
    const results = {};
    for (const [name, directory] of [["v1", legacy], ["v3-tiles", plain], ["v3-overview", overview]]) {
      if (name === "v3-overview") {
        const restore = await open(path, "r+");
        try {
          const byte = Buffer.alloc(1);
          await restore.read(byte, 0, 1, 0);
          byte[0] ^= 1;
          await restore.write(byte, 0, 1, 0);
        } finally { await restore.close(); }
      }
      const samples = [];
      for (let index = 0; index < 3; index++) {
        const { stdout } = await exec(process.execPath,
          ["--expose-gc", fileURLToPath(import.meta.url), "measure", directory]);
        samples.push(JSON.parse(stdout));
      }
      const median = key => samples.map(item => item[key]).sort((a, b) => a - b)[1];
      results[name] = { medianFirstViewMs: median("firstViewMs"),
        medianPeakRssDeltaMiB: median("peakRssDeltaMiB"),
        medianPeakExternalDeltaMiB: median("peakExternalDeltaMiB"),
        verifiedTiles: samples[0].verifiedTiles,
        verifiedOverview: samples[0].verifiedOverview };
    }
    process.stdout.write(`${JSON.stringify({ sourceShape: fixture.shape,
      sourceBytes: fixture.sourceBytes, overviewBytes: withSidecar.overviewBytes, results })}\n`);
  } finally {
    const path = resolve(root), relativePath = relative(resolve(tmpdir()), path);
    if (relativePath && !relativePath.startsWith(`..${sep}`) && relativePath !== ".." &&
        !isAbsolute(relativePath) && basename(path).startsWith("m3d-overview-test-"))
      await rm(path, { recursive: true, force: true });
  }
}
