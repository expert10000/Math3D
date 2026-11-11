import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease20Assets } from './verify-release20-assets.mjs';

const root = await mkdtemp(join(tmpdir(), 'math3d-release20-assets-'));
const assets = join(root, 'release-assets');
const resources = join(root, 'release', 'win-unpacked', 'resources');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function write(relative, bytes) { const target = join(root, relative); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, bytes); }
async function sums() {
  const names = (await readdir(assets)).filter(name => name !== 'SHA256SUMS.txt').sort();
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
  const omitted = bom.components.pop();
  await write('release-assets/Math3D-2.0.0-windows.cdx.json', JSON.stringify(bom));
  await sums();
  await assert.rejects(verifyRelease20Assets(root), /SBOM file coverage/);
  bom.components.push(omitted);
  const nativeOwners = { 'math3d-cgal-worker.exe': 'application:math3d-native-cgal-worker',
    'gmp-10.dll': 'native:gmp:6.3.0', 'mpfr-6.dll': 'native:mpfr:4.2.2' };
  const binaries = {};
  for (const [name, owner] of Object.entries(nativeOwners)) {
    const bytes = `${name} bytes`;
    binaries[name] = sha(bytes);
    await write(`release/win-unpacked/resources/native-cgal/${name}`, bytes);
    bom.components.push({ type: 'file', name: `resources/native-cgal/${name}`,
      hashes: [{ alg: 'SHA-256', content: binaries[name] }],
      properties: [{ name: 'math3d:owner', value: owner }] });
    bom.components.push({ 'bom-ref': owner, type: 'library', name });
  }
  const source = JSON.stringify({ schemaVersion: 1, target: 'windows',
    math3d: { commit: 'a'.repeat(40) }, nativeCgal: {
      distributionStatus: 'source-bundle-integrated', dependencyManifestSha256: 'b'.repeat(64) } }) + '\n';
  await write('release-assets/SOURCE_MANIFEST-windows.json', source);
  const receipt = { schema: 'math3d.native-cgal-build/v1', target: 'windows', triplet: 'x64-windows',
    sourceManifestSha256: sha(source), sourceCommit: 'a'.repeat(40),
    dependencyManifestSha256: 'b'.repeat(64),
    vcpkgRecipeCommit: '52fd90f2b7798d9fe6fef18fc1787db44574d704',
    versions: { cgal: '6.2.1', 'boost-core': '1.92.0', gmp: '6.3.0', mpfr: '4.2.2' },
    licenseEvidence: { cgalExpression: 'GPL-3.0-or-later OR LicenseRef-Commercial',
      cgalCorefinementHeaderSha256: 'c'.repeat(64),
      copyrightSha256: Object.fromEntries(['cgal', 'boost-core', 'gmp', 'mpfr'].map(name => [name, 'd'.repeat(64)])) },
    vcpkgSbomSha256: Object.fromEntries(['cgal', 'boost-core', 'gmp', 'mpfr'].map(name => [name, 'e'.repeat(64)])),
    binaries, sbomOwners: nativeOwners };
  await write('release-assets/NATIVE_BUILD_RECEIPT-windows.json', JSON.stringify(receipt));
  await write('release-assets/Math3D-2.0.0-windows.cdx.json', JSON.stringify(bom));
  await sums();
  assert.equal((await verifyRelease20Assets(root)).unpackedFileCount, 7);
  receipt.licenseEvidence.copyrightSha256.gmp = '';
  await write('release-assets/NATIVE_BUILD_RECEIPT-windows.json', JSON.stringify(receipt));
  await sums();
  await assert.rejects(verifyRelease20Assets(root), /not bound to the released sources/);
  receipt.licenseEvidence.copyrightSha256.gmp = 'd'.repeat(64);
  receipt.binaries['gmp-10.dll'] = sha('changed');
  await write('release-assets/NATIVE_BUILD_RECEIPT-windows.json', JSON.stringify(receipt));
  await sums();
  await assert.rejects(verifyRelease20Assets(root), /Native CGAL binary hash or SBOM owner/);
  console.log('Release 2.0 assets reject changed binaries, license evidence, missing SBOM files and attribution.');
} finally { await rm(root, { recursive: true, force: true }); }
