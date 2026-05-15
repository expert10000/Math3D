import { decode as decodeBase64String, encode as encodeBase64String } from "base-64";
import { Directory, File, Paths } from "expo-file-system";
import type { MobileMeshPayload } from "../viewer/mobileSurfacePreview";

const CACHE_SCHEMA_VERSION = 1;
const STORAGE_DIR_NAME = "math3d-mobile";
const CACHE_FILE_NAME = "mesh-cache.json";
const MAX_ENTRIES = 20;
const MAX_ENTRY_BYTES = 12 * 1024 * 1024;

const storageDirectory = new Directory(Paths.document, STORAGE_DIR_NAME);
const cacheFile = new File(storageDirectory, CACHE_FILE_NAME);

type PersistedCacheEntry = {
  key: string;
  positions_b64: string;
  indices_b64: string;
  normals_b64?: string;
  vertexCount: number;
  triCount: number;
  updatedAt: number;
};

type PersistedCachePayload = {
  schemaVersion: number;
  entries: PersistedCacheEntry[];
};

const ensureStorageLocation = () => {
  storageDirectory.create({ idempotent: true, intermediates: true });
  if (!cacheFile.exists) {
    cacheFile.create({ intermediates: true, overwrite: true });
  }
};

const toByteView = (input: ArrayBuffer | ArrayBufferView): Uint8Array => {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
};

const toBinaryString = (input: ArrayBuffer | ArrayBufferView): string => {
  const bytes = toByteView(input);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...part);
  }
  return binary;
};

const encodeBase64 = (input: ArrayBuffer | ArrayBufferView): string => encodeBase64String(toBinaryString(input));

const decodeBase64ToArrayBuffer = (value: string): ArrayBuffer => {
  const binary = decodeBase64String(value || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const readCachePayload = async (): Promise<PersistedCachePayload> => {
  try {
    ensureStorageLocation();
    if (!cacheFile.exists) return { schemaVersion: CACHE_SCHEMA_VERSION, entries: [] };
    const raw = await cacheFile.text();
    if (!raw.trim()) return { schemaVersion: CACHE_SCHEMA_VERSION, entries: [] };
    const parsed = JSON.parse(raw) as Partial<PersistedCachePayload>;
    if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
      return { schemaVersion: CACHE_SCHEMA_VERSION, entries: [] };
    }
    const entries = parsed.entries.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Partial<PersistedCacheEntry>;
      return (
        typeof value.key === "string" &&
        typeof value.positions_b64 === "string" &&
        typeof value.indices_b64 === "string" &&
        typeof value.vertexCount === "number" &&
        typeof value.triCount === "number" &&
        typeof value.updatedAt === "number"
      );
    }) as PersistedCacheEntry[];
    return {
      schemaVersion: CACHE_SCHEMA_VERSION,
      entries: entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES),
    };
  } catch {
    return { schemaVersion: CACHE_SCHEMA_VERSION, entries: [] };
  }
};

const writeCachePayload = async (payload: PersistedCachePayload): Promise<void> => {
  ensureStorageLocation();
  cacheFile.write(JSON.stringify(payload, null, 2), { encoding: "utf8" });
};

export const createMeshCacheKey = (parts: ReadonlyArray<string | number>): string => parts.join("|");

export const readCachedMesh = async (key: string): Promise<MobileMeshPayload | null> => {
  const payload = await readCachePayload();
  const entry = payload.entries.find((item) => item.key === key);
  if (!entry) return null;
  return {
    positions: new Float32Array(decodeBase64ToArrayBuffer(entry.positions_b64)),
    indices: new Uint32Array(decodeBase64ToArrayBuffer(entry.indices_b64)),
    normals: entry.normals_b64 ? new Float32Array(decodeBase64ToArrayBuffer(entry.normals_b64)) : undefined,
    vertexCount: entry.vertexCount,
    triCount: entry.triCount,
  };
};

export const writeCachedMesh = async (key: string, mesh: MobileMeshPayload): Promise<void> => {
  const positionsB64 = encodeBase64(mesh.positions);
  const indicesB64 = encodeBase64(mesh.indices);
  const normalsB64 = mesh.normals ? encodeBase64(mesh.normals) : undefined;
  const estimatedBytes = positionsB64.length + indicesB64.length + (normalsB64?.length ?? 0);
  if (estimatedBytes > MAX_ENTRY_BYTES) return;

  const payload = await readCachePayload();
  const nextEntry: PersistedCacheEntry = {
    key,
    positions_b64: positionsB64,
    indices_b64: indicesB64,
    normals_b64: normalsB64,
    vertexCount: mesh.vertexCount,
    triCount: mesh.triCount,
    updatedAt: Date.now(),
  };
  const withoutExisting = payload.entries.filter((entry) => entry.key !== key);
  const entries = [nextEntry, ...withoutExisting].slice(0, MAX_ENTRIES);
  await writeCachePayload({ schemaVersion: CACHE_SCHEMA_VERSION, entries });
};

export const clearMeshCache = async (): Promise<void> => {
  await writeCachePayload({ schemaVersion: CACHE_SCHEMA_VERSION, entries: [] });
};
