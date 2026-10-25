import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { readScientificSceneBundle } = require("../dist/main/scientificScene/bundle.js");
const { scientificTileLayout, normalizeScientificSceneManifest } =
  require("../dist/shared/scientificSceneManifest.js");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

/** Convert a fully verified 3D v1/v2 scene into a manifest-pinned, tiled v3 scene. */
export async function tileScientificScene(source, destination, requestedTileShape = [16, 16, 16],
  options = { overview: true }) {
  if (!basename(destination).toLowerCase().endsWith(".sscene") ||
      !Array.isArray(requestedTileShape) || requestedTileShape.length !== 3 ||
      requestedTileShape.some(size => !Number.isSafeInteger(size) || size < 1 || size > 256))
    throw new TypeError("Use a .sscene destination and three tile dimensions from 1 to 256.");
  const verified = await readScientificSceneBundle(resolve(source));
  if (!["scientific-scene/v1", "scientific-scene/v2"].includes(verified.manifest.schema) ||
      verified.manifest.datasets.some(dataset => dataset.shape.length !== 3))
    throw new TypeError("Tile conversion requires a fully verified v1/v2 scene containing only 3D datasets.");
  const resources = [], files = new Map(), overviewFiles = new Map();
  for (const resource of verified.manifest.resources) {
    const dataset = verified.manifest.datasets.find(item => item.components?.some(part =>
      part.resource === resource.id) || item.real === resource.id || item.imaginary === resource.id);
    if (!dataset) throw new Error(`Verified resource has no dataset: ${resource.id}`);
    const shape = dataset.shape, tileShape = [...requestedTileShape];
    while (tileShape.reduce((tiles, size, axis) => tiles * Math.ceil(shape[axis] / size), 1) > 256) {
      const axis = [0, 1, 2].sort((a, b) =>
        Math.ceil(shape[b] / tileShape[b]) - Math.ceil(shape[a] / tileShape[a]))[0];
      if (tileShape[axis] >= shape[axis]) throw new RangeError("Cannot fit the tiled resource into 256 tiles.");
      tileShape[axis] = Math.min(shape[axis], tileShape[axis] * 2);
    }
    const layout = scientificTileLayout(shape, tileShape);
    const logical = verified.resources.get(resource.id);
    if (!logical || logical.length !== resource.bytes) throw new Error(`Verified resource is missing: ${resource.id}`);
    const physical = Buffer.alloc(logical.length), tileSha256 = [];
    for (const tile of layout) {
      for (let x = 0; x < tile.size[0]; x++) for (let y = 0; y < tile.size[1]; y++) {
        const from = (((tile.start[0] + x) * shape[1] + tile.start[1] + y) * shape[2] + tile.start[2]) * 8;
        const to = tile.offsetBytes + ((x * tile.size[1] + y) * tile.size[2]) * 8;
        logical.copy(physical, to, from, from + tile.size[2] * 8);
      }
      tileSha256.push(sha(physical.subarray(tile.offsetBytes, tile.offsetBytes + tile.bytes)));
    }
    files.set(resource.id, physical);
    let overview;
    if (options.overview) {
      const overviewShape = shape.map(size => Math.min(size, 8));
      const positions = overviewShape.map((size, axis) => Array.from({ length: size }, (_, index) =>
        size === 1 ? 0 : Math.round(index * (shape[axis] - 1) / (size - 1))));
      const bytes = Buffer.alloc(overviewShape.reduce((product, size) => product * size, 1) * 8);
      let point = 0;
      for (const x of positions[0]) for (const y of positions[1]) for (const z of positions[2]) {
        const from = ((x * shape[1] + y) * shape[2] + z) * 8;
        logical.copy(bytes, point * 8, from, from + 8);
        point++;
      }
      const path = resource.path.replace(/\.f64$/, ".overview.f64");
      overview = { path, shape: overviewShape, bytes: bytes.length, sha256: sha(bytes) };
      overviewFiles.set(path, bytes);
    }
    resources.push({ id: resource.id, path: resource.path, format: resource.format, count: resource.count,
      bytes: resource.bytes, sha256: sha(physical), layout: "tiled-3d", tileShape, tileSha256,
      ...(overview ? { overview } : {}) });
  }
  const manifestValue = { ...verified.manifest, schema: "scientific-scene/v3", resources };
  const checked = normalizeScientificSceneManifest(manifestValue);
  if (!checked.ok) throw new TypeError(`Tiled conversion is invalid: ${checked.errors.join(" ")}`);
  const manifest = Buffer.from(`${JSON.stringify(manifestValue, null, 2)}\n`);
  if (manifest.length > 64 * 1024) throw new RangeError("Tiled manifest exceeds the metadata budget.");
  const root = resolve(destination);
  await mkdir(root);
  for (const resource of resources) await writeFile(join(root, resource.path), files.get(resource.id));
  for (const [path, bytes] of overviewFiles) await writeFile(join(root, path), bytes);
  await writeFile(join(root, "manifest.json"), manifest);
  await writeFile(join(root, "bundle.json"), `${JSON.stringify({
    schema: "scientific-scene-bundle/v3",
    manifest: { path: "manifest.json", bytes: manifest.length, sha256: sha(manifest) },
  }, null, 2)}\n`);
  return { directory: root, fingerprint: sha(manifest), tileShapes: resources.map(item => item.tileShape),
    overviewBytes: [...overviewFiles.values()].reduce((sum, bytes) => sum + bytes.length, 0) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , source, destination, x, y, z] = process.argv;
  if (!source || !destination || ([x, y, z].some(value => value !== undefined) &&
      [x, y, z].some(value => value === undefined)))
    throw new Error("Usage: node scripts/tile-scientific-scene.mjs <v1-or-v2.sscene> <new-v3.sscene> [tileX tileY tileZ]");
  const result = await tileScientificScene(source, destination,
    x === undefined ? [16, 16, 16] : [Number(x), Number(y), Number(z)]);
  process.stdout.write(`Created ${result.directory} (${result.fingerprint})\n`);
}
