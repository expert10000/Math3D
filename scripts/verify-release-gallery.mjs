#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assets = join(root, "apps/public-site/src/assets");
const web = JSON.parse(await readFile(join(assets, "release-current/manifest.json"), "utf8"));
const field = JSON.parse(await readFile(join(assets, "release-field-current/manifest.json"), "utf8"));
const quantum = JSON.parse(await readFile(join(assets, "release-quantum-current/capture-index.json"), "utf8"));
const images = [
  ...web.entries.map(item => ["release-current", item.file]),
  ...field.entries.map(item => ["release-field-current", item.file]),
  ...quantum.flatMap(item => [item.file, ...(item.variants || [])].map(file => ["release-quantum-current", file])),
];
const seen = new Set();
for (const [folder, file] of images) {
  if (!/^[a-zA-Z0-9._-]+\.png$/.test(file)) throw new Error(`Invalid screenshot filename: ${file}`);
  const key = `${folder}/${file}`;
  if (seen.has(key)) throw new Error(`Repeated screenshot entry: ${key}`);
  seen.add(key);
  const path = join(assets, folder, file);
  const size = (await stat(path)).size;
  if (size < 20_000 || size > 5_000_000) throw new Error(`Unexpected screenshot size: ${key} (${size} bytes)`);
  const header = (await readFile(path)).subarray(0, 24);
  if (header.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`Not a PNG: ${key}`);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width < 1400 || height < 900) throw new Error(`Screenshot too small: ${key} (${width}x${height})`);
}
const counts = {
  total: images.length,
  features: web.entries.filter(item => item.view === "Feature").length,
  graphScenes: web.entries.filter(item => item.view === "Graph scene").length,
  fieldExplorer: field.entries.length,
  quantum: quantum.reduce((sum, item) => sum + 1 + (item.variants || []).length, 0),
  fieldAnalysis: field.entries.filter(item => item.view === "Analysis").length,
};
process.stdout.write(`[release-gallery] verified ${JSON.stringify(counts)}\n`);
