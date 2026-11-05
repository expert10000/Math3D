import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { assertScene, verifyScenePayload, type QuantumScene, type ScenePayload } from "./index";
import { boundedRead } from "./bundle";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const digest = async (bytes: Uint8Array) => hash(bytes);
const exact = (value: unknown, names: string[]): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join(",") === names.sort().join(",");
const SHA = /^[a-f0-9]{64}$/;
const MAX_CHUNK = 64 * 1024, MAX_TOTAL = 64 * 1024 * 1024, MAX_METADATA = 1024 * 1024;

export interface QuantumSceneStream {
  schema: "quantum-scene-stream/v1";
  levels: { id: string; label: string; scene: QuantumScene; parts: { dataset: string; chunks: string[] }[] }[];
  chunks: { path: string; bytes: number; sha256: string }[];
}

/** Independent read-only validator for the frozen Theory Lab stream envelope. */
export function assertQuantumSceneStream(value: unknown): asserts value is QuantumSceneStream {
  if (!exact(value, ["schema", "levels", "chunks"]) || value.schema !== "quantum-scene-stream/v1" ||
      !Array.isArray(value.levels) || value.levels.length < 1 || value.levels.length > 8 ||
      !Array.isArray(value.chunks) || value.chunks.length < 1 || value.chunks.length > 1024)
    throw new Error("Invalid quantum scene stream manifest");
  const chunks = new Map<string, { bytes: number; sha256: string }>();
  let total = 0;
  for (const item of value.chunks) {
    if (!exact(item, ["path", "bytes", "sha256"]) || typeof item.sha256 !== "string" || !SHA.test(item.sha256) ||
        item.path !== `chunk-${item.sha256}.f64` || !Number.isInteger(item.bytes) || (item.bytes as number) < 8 ||
        (item.bytes as number) > MAX_CHUNK || (item.bytes as number) % 8 || chunks.has(item.path)) throw new Error("Invalid quantum scene stream chunk");
    chunks.set(item.path, { bytes: item.bytes as number, sha256: item.sha256 }); total += item.bytes as number;
  }
  if (total > MAX_TOTAL) throw new Error("Quantum scene stream exceeds disk budget");
  const ids = new Set<string>(), used = new Set<string>(); let previous = 0;
  for (const level of value.levels) {
    if (!exact(level, ["id", "label", "scene", "parts"]) || typeof level.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,32}$/.test(level.id) || ids.has(level.id) || typeof level.label !== "string" ||
        !level.label.length || level.label.length > 240 || !Array.isArray(level.parts))
      throw new Error("Invalid quantum scene stream level");
    ids.add(level.id); assertScene(level.scene);
    const bytes = level.scene.datasets.reduce((sum, dataset) => sum + dataset.bytes, 0);
    if (bytes < previous || level.parts.length !== level.scene.datasets.length)
      throw new Error("Quantum scene LOD mapping is invalid");
    previous = bytes;
    const refs = new Set<string>();
    for (const part of level.parts) {
      const dataset = level.scene.datasets.find((item) => item.id === part.dataset);
      if (!exact(part, ["dataset", "chunks"]) || typeof part.dataset !== "string" || !dataset || refs.has(part.dataset) ||
          !Array.isArray(part.chunks) || part.chunks.length < 1 || part.chunks.length > 256)
        throw new Error("Invalid quantum scene stream dataset mapping");
      refs.add(part.dataset);
      let size = 0;
      for (const path of part.chunks) {
        if (typeof path !== "string") throw new Error("Invalid quantum scene stream chunk reference");
        const chunk = chunks.get(path);
        if (!chunk) throw new Error("Missing quantum scene stream chunk");
        used.add(path); size += chunk.bytes;
      }
      if (size !== dataset.bytes) throw new Error("Quantum scene stream dataset size mismatch");
    }
  }
  if (used.size !== chunks.size || Buffer.byteLength(JSON.stringify(value)) > MAX_METADATA)
    throw new Error("Invalid or oversized quantum scene stream metadata");
}

export async function openQuantumSceneStream(directory: string): Promise<{
  manifest: QuantumSceneStream; manifestSha256: string;
  load: (level: number, signal?: AbortSignal, progress?: (done: number, total: number) => void) => Promise<ScenePayload>;
}> {
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Quantum stream root must be a real directory");
  const envelope: unknown = JSON.parse((await boundedRead(join(directory, "bundle.json"))).toString("utf8"));
  if (!exact(envelope, ["schema", "stream"]) || envelope.schema !== "quantum-scene-stream-bundle/v1" ||
      !exact(envelope.stream, ["path", "bytes", "sha256"]) || envelope.stream.path !== "stream.json" ||
      !Number.isInteger(envelope.stream.bytes) || (envelope.stream.bytes as number) < 1 ||
      (envelope.stream.bytes as number) > MAX_METADATA || typeof envelope.stream.sha256 !== "string" ||
      !SHA.test(envelope.stream.sha256)) throw new Error("Invalid quantum stream bundle envelope");
  const metadata = await boundedRead(join(directory, "stream.json"), envelope.stream.bytes as number);
  if (hash(metadata) !== envelope.stream.sha256) throw new Error("Quantum stream metadata integrity failed");
  const manifest: unknown = JSON.parse(metadata.toString("utf8"));
  assertQuantumSceneStream(manifest);
  const expected = new Set(["bundle.json", "stream.json", ...manifest.chunks.map((item) => item.path)]);
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== expected.size || entries.some((item) => !item.isFile() || item.isSymbolicLink() || !expected.has(item.name)))
    throw new Error("Quantum stream has missing, linked, or unexpected files");
  const readChunk = async (path: string, signal: AbortSignal): Promise<Uint8Array> => {
    signal.throwIfAborted();
    const descriptor = manifest.chunks.find((item) => item.path === path);
    if (!descriptor) throw new Error("Unknown quantum stream chunk");
    const current = await lstat(directory);
    if (current.isSymbolicLink() || current.dev !== root.dev || current.ino !== root.ino)
      throw new Error("Quantum stream root changed");
    const bytes = await boundedRead(join(directory, path), descriptor.bytes);
    signal.throwIfAborted();
    if (hash(bytes) !== descriptor.sha256) throw new Error("Quantum stream chunk integrity failed");
    return bytes;
  };
  return { manifest, manifestSha256: hash(metadata), load: async (level, signal = new AbortController().signal, progress = () => {}) => {
    const selected = manifest.levels[level];
    if (!Number.isInteger(level) || !selected) throw new Error("Invalid quantum stream level");
    signal.throwIfAborted();
    const artifacts: Record<string, Uint8Array> = {};
    const total = selected.parts.reduce((count, item) => count + item.chunks.length, 0);
    let done = 0;
    for (const part of selected.parts) {
      const dataset = selected.scene.datasets.find((item) => item.id === part.dataset)!;
      const data = new Uint8Array(dataset.bytes);
      let offset = 0;
      for (const path of part.chunks) {
        const bytes = await readChunk(path, signal);
        data.set(bytes, offset); offset += bytes.length;
        progress(++done, total);
      }
      artifacts[dataset.path] = data;
    }
    const payload = { scene: structuredClone(selected.scene), artifacts };
    await verifyScenePayload(payload, digest);
    signal.throwIfAborted();
    return payload;
  } };
}
