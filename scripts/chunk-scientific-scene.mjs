import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readScientificSceneBundle } = require("../dist/main/scientificScene/bundle.js");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

/** Convert a fully verified v1 scene into a manifest-pinned chunked v2 scene. */
export async function chunkScientificScene(source, destination, chunkBytes = 4096) {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 4096 || chunkBytes > 262144 ||
      chunkBytes % 8 !== 0 || basename(destination).toLowerCase().endsWith(".sscene") === false)
    throw new TypeError("Use a .sscene destination and a chunk size of 4096–262144 bytes divisible by eight.");
  const verified = await readScientificSceneBundle(resolve(source));
  if (verified.manifest.schema !== "scientific-scene/v1")
    throw new TypeError("Conversion requires a verified v1 scientific scene.");
  const resources = verified.manifest.resources.map(resource => {
    const bytes = verified.resources.get(resource.id);
    if (!bytes) throw new Error(`Verified resource is missing: ${resource.id}`);
    const chunkSha256 = [];
    for (let offset = 0; offset < bytes.length; offset += chunkBytes)
      chunkSha256.push(sha(bytes.subarray(offset, offset + chunkBytes)));
    if (chunkSha256.length > 256) throw new RangeError("Choose a larger chunk size for this scene.");
    return { ...resource, chunkBytes, chunkSha256 };
  });
  const manifest = Buffer.from(`${JSON.stringify({ ...verified.manifest,
    schema: "scientific-scene/v2", resources }, null, 2)}\n`);
  if (manifest.length > 64 * 1024) throw new RangeError("Chunked manifest exceeds the metadata budget.");
  const root = resolve(destination);
  await mkdir(root);
  for (const resource of resources)
    await writeFile(join(root, resource.path), verified.resources.get(resource.id));
  await writeFile(join(root, "manifest.json"), manifest);
  await writeFile(join(root, "bundle.json"), `${JSON.stringify({
    schema: "scientific-scene-bundle/v2",
    manifest: { path: "manifest.json", bytes: manifest.length, sha256: sha(manifest) },
  }, null, 2)}\n`);
  return { directory: root, fingerprint: sha(manifest) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , source, destination, chunkBytes] = process.argv;
  if (!source || !destination) throw new Error("Usage: node scripts/chunk-scientific-scene.mjs <v1.sscene> <new-v2.sscene> [chunkBytes]");
  const result = await chunkScientificScene(source, destination, chunkBytes === undefined ? 4096 : Number(chunkBytes));
  process.stdout.write(`Created ${result.directory} (${result.fingerprint})\n`);
}
