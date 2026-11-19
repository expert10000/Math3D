#!/usr/bin/env node
import { createHash, X509Certificate } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const [artifactArg, stageArg] = args;
const plan = args.length === 2 && stageArg === '--plan';
if (!artifactArg || args.length !== 2) {
  throw new Error('Usage: stage-release20-selfsigned-prerelease.mjs <artifact-root> [new-stage-dir] [--plan]');
}
const root = resolve(artifactArg);
const stage = stageArg && stageArg !== '--plan' ? resolve(stageArg) : null;
const insist = (condition, message) => { if (!condition) throw new Error(message); };
const safeName = name => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) &&
  !/(?:^|[._-])(?:password|secret|private)(?:[._-]|$)|\.(?:pfx|p12|pem|key|jks|keystore)$/i.test(name);
const sha256 = async file => {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
};
const json = async file => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const regular = async file => (await lstat(file)).isFile();
const file = async (directory, name) => {
  insist(safeName(name), `Unsafe release asset name: ${name}`);
  const path = join(directory, name);
  insist(await regular(path), `Missing or non-regular release asset: ${path}`);
  return path;
};

const manifest = await json(await file(root, 'prerelease-manifest.json'));
insist(manifest.schema === 'math3d/release20-selfsigned-prerelease/v1' &&
  manifest.version === '2.0.0' && /^[0-9a-f]{40}$/.test(manifest.sourceCommit) &&
  manifest.trust === 'self-signed-untrusted-by-default' &&
  manifest.publiclyTrustedPublisher === false && manifest.installedJourneysQualified === false &&
  /^[0-9A-F]{40}$/.test(manifest.signerThumbprint) &&
  /^[0-9a-f]{64}$/.test(manifest.installerSha256), 'Invalid self-signed prerelease manifest.');

const installerName = 'Math3D-Setup-2.0.0-selfsigned-prerelease.exe';
const installer = await file(root, installerName);
insist(await sha256(installer) === manifest.installerSha256, 'Installer bytes differ from prerelease manifest.');
const freezePath = await file(root, 'freeze-manifest.json');
const freeze = await json(freezePath);
insist(await sha256(freezePath) === manifest.freezeSha256 &&
  freeze.sourceCommit === manifest.sourceCommit && freeze.version === '2.0.0' &&
  freeze.status === 'frozen', 'Source freeze differs from prerelease manifest.');

const publicCert = new X509Certificate(await readFile(await file(root, 'signer-public.cer')));
insist(publicCert.fingerprint.replaceAll(':', '').toUpperCase() === manifest.signerThumbprint &&
  publicCert.subject === publicCert.issuer, 'Public certificate differs from self-signed signer.');
const signatures = await json(await file(root, 'signatures.json'));
insist(signatures.schema === 'math3d/release20-selfsigned-prerelease-signatures/v1' &&
  signatures.trust === manifest.trust && signatures.publiclyTrustedPublisher === false &&
  signatures.signerThumbprint === manifest.signerThumbprint && signatures.files?.length === 3,
  'Prerelease signature receipt differs from manifest.');
for (const [name, digest] of [[installerName, manifest.installerSha256], ['Math3D.exe', manifest.appSha256],
  ['worker.exe', manifest.workerSha256]]) {
  insist(signatures.files.some(entry => entry.name === name && entry.sha256 === digest &&
    entry.signerThumbprint === manifest.signerThumbprint && entry.timestamped === true &&
    ['UnknownError', 'Valid'].includes(entry.authenticodeStatus)), `Signature receipt missing ${name}.`);
}
const nsis = await json(await file(root, 'nsis.json'));
insist(nsis.schema === 'math3d/release20-nsis/v1' &&
  nsis.installerSha256 === manifest.installerSha256 && nsis.systemDllBytes === 30208 &&
  nsis.systemDllSha256 === '1556ee1bf1cb477124e1269b534ed81653ba71994dab7903ee3782b75acc2810',
  'Pinned NSIS receipt differs from installer.');

const sourceDir = join(root, 'source');
const sourceManifest = await json(await file(sourceDir, 'SOURCE_MANIFEST-windows.json'));
insist(sourceManifest.target === 'windows' && sourceManifest.math3d?.commit === manifest.sourceCommit &&
  sourceManifest.math3d.version === '2.0.0' &&
  sourceManifest.math3d.sourceArchive === 'Math3D-2.0.0-source.zip',
  'Corresponding-source manifest differs from prerelease source.');
const sourceZip = await file(sourceDir, sourceManifest.math3d.sourceArchive);
insist(await sha256(sourceZip) === sourceManifest.math3d.sourceArchiveSha256,
  'Corresponding-source archive differs from source manifest.');
const sourceNames = new Set(['SOURCE_MANIFEST-windows.json', 'Math3D-2.0.0-source.zip',
  'LICENSE', 'THIRD_PARTY_NOTICES.md', 'SOURCE_OFFER.md', 'Apache-2.0.txt']);
for (const source of sourceManifest.sources ?? []) {
  insist(source.targets?.some(target => ['windows', 'native-cgal'].includes(target)) && safeName(source.filename) &&
    /^[0-9a-f]{64}$/.test(source.sha256) && !sourceNames.has(source.filename),
    'Source manifest contains an unexpected archive.');
  insist(await sha256(await file(sourceDir, source.filename)) === source.sha256,
    `Corresponding-source archive differs: ${source.filename}`);
  sourceNames.add(source.filename);
}
const actualSourceNames = (await readdir(sourceDir)).sort();
insist(actualSourceNames.length === sourceNames.size &&
  actualSourceNames.every(name => sourceNames.has(name)), 'Source directory differs from its expected inventory.');
for (const name of sourceNames) await file(sourceDir, name);

const sbomDir = join(root, 'sbom');
const sbomNames = ['Math3D-2.0.0-windows.cdx.json', 'Math3D-2.0.0-windows-licenses.md'];
insist((await readdir(sbomDir)).sort().join('|') === sbomNames.sort().join('|'),
  'SBOM directory differs from its expected inventory.');
const sbom = await json(await file(sbomDir, 'Math3D-2.0.0-windows.cdx.json'));
insist(sbom.bomFormat === 'CycloneDX' && sbom.metadata?.component?.version === '2.0.0' &&
  sbom.components?.some(component => component.name === 'Math3D' &&
    component.properties?.some(property => property.name === 'math3d:sourceCommit' &&
      property.value === manifest.sourceCommit)), 'SBOM source identity differs from prerelease.');

const inputs = new Map();
for (const name of [installerName, 'prerelease-manifest.json', 'freeze-manifest.json',
  'signatures.json', 'nsis.json', 'signer-public.cer']) inputs.set(name, await file(root, name));
for (const name of sourceNames) {
  insist(!inputs.has(name), `Duplicate release asset name: ${name}`);
  inputs.set(name, await file(sourceDir, name));
}
for (const name of sbomNames) {
  insist(!inputs.has(name), `Duplicate release asset name: ${name}`);
  inputs.set(name, await file(sbomDir, name));
}
const assets = [];
for (const [name, path] of [...inputs].sort(([a], [b]) => a.localeCompare(b))) {
  const stat = await lstat(path);
  assets.push({ name, bytes: stat.size, sha256: await sha256(path) });
}
const map = { schema: 'math3d/release20-selfsigned-prerelease-stage/v1',
  status: 'evidence-staging-only', version: '2.0.0', sourceCommit: manifest.sourceCommit,
  installerSha256: manifest.installerSha256, signerThumbprint: manifest.signerThumbprint,
  publiclyTrustedPublisher: false, installedJourneysQualified: false, assets };
if (plan) {
  console.log(JSON.stringify({ sourceCommit: map.sourceCommit, installerSha256: map.installerSha256,
    assetCount: assets.length, totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    status: map.status }));
  process.exit(0);
}
const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
insist(stage && stage !== root && !stage.startsWith(root + sep) && !root.startsWith(stage + sep) &&
  stage !== checkout && !stage.startsWith(checkout + sep),
  'Stage directory must be separate from the artifact root and source checkout.');
try { await lstat(stage); throw new Error('Stage directory already exists.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(stage, { recursive: true });
for (const asset of assets) {
  await copyFile(inputs.get(asset.name), join(stage, asset.name), constants.COPYFILE_EXCL);
  insist(await sha256(join(stage, asset.name)) === asset.sha256,
    `Staged asset bytes changed: ${asset.name}`);
}
await writeFile(join(stage, 'RELEASE_ASSET_MAP.json'), JSON.stringify(map, null, 2) + '\n', { flag: 'wx' });
const sums = [...assets, { name: 'RELEASE_ASSET_MAP.json',
  sha256: await sha256(join(stage, 'RELEASE_ASSET_MAP.json')) }]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(asset => `${asset.sha256}  ${asset.name}`).join('\n') + '\n';
await writeFile(join(stage, 'SHA256SUMS.txt'), sums, { flag: 'wx' });
console.log(JSON.stringify({ status: map.status, stage, sourceCommit: map.sourceCommit,
  installerSha256: map.installerSha256, assetCount: assets.length }));
