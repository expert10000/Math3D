import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint, reopenQuantumSceneReference } = require("../dist/main/quantumScene/recent.js");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const root = await mkdtemp(join(tmpdir(), "math3d-qi19-"));
const directory = join(root, "two-level-lod.qscene");
try {
  await mkdir(directory);
  const chunks = new Map();
  const level = (id, values) => {
    const data = Buffer.alloc(values.length * 8);
    values.forEach((number, index) => data.writeDoubleLE(number, 8 * index));
    const sha256 = hash(data), path = `chunk-${sha256}.f64`;
    chunks.set(path, data);
    return { id, label: id === "preview" ? "Coarse verified preview" : "Full verified samples",
      scene: { schema: "quantum-scene/v1", id: `stream-${id}`, title: "Bounded stream",
        provenance: { runId: "run-stream", jobId: "job-stream", model: "two_level", engine: "native",
          engineVersion: "1", computedAt: "2026-11-05T00:00:00Z", resultSha256: "a".repeat(64), adapter: "qvis/1" },
        coordinates: { handedness: "right", axes: ["x", "y", "z"], units: ["1", "1", "1"] },
        camera: { position: [3, 2, 2], target: [0, 0, 0], up: [0, 0, 1] },
        datasets: [{ id: "points", path: "points.f64", format: "f64le", count: values.length / 3,
          components: 3, unit: "1", bytes: data.length, sha256 }],
        objects: [{ id: "path", label: "Supplied samples", kind: "polyline", positions: "points", visible: true,
          style: { color: "#0088ff", opacity: 1, size: 1 } }], annotations: [] },
      parts: [{ dataset: "points", chunks: [path] }] };
  };
  const manifest = { schema: "quantum-scene-stream/v1", levels: [
    level("preview", [0, 0, 0, 1, 0, 0]), level("full", [0, 0, 0, 0.5, 0, 0, 1, 0, 0])],
    chunks: [...chunks].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: hash(bytes) })) };
  const metadata = Buffer.from(JSON.stringify(manifest));
  for (const [name, bytes] of chunks) await writeFile(join(directory, name), bytes);
  await writeFile(join(directory, "stream.json"), metadata);
  await writeFile(join(directory, "bundle.json"), JSON.stringify({ schema: "quantum-scene-stream-bundle/v1",
    stream: { path: "stream.json", bytes: metadata.length, sha256: hash(metadata) } }));
  const preview = await importQuantumSceneBundle(directory);
  assert.equal(preview.stream.level, 0);
  assert.equal(preview.document.geometry.segments.length, 1);
  assert.equal(preview.stream.levels[1].bytes, 72);
  const progress = [];
  const full = await importQuantumSceneBundle(directory, 1, undefined, (done, total) => progress.push([done, total]));
  assert.deepEqual(progress, [[1, 1]]);
  assert.equal(full.document.geometry.segments.length, 2);
  assert.equal(sceneFingerprint(full), sceneFingerprint(preview));
  const reopened = await reopenQuantumSceneReference({ directory, sceneFingerprint: sceneFingerprint(full) });
  assert.equal(reopened.imported.stream.level, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(importQuantumSceneBundle(directory, 1, controller.signal), /abort/i);
  const fullChunk = manifest.levels[1].parts[0].chunks[0];
  const original = await readFile(join(directory, fullChunk));
  const changed = Buffer.from(original); changed[0] ^= 1;
  await writeFile(join(directory, fullChunk), changed);
  await assert.rejects(importQuantumSceneBundle(directory, 1), /integrity/);
  await writeFile(join(directory, fullChunk), original);
  await writeFile(join(directory, "unexpected.f64"), Buffer.alloc(8));
  await assert.rejects(importQuantumSceneBundle(directory), /unexpected/);
  console.log("QI-19 stream: preview/full, bounded levels, cancel, restart, tamper and extra-file refusal passed");
} finally { await rm(root, { recursive: true, force: true }); }
