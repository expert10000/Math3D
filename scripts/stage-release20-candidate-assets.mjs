#!/usr/bin/env node
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease20Assets } from './verify-release20-assets.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };

export async function stageRelease20CandidateAssets(root, candidateDir, sbomDir, sourceDir, assetsDir) {
  root = resolve(root); assetsDir = resolve(assetsDir);
  await mkdir(assetsDir, { recursive: true });
  requireValue((await readdir(assetsDir)).length === 0, 'Candidate asset directory must be empty.');
  const sources = [
    ...['Math3D-Setup-2.0.0.exe', 'candidate-manifest.json', 'freeze-manifest.json', 'signatures.json', 'nsis.json']
      .map(name => [join(candidateDir, name), name]),
    ...['Math3D-2.0.0-windows.cdx.json', 'Math3D-2.0.0-windows-licenses.md']
      .map(name => [join(sbomDir, name), name]),
    ...['LICENSE', 'THIRD_PARTY_NOTICES.md', 'SOURCE_OFFER.md']
      .map(name => [join(root, name), `Math3D-2.0.0-${name}`]),
    ...(await readdir(sourceDir)).map(name => [join(sourceDir, name), name]),
  ];
  for (const [source, name] of sources) await copyFile(source, join(assetsDir, name));
  const sums = (await Promise.all(sources.map(async ([, name]) =>
    `${sha(await readFile(join(assetsDir, name)))}  ${name}`))).sort().join('\n') + '\n';
  await writeFile(join(assetsDir, 'SHA256SUMS.txt'), sums, { flag: 'wx' });
  return verifyRelease20Assets(root, '2.0.0', assetsDir);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 7) throw new Error('Usage: stage-release20-candidate-assets.mjs <root> <candidate-dir> <sbom-dir> <source-dir> <empty-assets-dir>');
    console.log(JSON.stringify(await stageRelease20CandidateAssets(...process.argv.slice(2))));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
