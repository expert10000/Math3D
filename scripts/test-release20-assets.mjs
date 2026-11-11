import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease20Assets } from './verify-release20-assets.mjs';
import { stageRelease20CandidateAssets } from './stage-release20-candidate-assets.mjs';

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
  await write('release/win-unpacked/resources/python-worker/worker.exe', 'worker binary');
  await write('release-assets/Math3D-Setup-2.0.0.exe', 'installer binary');
  const commit = 'a'.repeat(40), thumbprint = 'b'.repeat(40);
  const identityBytes = JSON.stringify({ version: '2.0.0', commit, dirty: false });
  await write('dist/build-identity.json', identityBytes);
  const freezeBytes = JSON.stringify({ schema: 'math3d/release20-rc1-freeze/v1', status: 'frozen',
    version: '2.0.0', sourceCommit: commit });
  await write('release-assets/freeze-manifest.json', freezeBytes);
  const candidate = { schema: 'math3d/release20-candidate/v1', math3d: { version: '2.0.0', channel: 'stable',
    commit, installerName: 'Math3D-Setup-2.0.0.exe', installerSha256: sha('installer binary'),
    executableSha256: sha('app binary'), workerSha256: sha('worker binary'),
    buildIdentitySha256: sha(identityBytes), freezeManifestSha256: sha(freezeBytes), signerThumbprint: thumbprint,
    nsisSystemDllSha256: '1556ee1bf1cb477124e1269b534ed81653ba71994dab7903ee3782b75acc2810' },
    inputs: Object.fromEntries(['package-lock.json', 'renderer/package-lock.json',
      'python/worker/requirements.freeze.txt', 'python/worker/build-requirements.freeze.txt'].map(name => [name, sha(name)])) };
  await write('release-assets/candidate-manifest.json', JSON.stringify(candidate));
  await write('release-assets/signatures.json', '\uFEFF' + JSON.stringify({ schema: 'math3d/release20-signatures/v1',
    thumbprint, files: [sha('installer binary'), sha('app binary'), sha('worker binary')].map(sha256 => ({ sha256 })) }));
  await write('release-assets/nsis.json', '\uFEFF' + JSON.stringify({ schema: 'math3d/release20-nsis/v1',
    installerSha256: sha('installer binary'), systemDllSha256: candidate.math3d.nsisSystemDllSha256, systemDllBytes: 30208 }));
  const nativeSource = { name: 'CGAL', version: '6.2.1', targets: ['windows', 'native-cgal'],
    filename: 'CGAL-cgal-v6.2.1.tar.gz', sha256: sha('native source bytes') };
  await write('compliance/public-source-manifest.json', JSON.stringify({ sources: [nativeSource] }));
  await write('release-assets/CGAL-cgal-v6.2.1.tar.gz', 'native source bytes');
  await write('release-assets/Math3D-2.0.0-source.zip', 'project source bytes');
  await write('release-assets/SOURCE_MANIFEST-windows.json', JSON.stringify({ math3d: { version: '2.0.0', commit,
    sourceArchive: 'Math3D-2.0.0-source.zip', releaseBuildPatch: null }, target: 'windows', sources: [nativeSource] }));
  await write('release-assets/Math3D-2.0.0-windows-licenses.md', '# Math3D 2.0.0 windows release inventory\n## Declared package licenses\n');
  const components = [
    ['Math3D.exe', 'app binary'],
    ['resources/python-worker/worker.exe', 'worker binary'],
    ...['LICENSE', 'THIRD_PARTY_NOTICES.md', 'SOURCE_OFFER.md'].map(name => [`resources/${name}`, `${name} text\n`]),
  ].map(([name, bytes]) => ({ type: 'file', name, hashes: [{ alg: 'SHA-256', content: sha(bytes) }],
    properties: [{ name: 'math3d:owner', value: 'Math3D' }] }));
  const bom = { bomFormat: 'CycloneDX', specVersion: '1.6', metadata: { component: { name: 'Math3D', version: '2.0.0' } },
    components: [{ type: 'application', name: 'Math3D', properties: [{ name: 'math3d:sourceCommit', value: commit }] }, ...components] };
  await write('release-assets/Math3D-2.0.0-windows.cdx.json', JSON.stringify(bom));
  await sums();
  assert.equal((await verifyRelease20Assets(root)).unpackedFileCount, 5);
  const candidateDir = join(root, 'candidate'), sbomDir = join(root, 'sbom'), sourceDir = join(root, 'source');
  await mkdir(candidateDir); await mkdir(sbomDir); await mkdir(sourceDir);
  for (const name of ['Math3D-Setup-2.0.0.exe', 'candidate-manifest.json', 'freeze-manifest.json', 'signatures.json', 'nsis.json'])
    await copyFile(join(assets, name), join(candidateDir, name));
  for (const name of ['Math3D-2.0.0-windows.cdx.json', 'Math3D-2.0.0-windows-licenses.md'])
    await copyFile(join(assets, name), join(sbomDir, name));
  for (const name of ['CGAL-cgal-v6.2.1.tar.gz', 'Math3D-2.0.0-source.zip', 'SOURCE_MANIFEST-windows.json'])
    await copyFile(join(assets, name), join(sourceDir, name));
  assert.equal((await stageRelease20CandidateAssets(root, candidateDir, sbomDir, sourceDir, join(root, 'staged'))).unpackedFileCount, 5);
  const uploaded = join(root, 'uploaded');
  await mkdir(join(uploaded, 'assets'), { recursive: true });
  for (const name of await readdir(assets)) await copyFile(join(assets, name), join(uploaded, 'assets', name));
  for (const name of ['Math3D-Setup-2.0.0.exe', 'candidate-manifest.json'])
    await copyFile(join(assets, name), join(uploaded, name));
  const portableArgs = ['scripts/verify-release20-uploaded-assets.mjs', uploaded, commit,
    candidate.math3d.installerSha256, candidate.math3d.freezeManifestSha256, join(root, 'portable-review.json')];
  assert.equal(spawnSync(process.execPath, portableArgs, { encoding: 'utf8' }).status, 0);
  await writeFile(join(uploaded, 'assets', 'Math3D-Setup-2.0.0.exe'), 'tampered');
  assert.equal(spawnSync(process.execPath, portableArgs, { encoding: 'utf8' }).status, 1);
  await assert.rejects(stageRelease20CandidateAssets(root, candidateDir, sbomDir, sourceDir, join(root, 'staged')), /empty/);
  await write('release-assets/CGAL-cgal-v6.2.1.tar.gz', 'wrong native source');
  await sums();
  await assert.rejects(verifyRelease20Assets(root), /Corresponding source bytes differ/);
  await write('release-assets/CGAL-cgal-v6.2.1.tar.gz', 'native source bytes');
  await sums();
  await write('release-assets/Math3D-Setup-2.0.0.exe', 'tampered');
  await assert.rejects(verifyRelease20Assets(root), /Checksum mismatch/);
  await write('release-assets/Math3D-Setup-2.0.0.exe', 'installer binary');
  await write('release/win-unpacked/Math3D.exe', 'tampered');
  await assert.rejects(verifyRelease20Assets(root), /Unpacked executable bytes/);
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
