#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeContracts, freezeLockfiles, verifyRelease20Freeze } from './verify-release20-freeze.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function prepareRelease20Freeze(root, sourceCommit) {
  const read = name => readFile(join(root, name));
  const app = JSON.parse((await read('package.json')).toString('utf8'));
  const lock = JSON.parse((await read('package-lock.json')).toString('utf8'));
  const nativeBytes = await read('native/cgal-worker/dependency-manifest.json');
  const sourceBytes = await read('compliance/public-source-manifest.json');
  const native = JSON.parse(nativeBytes.toString('utf8'));
  const sources = JSON.parse(sourceBytes.toString('utf8'));
  const cgal = sources.sources.find(item => item.name === 'CGAL' &&
    item.version === native.windowsReferenceBuild.cgal && item.targets.includes('windows'));
  if (!cgal) throw new Error('Windows native CGAL corresponding source is missing.');
  const manifest = { schema: 'math3d/release20-rc1-freeze/v1', status: 'frozen', version: '2.0.0', sourceCommit,
    lockfiles: Object.fromEntries(await Promise.all(freezeLockfiles.map(async path => [path, sha(await read(path))]))),
    dependencies: Object.fromEntries(['electron', 'electron-builder', 'better-sqlite3'].map(name =>
      [name, lock.packages?.[`node_modules/${name}`]?.version ?? app.dependencies?.[name] ?? app.devDependencies?.[name]])),
    contracts: Object.fromEntries(await Promise.all(Object.entries(freezeContracts).map(async ([path, expected]) =>
      [path, { sha256: sha(await read(path)), format: expected.format?.[1] ?? null, schemaVersion: expected.version[1] }]))),
    nativeSources: { dependencyManifestSha256: sha(nativeBytes), publicSourceManifestSha256: sha(sourceBytes),
      distributionStatus: native.distributionStatus, windowsCgalVersion: cgal.version, windowsCgalSourceSha256: cgal.sha256 } };
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let temporary;
  try {
    if (process.argv.length !== 3) throw new Error('Usage: prepare-release20-freeze.mjs <new-manifest-path>');
    const root = process.cwd(), sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
      throw new Error('Freeze preparation requires a clean source checkout.');
    const destination = resolve(process.argv[2]);
    temporary = `${destination}.part`;
    await writeFile(temporary, JSON.stringify(await prepareRelease20Freeze(root, sourceCommit), null, 2) + '\n', { flag: 'wx' });
    await verifyRelease20Freeze({ root, manifestPath: temporary, expectedCommit: sourceCommit });
    await writeFile(destination, await readFile(temporary), { flag: 'wx' });
    await unlink(temporary); temporary = undefined;
    console.log(JSON.stringify({ sourceCommit, manifest: destination }));
  } catch (error) { if (temporary) await unlink(temporary).catch(() => {}); console.error(error.message); process.exitCode = 1; }
}
