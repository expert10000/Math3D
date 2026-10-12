#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assets = join(root, "renderer", "dist", "assets");
const scripts = readdirSync(assets).filter(name => name.endsWith(".js")).sort();
const entry = scripts.filter(name => /^index-[A-Za-z0-9_-]+\.js$/.test(name));
if (entry.length !== 1) throw new Error(`Expected one renderer entry script; found ${entry.length}`);

const size = (name) => {
  const bytes = readFileSync(join(assets, name));
  return { bytes: bytes.byteLength, gzipBytes: gzipSync(bytes, { level: 9 }).byteLength };
};
const entrySize = size(entry[0]);
const all = scripts.map(size).reduce((sum, value) => ({
  bytes: sum.bytes + value.bytes, gzipBytes: sum.gzipBytes + value.gzipBytes,
}), { bytes: 0, gzipBytes: 0 });
process.stdout.write(`${JSON.stringify({ entry: entry[0], entrySize, javascriptFiles: scripts.length,
  allJavascript: all }, null, 2)}\n`);
