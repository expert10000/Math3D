import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";

// The same dependency-free contract source is compiled to dist/shared for
// Electron. Renderer/web import the TypeScript source directly.
type Manifest = {
  schema: "scientific-scene/v1"; sceneId: string; title: string;
  source: { producer: string; sourceId: string; sourceSchema: string; sha256: string };
  resources: { id: string; path: string; format: "f64le"; count: number; bytes: number; sha256: string }[];
  coordinates: { id: string; kind: string; axes: { name: string; unit: string }[];
    origin: number[]; spacing: number[]; periodic: boolean[] }[];
  datasets: { id: string; semanticType: string; coordinateSystem: string; shape: number[];
    order: string; quantity: { name: string; unit: string; symbol?: string }; real: string; imaginary?: string }[];
  views: { id: string; label: string; dataset: string; renderer: string; operation: string; axis?: number }[];
};
const { normalizeScientificSceneManifest } = require("../../shared/scientificSceneManifest.js") as {
  normalizeScientificSceneManifest: (value: unknown) =>
    { ok: true; value: Manifest } | { ok: false; errors: string[] };
};

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const MAX_MANIFEST = 64 * 1024;
const MAX_RESOURCES = 16 * 1024 * 1024;

async function boundedRead(path: string, limit: number, expected?: number): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > limit ||
      (expected !== undefined && info.size !== expected)) throw new Error("Invalid scientific bundle file size or link");
  const file = await open(path, "r");
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.dev !== info.dev || actual.ino !== info.ino || actual.size !== info.size)
      throw new Error("Scientific bundle file identity changed");
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error("Scientific bundle file truncated");
      offset += bytesRead;
    }
    if ((await file.stat()).size !== info.size) throw new Error("Scientific bundle file size changed");
    return bytes;
  } finally { await file.close(); }
}

export type VerifiedScientificSceneBundle = {
  manifest: Manifest;
  manifestJson: string;
  /** Raw verified resources remain outside React; adapters choose bounded display data. */
  resources: Map<string, Buffer>;
  /** SHA-256 of the exact manifest bytes, not a source-authenticity claim. */
  fingerprint: string;
};

export async function readScientificSceneBundle(directory: string): Promise<VerifiedScientificSceneBundle> {
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Scientific bundle root must be a directory");
  const bundle: unknown = JSON.parse((await boundedRead(join(directory, "bundle.json"), 8192)).toString("utf8"));
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new Error("Invalid scientific bundle envelope");
  const envelope = bundle as Record<string, unknown>;
  const ref = envelope.manifest;
  if (Object.keys(envelope).sort().join(",") !== "manifest,schema" ||
      envelope.schema !== "scientific-scene-bundle/v1" || !ref || typeof ref !== "object" || Array.isArray(ref))
    throw new Error("Invalid scientific bundle envelope");
  const descriptor = ref as Record<string, unknown>;
  if (Object.keys(descriptor).sort().join(",") !== "bytes,path,sha256" || descriptor.path !== "manifest.json" ||
      !Number.isSafeInteger(descriptor.bytes) || (descriptor.bytes as number) < 1 ||
      (descriptor.bytes as number) > MAX_MANIFEST ||
      typeof descriptor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sha256))
    throw new Error("Invalid scientific manifest reference");
  const bytes = await boundedRead(join(directory, "manifest.json"), MAX_MANIFEST, descriptor.bytes as number);
  if (hash(bytes) !== descriptor.sha256) throw new Error("Scientific manifest integrity failed");
  const checked = normalizeScientificSceneManifest(JSON.parse(bytes.toString("utf8")));
  if (!checked.ok) throw new Error(`Invalid scientific manifest: ${checked.errors.join(" ")}`);
  const manifest = checked.value;
  const expected = new Set(["bundle.json", "manifest.json", ...manifest.resources.map(resource => resource.path)]);
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== expected.size || entries.some(entry => !entry.isFile() || entry.isSymbolicLink() || !expected.has(entry.name)))
    throw new Error("Scientific bundle contains missing, unexpected or linked files");
  const resources = new Map<string, Buffer>();
  let total = 0;
  for (const resource of manifest.resources) {
    total += resource.bytes;
    if (total > MAX_RESOURCES) throw new Error("Scientific bundle exceeds memory budget");
    const data = await boundedRead(join(directory, resource.path), MAX_RESOURCES, resource.bytes);
    if (hash(data) !== resource.sha256) throw new Error(`Scientific resource integrity failed: ${resource.id}`);
    for (let offset = 0; offset < data.length; offset += 8)
      if (!Number.isFinite(data.readDoubleLE(offset))) throw new Error(`Scientific resource contains non-finite value: ${resource.id}`);
    resources.set(resource.id, data);
  }
  return { manifest, manifestJson: bytes.toString("utf8"), resources, fingerprint: descriptor.sha256 };
}
