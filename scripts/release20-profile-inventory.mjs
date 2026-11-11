#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function inventoryRelease20Profile(root) {
  root = resolve(root);
  if (!(await lstat(root)).isDirectory()) throw new Error('Profile root must be a directory.');
  const files = [];
  async function walk(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name), info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`Profile contains a link: ${path}`);
      if (info.isDirectory()) { await walk(path); continue; }
      if (!info.isFile()) throw new Error(`Profile contains a special file: ${path}`);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      files.push({ path: relative(root, path).split(sep).join('/'), bytes: info.size, sha256: hash.digest('hex') });
    }
  }
  await walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  if (!files.length) throw new Error('Profile is empty.');
  const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return { schema: 'math3d/release20-profile-inventory/v1', fileCount: files.length, digest, files };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: release20-profile-inventory.mjs <profile-root>');
    console.log(JSON.stringify(await inventoryRelease20Profile(process.argv[2])));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
