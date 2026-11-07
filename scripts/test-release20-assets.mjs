import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease20Assets } from './verify-release20-assets.mjs';

const root = await mkdtemp(join(tmpdir(), 'math3d-release20-assets-'));
const assets = join(root, 'release-assets');
const resources = join(root, 'release', 'win-unpacked', 'resources');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function write(relative, bytes) { const target = join(root, relative); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, bytes); }
async function sums() {
  const names = ['Math3D-2.0.0-LICENSE', 'Math3D-2.0.0-SOURCE_OFFER.md',
    'Math3D-2.0.0-THIRD_PARTY_NOTICES.md', 'Math3D-2.0.0-windows-licenses.md',
    'Math3D-2.0.0-windows.cdx.json', 'Math3D-Setup-2.0.0.exe'];
  await write('release-assets/SHA256SUMS.txt', (await Promise.all(names.map(async name =>
    `${sha(await readFile(join(assets, name)))}  ${name}`))).join('\n') + '\n');
}
try {
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'SOURCE_OFFER.md']) {
    await write(name, `${name} text\n`);
    await write(`release/win-unpacked/resources/${name}`, `${name} text\n`);
    await write(`release-assets/Math3D-2.0.0-${name}`, `${name} text\n`);
  }
  await write('release/win-unpacked/Math3D.exe', 'app binary');
  await write('release-assets/Math3D-Setup-2.0.0.exe', 'installer binary');
  await write('release-assets/Math3D-2.0.0-windows-licenses.md', '# Math3D 2.0.0 windows release inventory\n## Declared package licenses\n');
  const components = [
    ['Math3D.exe', 'app binary'],
    ...['LICENSE', 'THIRD_PARTY_NOTICES.md', 'SOURCE_OFFER.md'].map(name => [`resources/${name}`, `${name} text\n`]),
  ].map(([name, bytes]) => ({ type: 'file', name, hashes: [{ alg: 'SHA-256', content: sha(bytes) }],
    properties: [{ name: 'math3d:owner', value: 'Math3D' }] }));
  const bom = { bomFormat: 'CycloneDX', specVersion: '1.6', metadata: { component: { name: 'Math3D', version: '2.0.0' } }, components };
  await write('release-assets/Math3D-2.0.0-windows.cdx.json', JSON.stringify(bom));
  await sums();
  assert.equal((await verifyRelease20Assets(root)).unpackedFileCount, 4);
  await write('release-assets/Math3D-Setup-2.0.0.exe', 'tampered');
  await assert.rejects(verifyRelease20Assets(root), /Checksum mismatch/);
  await write('release-assets/Math3D-Setup-2.0.0.exe', 'installer binary');
  await write('release/win-unpacked/Math3D.exe', 'tampered');
  await assert.rejects(verifyRelease20Assets(root), /SBOM file mismatch/);
  await write('release/win-unpacked/Math3D.exe', 'app binary');
  await write('release-assets/Math3D-2.0.0-THIRD_PARTY_NOTICES.md', 'wrong');
  await sums();
  await assert.rejects(verifyRelease20Assets(root), /Attribution differs/);
  await write('release-assets/Math3D-2.0.0-THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md text\n');
  await sums();
  bom.components.pop();
  await write('release-assets/Math3D-2.0.0-windows.cdx.json', JSON.stringify(bom));
  await sums();
  await assert.rejects(verifyRelease20Assets(root), /SBOM file coverage/);
  console.log('Release 2.0 asset integrity rejects changed installer, unpacked file, attribution, and incomplete SBOM.');
} finally { await rm(root, { recursive: true, force: true }); }
