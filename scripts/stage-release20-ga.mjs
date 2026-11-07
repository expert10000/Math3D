#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease20Assets } from './verify-release20-assets.mjs';
import { verifyRelease20GaSignoff } from './verify-release20-ga-signoff.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const insist = (ok, message) => { if (!ok) throw new Error(message); };
const safeName = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);

export async function verifyFlatChecksumDirectory(directory, sumsName, required = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  insist(entries.length > 1 && entries.every(entry => entry.isFile() && safeName(entry.name)),
    `Unsafe or empty release asset directory: ${directory}`);
  const names = entries.map(entry => entry.name);
  insist(names.includes(sumsName) && required.every(name => names.includes(name)),
    `Required release files or ${sumsName} are missing.`);
  const listed = new Map();
  for (const line of (await readFile(join(directory, sumsName), 'utf8')).trimEnd().split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    insist(match && match[2] !== sumsName && !listed.has(match[2]), `Invalid checksum entry: ${line}`);
    listed.set(match[2], match[1]);
  }
  insist(listed.size === names.length - 1 && names.every(name => name === sumsName || listed.has(name)),
    'Release checksum coverage differs from asset files.');
  for (const [name, expected] of listed)
    insist(sha(await readFile(join(directory, name))) === expected, `Release asset checksum mismatch: ${name}`);
  return names.sort();
}

export async function stageRelease20GaFiles({ root, outputDir, sourceCommit, installerSha256,
  publishedPlatforms, candidatePath, rc2Path, signoffPath, notesPath }) {
  const destination = resolve(outputDir);
  const within = relative(resolve(root), destination);
  insist(destination !== resolve(root) && !['release-assets', 'release-assets-linux', 'release'].some(dir =>
    within === dir || within.startsWith(dir + sep)), 'Staging output cannot overlap release source directories.');
  await mkdir(destination, { recursive: true });
  insist((await readdir(destination)).length === 0, 'GA staging directory must be empty.');
  const inputs = [
    ['release-assets', await verifyFlatChecksumDirectory(join(root, 'release-assets'), 'SHA256SUMS.txt')],
  ];
  if (publishedPlatforms.includes('linux')) inputs.push(['release-assets-linux',
    await verifyFlatChecksumDirectory(join(root, 'release-assets-linux'), 'SHA256SUMS-linux.txt',
      ['Math3D-2.0.0-linux-x64.AppImage', 'Math3D-2.0.0-linux-x64.deb',
        'Math3D-2.0.0-linux-x64.rpm', 'Math3D-2.0.0-linux.cdx.json'])]);
  const items = inputs.flatMap(([folder, names]) => names.map(name =>
    ({ source: join(root, folder, name), original: `${folder}/${name}`, name, platform: folder === 'release-assets' ? 'windows' : 'linux' })));
  items.push(...[
    [candidatePath, 'candidate-manifest.json'], [rc2Path, 'rc2-rehearsal.json'],
    [signoffPath, 'ga-signoff.json'], [notesPath, 'RELEASE_NOTES.md'],
  ].map(([source, name]) => ({ source: resolve(source), original: resolve(source), name, platform: 'evidence' })));
  const staged = new Map(), files = [];
  for (const item of items) {
    insist(safeName(item.name) && (await lstat(item.source)).isFile(), `Unsafe GA asset source: ${item.name}`);
    const digest = sha(await readFile(item.source));
    let name = item.name;
    if (staged.has(name)) {
      insist(item.platform === 'linux', `Conflicting GA asset name: ${name}`);
      if (staged.get(name) === digest) { files.push({ source: item.original, asset: name, sha256: digest }); continue; }
      name = `linux-${name}`;
      insist(!staged.has(name), `Conflicting GA asset name: ${name}`);
    }
    await copyFile(item.source, join(destination, name));
    insist(sha(await readFile(join(destination, name))) === digest, `Staged GA bytes changed: ${name}`);
    staged.set(name, digest);
    files.push({ source: item.original, asset: name, sha256: digest });
  }
  insist(staged.get('Math3D-Setup-2.0.0.exe') === installerSha256,
    'Staged Windows installer differs from approved candidate.');
  const manifest = { schema: 'math3d/release20-ga-assets/v1', tag: 'v2.0.0', sourceCommit,
    installerSha256, publishedPlatforms, files };
  insist(!staged.has('RELEASE_ASSET_MAP.json'), 'Asset map name conflicts with release inputs.');
  await writeFile(join(destination, 'RELEASE_ASSET_MAP.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { directory: destination, manifest, assetCount: staged.size + 1 };
}

async function main() {
  const [signoffPath, candidatePath, rc2Path, notesPath, outputDir] = process.argv.slice(2);
  if (![signoffPath, candidatePath, rc2Path, notesPath, outputDir].every(Boolean))
    throw new Error('Usage: node scripts/stage-release20-ga.mjs <signoff> <candidate> <rc2-report> <release-notes> <empty-output-dir>');
  const root = process.cwd(), sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  insist(!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    'GA staging requires a clean source checkout.');
  const tagCommit = execFileSync('git', ['rev-parse', 'refs/tags/v2.0.0^{commit}'], { cwd: root, encoding: 'utf8' }).trim();
  insist(tagCommit === sourceCommit, 'v2.0.0 does not point to the signed-off source commit.');
  const signoff = await verifyRelease20GaSignoff({ root, signoffPath, candidatePath, rc2Path, notesPath, expectedCommit: sourceCommit });
  const assets = await verifyRelease20Assets(root);
  insist(assets.installerSha256 === signoff.installerSha256, 'Release assets differ from GA sign-off installer.');
  const result = await stageRelease20GaFiles({ root, outputDir, sourceCommit,
    installerSha256: signoff.installerSha256, publishedPlatforms: signoff.publishedPlatforms,
    candidatePath, rc2Path, signoffPath, notesPath });
  console.log(JSON.stringify({ ...result, manifest: undefined }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
