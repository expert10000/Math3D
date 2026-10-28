import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";

// The same dependency-free contract source is compiled to dist/shared for
// Electron. Renderer/web import the TypeScript source directly.
type Manifest = {
  schema: "scientific-scene/v1" | "scientific-scene/v2" | "scientific-scene/v3"; sceneId: string; title: string;
  source: { producer: string; sourceId: string; sourceSchema: string; sha256: string };
  resources: { id: string; path: string; format: "f64le"; count: number; bytes: number; sha256: string;
    chunkBytes?: number; chunkSha256?: string[]; layout?: "tiled-3d";
    tileShape?: [number, number, number]; tileSha256?: string[];
    overview?: { path: string; shape: [number, number, number]; bytes: number; sha256: string } }[];
  coordinates: { id: string; kind: string; axes: { name: string; unit: string }[];
    origin: number[]; spacing: number[]; periodic: boolean[] }[];
  datasets: { id: string; semanticType: string; coordinateSystem: string; shape: number[];
    order: string; quantity: { name: string; unit: string; symbol?: string }; real?: string; imaginary?: string;
    components?: { name: string; resource: string }[] }[];
  views: { id: string; label: string; dataset: string; renderer: string; operation: string; axis?: number }[];
};
const { normalizeScientificSceneManifest } = require("../../shared/scientificSceneManifest.js") as {
  normalizeScientificSceneManifest: (value: unknown) =>
    { ok: true; value: Manifest } | { ok: false; errors: string[] };
};
const { scientificTileLayout } = require("../../shared/scientificSceneManifest.js") as {
  scientificTileLayout: (shape: readonly number[], tileShape: readonly number[]) =>
    { index: number; start: [number, number, number]; size: [number, number, number];
      offsetBytes: number; bytes: number }[];
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

export type ScientificSceneBundleMetadata = Pick<VerifiedScientificSceneBundle,
  "manifest" | "manifestJson" | "fingerprint"> & { directory: string;
    bundleSchema: "scientific-scene-bundle/v1" | "scientific-scene-bundle/v2" |
      "scientific-scene-bundle/v3" };

const resourceShape = (manifest: Manifest, resourceId: string): [number, number, number] => {
  const dataset = manifest.datasets.find(item => item.components?.some(part => part.resource === resourceId) ||
    item.real === resourceId || item.imaginary === resourceId);
  if (!dataset || dataset.shape.length !== 3) throw new TypeError("Tiled resource has no 3D dataset.");
  return dataset.shape as [number, number, number];
};

/** Authenticate the manifest and inspect resource paths and sizes; v2 data is checked on access. */
export async function readScientificSceneBundleMetadata(directory: string): Promise<ScientificSceneBundleMetadata> {
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Scientific bundle root must be a directory");
  const bundle: unknown = JSON.parse((await boundedRead(join(directory, "bundle.json"), 8192)).toString("utf8"));
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new Error("Invalid scientific bundle envelope");
  const envelope = bundle as Record<string, unknown>;
  const ref = envelope.manifest;
  if (Object.keys(envelope).sort().join(",") !== "manifest,schema" ||
      !["scientific-scene-bundle/v1", "scientific-scene-bundle/v2",
        "scientific-scene-bundle/v3"].includes(String(envelope.schema)) ||
      !ref || typeof ref !== "object" || Array.isArray(ref))
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
  if (envelope.schema !== manifest.schema.replace("scientific-scene/", "scientific-scene-bundle/"))
    throw new Error("Scientific bundle and manifest versions disagree");
  const expected = new Set(["bundle.json", "manifest.json", ...manifest.resources.flatMap(resource =>
    [resource.path, ...(resource.overview ? [resource.overview.path] : [])])]);
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== expected.size || entries.some(entry => !entry.isFile() || entry.isSymbolicLink() || !expected.has(entry.name)))
    throw new Error("Scientific bundle contains missing, unexpected or linked files");
  for (const resource of manifest.resources) {
    const info = await lstat(join(directory, resource.path));
    if (!info.isFile() || info.isSymbolicLink() || info.size !== resource.bytes)
      throw new Error("Invalid scientific bundle file size or link");
    if (resource.overview) {
      const overview = await lstat(join(directory, resource.overview.path));
      if (!overview.isFile() || overview.isSymbolicLink() || overview.size !== resource.overview.bytes)
        throw new Error("Invalid scientific overview file size or link");
    }
  }
  return { manifest, manifestJson: bytes.toString("utf8"), fingerprint: descriptor.sha256 as string,
    directory, bundleSchema: envelope.schema as ScientificSceneBundleMetadata["bundleSchema"] };
}

/** Check every pinned resource byte while keeping memory use independent of scene size. */
export async function verifyScientificSceneBundleResources(directory: string): Promise<ScientificSceneBundleMetadata> {
  const metadata = await readScientificSceneBundleMetadata(directory);
  const verifyFile = async (path: string, bytes: number, expectedHash: string, label: string) => {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== bytes)
      throw new Error(`Scientific resource file size changed: ${label}`);
    const file = await open(path, "r");
    try {
      const before = await file.stat();
      if (!before.isFile() || before.dev !== info.dev || before.ino !== info.ino || before.size !== bytes)
        throw new Error(`Scientific resource file identity changed: ${label}`);
      const digest = createHash("sha256"), buffer = Buffer.allocUnsafe(Math.min(bytes, 1024 * 1024));
      let offset = 0;
      while (offset < bytes) {
        const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, bytes - offset), offset);
        if (!bytesRead) throw new Error(`Scientific resource file truncated: ${label}`);
        digest.update(buffer.subarray(0, bytesRead));
        offset += bytesRead;
      }
      const after = await file.stat();
      if (after.dev !== before.dev || after.ino !== before.ino || after.size !== bytes)
        throw new Error(`Scientific resource file identity changed: ${label}`);
      if (digest.digest("hex") !== expectedHash)
        throw new Error(`Scientific resource integrity failed: ${label}`);
    } finally { await file.close(); }
  };
  for (const resource of metadata.manifest.resources) {
    await verifyFile(join(directory, resource.path), resource.bytes, resource.sha256, resource.id);
    if (resource.overview) await verifyFile(join(directory, resource.overview.path),
      resource.overview.bytes, resource.overview.sha256, `${resource.id} overview`);
  }
  return metadata;
}

/** Verify the complete bounded v3 overview sidecar for one component. */
export async function readScientificSceneOverview(metadata: ScientificSceneBundleMetadata,
  resourceId: string): Promise<Buffer> {
  if (metadata.bundleSchema !== "scientific-scene-bundle/v3")
    throw new Error("Overview reads require a v3 scientific bundle.");
  const resource = metadata.manifest.resources.find(item => item.id === resourceId);
  if (!resource?.overview) throw new TypeError("Scientific overview is missing.");
  const descriptor = resource.overview;
  const bytes = await boundedRead(join(metadata.directory, descriptor.path), 4096, descriptor.bytes);
  if (hash(bytes) !== descriptor.sha256)
    throw new Error(`Scientific overview integrity failed: ${resource.id}`);
  for (let offset = 0; offset < bytes.length; offset += 8)
    if (!Number.isFinite(bytes.readDoubleLE(offset)))
      throw new Error(`Scientific overview contains non-finite value: ${resource.id}`);
  return bytes;
}

/** Read and verify selected physical v3 tiles without loading the rest of the resource. */
export async function readScientificSceneTiles(metadata: ScientificSceneBundleMetadata,
  resourceId: string, requested: readonly number[]): Promise<Map<number, Buffer>> {
  if (metadata.bundleSchema !== "scientific-scene-bundle/v3")
    throw new Error("Tile reads require a v3 scientific bundle.");
  const resource = metadata.manifest.resources.find(item => item.id === resourceId);
  if (!resource?.tileShape || !resource.tileSha256 || !Array.isArray(requested) ||
      requested.length > resource.tileSha256.length ||
      requested.some(index => !Number.isSafeInteger(index) || index < 0 ||
        index >= resource.tileSha256!.length) || new Set(requested).size !== requested.length)
    throw new TypeError("Invalid scientific tile request.");
  const layout = scientificTileLayout(resourceShape(metadata.manifest, resourceId), resource.tileShape);
  const path = join(metadata.directory, resource.path), info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== resource.bytes)
    throw new Error("Scientific resource file identity changed");
  const file = await open(path, "r"), tiles = new Map<number, Buffer>();
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.dev !== info.dev || actual.ino !== info.ino ||
        actual.size !== info.size) throw new Error("Scientific resource file identity changed");
    for (const index of requested) {
      const tile = layout[index]!, bytes = Buffer.alloc(tile.bytes);
      let read = 0;
      while (read < bytes.length) {
        const result = await file.read(bytes, read, bytes.length - read, tile.offsetBytes + read);
        if (!result.bytesRead) throw new Error("Scientific resource tile truncated");
        read += result.bytesRead;
      }
      if (hash(bytes) !== resource.tileSha256[index])
        throw new Error(`Scientific resource tile integrity failed: ${resource.id}:${index}`);
      for (let point = 0; point < bytes.length; point += 8)
        if (!Number.isFinite(bytes.readDoubleLE(point)))
          throw new Error(`Scientific resource contains non-finite value: ${resource.id}`);
      tiles.set(index, bytes);
    }
    const after = await file.stat();
    if (after.dev !== info.dev || after.ino !== info.ino || after.size !== info.size)
      throw new Error("Scientific resource file identity changed");
    return tiles;
  } finally { await file.close(); }
}

/** Verify only selected manifest-pinned f64 chunks; no other resource bytes enter memory. */
export async function readScientificSceneChunks(metadata: ScientificSceneBundleMetadata,
  resourceId: string, requested: readonly number[]): Promise<Map<number, Buffer>> {
  if (metadata.bundleSchema !== "scientific-scene-bundle/v2")
    throw new Error("Chunk reads require a v2 scientific bundle.");
  const resource = metadata.manifest.resources.find(item => item.id === resourceId);
  if (!resource?.chunkBytes || !resource.chunkSha256 || !Array.isArray(requested) ||
      requested.length > resource.chunkSha256.length ||
      requested.some(index => !Number.isSafeInteger(index) || index < 0 ||
        index >= resource.chunkSha256!.length) || new Set(requested).size !== requested.length)
    throw new TypeError("Invalid scientific chunk request.");
  const path = join(metadata.directory, resource.path), info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== resource.bytes)
    throw new Error("Scientific resource file identity changed");
  const file = await open(path, "r"), chunks = new Map<number, Buffer>();
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.dev !== info.dev || actual.ino !== info.ino ||
        actual.size !== info.size) throw new Error("Scientific resource file identity changed");
    for (const index of requested) {
      const offset = index * resource.chunkBytes;
      const bytes = Buffer.alloc(Math.min(resource.chunkBytes, resource.bytes - offset));
      let read = 0;
      while (read < bytes.length) {
        const result = await file.read(bytes, read, bytes.length - read, offset + read);
        if (!result.bytesRead) throw new Error("Scientific resource chunk truncated");
        read += result.bytesRead;
      }
      if (hash(bytes) !== resource.chunkSha256[index])
        throw new Error(`Scientific resource chunk integrity failed: ${resource.id}:${index}`);
      for (let point = 0; point < bytes.length; point += 8)
        if (!Number.isFinite(bytes.readDoubleLE(point)))
          throw new Error(`Scientific resource contains non-finite value: ${resource.id}`);
      chunks.set(index, bytes);
    }
    const after = await file.stat();
    if (after.dev !== info.dev || after.ino !== info.ino || after.size !== info.size)
      throw new Error("Scientific resource file identity changed");
    return chunks;
  } finally { await file.close(); }
}

export async function readScientificSceneBundle(directory: string): Promise<VerifiedScientificSceneBundle> {
  const metadata = await readScientificSceneBundleMetadata(directory);
  const { manifest } = metadata;
  const resources = new Map<string, Buffer>();
  let total = 0;
  for (const resource of manifest.resources) {
    total += resource.bytes;
    if (total > MAX_RESOURCES) throw new Error("Scientific bundle exceeds memory budget");
    const data = await boundedRead(join(directory, resource.path), MAX_RESOURCES, resource.bytes);
    if (hash(data) !== resource.sha256) throw new Error(`Scientific resource integrity failed: ${resource.id}`);
    if (manifest.schema === "scientific-scene/v2") for (let index = 0; index < resource.chunkSha256!.length; index++) {
      const start = index * resource.chunkBytes!;
      if (hash(data.subarray(start, Math.min(start + resource.chunkBytes!, data.length))) !==
          resource.chunkSha256![index])
        throw new Error(`Scientific resource chunk integrity failed: ${resource.id}:${index}`);
    }
    for (let offset = 0; offset < data.length; offset += 8)
      if (!Number.isFinite(data.readDoubleLE(offset))) throw new Error(`Scientific resource contains non-finite value: ${resource.id}`);
    if (manifest.schema === "scientific-scene/v3") {
      const shape = resourceShape(manifest, resource.id);
      const layout = scientificTileLayout(shape, resource.tileShape!);
      const logical = Buffer.alloc(data.length);
      for (const tile of layout) {
        const physical = data.subarray(tile.offsetBytes, tile.offsetBytes + tile.bytes);
        if (hash(physical) !== resource.tileSha256?.[tile.index])
          throw new Error(`Scientific resource tile integrity failed: ${resource.id}:${tile.index}`);
        for (let x = 0; x < tile.size[0]; x++) for (let y = 0; y < tile.size[1]; y++) {
          const from = ((x * tile.size[1] + y) * tile.size[2]) * 8;
          const to = (((tile.start[0] + x) * shape[1] + tile.start[1] + y) * shape[2] + tile.start[2]) * 8;
          physical.copy(logical, to, from, from + tile.size[2] * 8);
        }
      }
      resources.set(resource.id, logical);
      if (resource.overview) {
        total += resource.overview.bytes;
        if (total > MAX_RESOURCES) throw new Error("Scientific bundle exceeds memory budget");
        const overview = await readScientificSceneOverview(metadata, resource.id);
        const positions = resource.overview.shape.map((size, axis) => Array.from({ length: size }, (_, index) =>
          size === 1 ? 0 : Math.round(index * (shape[axis] - 1) / (size - 1))));
        let index = 0;
        for (const x of positions[0]!) for (const y of positions[1]!) for (const z of positions[2]!) {
          const offset = ((x * shape[1] + y) * shape[2] + z) * 8;
          if (!logical.subarray(offset, offset + 8).equals(overview.subarray(index * 8, index * 8 + 8)))
            throw new Error(`Scientific overview does not match source: ${resource.id}`);
          index++;
        }
      }
    } else resources.set(resource.id, data);
  }
  return { manifest, manifestJson: metadata.manifestJson, resources, fingerprint: metadata.fingerprint };
}
