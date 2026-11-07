import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageRelease20GaFiles, verifyFlatChecksumDirectory } from './stage-release20-ga.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = await mkdtemp(join(tmpdir(), 'math3d-ga-stage-'));
const write = async (path, bytes) => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes); };
try {
  const windows = join(root, 'release-assets'), linux = join(root, 'release-assets-linux');
  const installerSha256 = sha(Buffer.from('exact installer'));
  await write(join(windows, 'Math3D-Setup-2.0.0.exe'), 'exact installer');
  await write(join(windows, 'Math3D-2.0.0-LICENSE'), 'GPL copy');
  await write(join(windows, 'SHA256SUMS.txt'),
    `${installerSha256}  Math3D-Setup-2.0.0.exe\n${sha(Buffer.from('GPL copy'))}  Math3D-2.0.0-LICENSE\n`);
  const linuxNames = ['Math3D-2.0.0-linux-x64.AppImage', 'Math3D-2.0.0-linux-x64.deb',
    'Math3D-2.0.0-linux-x64.rpm', 'Math3D-2.0.0-linux.cdx.json'];
  for (const name of linuxNames) await write(join(linux, name), name);
  await write(join(linux, 'Math3D-2.0.0-LICENSE'), 'different Linux license copy');
  const linuxFiles = [...linuxNames, 'Math3D-2.0.0-LICENSE'];
  await write(join(linux, 'SHA256SUMS-linux.txt'), linuxFiles.map(name =>
    `${sha(Buffer.from(name === 'Math3D-2.0.0-LICENSE' ? 'different Linux license copy' : name))}  ${name}`).join('\n') + '\n');
  const evidence = {};
  for (const [name, bytes] of [['candidate.json', 'candidate'], ['rc2.json', 'rc2'],
    ['signoff.json', 'approved'], ['notes.md', 'notes']]) {
    const path = join(root, name); await write(path, bytes); evidence[name] = path;
  }
  const options = { root, outputDir: join(root, 'publish-assets'), sourceCommit: 'a'.repeat(40), installerSha256,
    publishedPlatforms: ['windows', 'linux'], candidatePath: evidence['candidate.json'],
    rc2Path: evidence['rc2.json'], signoffPath: evidence['signoff.json'], notesPath: evidence['notes.md'] };
  const result = await stageRelease20GaFiles(options);
  assert.equal(result.manifest.installerSha256, installerSha256);
  assert.equal(await readFile(join(options.outputDir, 'Math3D-Setup-2.0.0.exe'), 'utf8'), 'exact installer');
  assert.equal(await readFile(join(options.outputDir, 'linux-Math3D-2.0.0-LICENSE'), 'utf8'), 'different Linux license copy');
  assert.equal(result.manifest.files.filter(file => file.asset === 'Math3D-Setup-2.0.0.exe').length, 1);
  await assert.rejects(stageRelease20GaFiles(options), /must be empty/);
  await write(join(linux, linuxNames[0]), 'tampered');
  await assert.rejects(verifyFlatChecksumDirectory(linux, 'SHA256SUMS-linux.txt', linuxNames), /checksum mismatch/);
  await assert.rejects(stageRelease20GaFiles({ ...options, outputDir: windows }), /overlap/);
  console.log('GA staging preserves approved installer bytes, maps Linux collisions, and rejects changed assets.');
} finally { await rm(root, { recursive: true, force: true }); }
