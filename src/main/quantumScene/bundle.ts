import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { assertScene, verifyScenePayload, type ScenePayload } from "./index";

// Independent, read-only consumer of Theory Lab's frozen regular .qscene format.
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const digest = async (bytes: Uint8Array) => hash(bytes);

async function boundedRead(path: string, expected?: number): Promise<Buffer> {
  const info = await lstat(path);
  const limit = expected ?? 128 * 1024;
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit || (expected !== undefined && info.size !== expected))
    throw new Error("Invalid bundle file size or link");
  const file = await open(path, "r");
  try {
    const actual = await file.stat();
    if (!actual.isFile() || actual.dev !== info.dev || actual.ino !== info.ino || actual.size > limit ||
        (expected !== undefined && actual.size !== expected))
      throw new Error("Invalid bundle file size or identity");
    const bytes = Buffer.alloc(limit + 1);
    let count = 0;
    while (count <= limit) {
      const { bytesRead } = await file.read(bytes, count, bytes.length - count, count);
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > limit || (expected !== undefined && count !== expected)) throw new Error("Invalid bundle file size");
    return bytes.subarray(0, count);
  } finally {
    await file.close();
  }
}

export async function readQuantumSceneBundle(directory: string): Promise<ScenePayload> {
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("Bundle root must be a directory, not a link");
  const manifest: unknown = JSON.parse((await boundedRead(join(directory, "bundle.json"))).toString("utf8"));
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Invalid scene bundle manifest");
  const m = manifest as Record<string, unknown>;
  const sceneRef = m.scene as Record<string, unknown> | undefined;
  if (m.schema !== "quantum-scene-bundle/v1" || Object.keys(m).sort().join(",") !== "scene,schema" ||
      !sceneRef || typeof sceneRef !== "object" || Array.isArray(sceneRef) ||
      Object.keys(sceneRef).sort().join(",") !== "bytes,path,sha256" || sceneRef.path !== "scene.json" ||
      !Number.isInteger(sceneRef.bytes) || (sceneRef.bytes as number) < 1 || (sceneRef.bytes as number) > 128 * 1024 ||
      typeof sceneRef.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sceneRef.sha256))
    throw new Error("Invalid scene bundle manifest");
  const bytes = await boundedRead(join(directory, "scene.json"), sceneRef.bytes as number);
  if (hash(bytes) !== sceneRef.sha256) throw new Error("Scene metadata integrity failed");
  const scene: unknown = JSON.parse(bytes.toString("utf8"));
  assertScene(scene);
  const expected = new Set(["bundle.json", "scene.json", ...scene.datasets.map(d => d.path)]);
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== expected.size || entries.some(e => !e.isFile() || e.isSymbolicLink() || !expected.has(e.name)))
    throw new Error("Bundle contains missing, unexpected or linked files");
  const artifacts: ScenePayload["artifacts"] = {};
  for (const d of scene.datasets) artifacts[d.path] = await boundedRead(join(directory, d.path), d.bytes);
  const payload = { scene, artifacts };
  await verifyScenePayload(payload, digest);
  return payload;
}
