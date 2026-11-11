#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease20Candidate } from './verify-release20-candidate.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };
const safeAsset = name => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && name !== '..';

export async function verifyRelease20Assets(root, version = '2.0.0', assetsOverride) {
  requireCondition(version === '2.0.0', 'This gate accepts only the 2.0.0 release.');
  const assets = assetsOverride ?? join(root, 'release-assets');
  const unpacked = join(root, 'release', 'win-unpacked');
  const entries = await readdir(assets, { withFileTypes: true });
  const names = entries.map(entry => entry.name);
  requireCondition(entries.every(entry => entry.isFile() && safeAsset(entry.name)), 'Release assets must be regular, flat files with safe names.');
  requireCondition(names.includes('SHA256SUMS.txt'), 'SHA256SUMS.txt is missing.');
  const files = names.filter(name => name !== 'SHA256SUMS.txt').sort();
  requireCondition(files.length > 0, 'Release asset directory is empty.');
  const lines = (await readFile(join(assets, 'SHA256SUMS.txt'), 'utf8')).trimEnd().split(/\r?\n/);
  requireCondition(lines.length === files.length, 'SHA256SUMS.txt does not cover exactly every asset.');
  const listed = new Map();
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
    requireCondition(match && safeAsset(match[2]) && match[2] !== 'SHA256SUMS.txt', `Malformed checksum line: ${line}`);
    requireCondition(!listed.has(match[2]), `Duplicate checksum entry: ${match[2]}`);
    listed.set(match[2], match[1]);
  }
  requireCondition(listed.size === files.length && files.every(name => listed.has(name)), 'Checksum entries must match asset filenames exactly.');
  for (const name of files) requireCondition(digest(await readFile(join(assets, name))) === listed.get(name), `Checksum mismatch: ${name}`);

  const required = [
    `Math3D-Setup-${version}.exe`, `Math3D-${version}-windows.cdx.json`,
    `Math3D-${version}-windows-licenses.md`, `Math3D-${version}-LICENSE`,
    `Math3D-${version}-THIRD_PARTY_NOTICES.md`, `Math3D-${version}-SOURCE_OFFER.md`,
    'candidate-manifest.json', 'freeze-manifest.json', 'signatures.json', 'nsis.json', 'SOURCE_MANIFEST-windows.json',
    `Math3D-${version}-source.zip`,
  ];
  for (const name of required) requireCondition(listed.has(name), `Required release asset missing: ${name}`);
  const candidate = await verifyRelease20Candidate(join(assets, 'candidate-manifest.json'),
    join(assets, `Math3D-Setup-${version}.exe`));
  const freezeBytes = await readFile(join(assets, 'freeze-manifest.json'));
  const freeze = JSON.parse(freezeBytes.toString('utf8').replace(/^\uFEFF/, ''));
  requireCondition(digest(freezeBytes) === candidate.freezeManifestSha256 &&
    freeze.schema === 'math3d/release20-rc1-freeze/v1' && freeze.status === 'frozen' &&
    freeze.version === version && freeze.sourceCommit === candidate.commit,
    'Frozen source manifest differs from candidate.');
  const buildIdentity = await readFile(join(root, 'dist/build-identity.json'));
  const identity = JSON.parse(buildIdentity);
  requireCondition(digest(buildIdentity) === candidate.buildIdentitySha256 && identity.version === version &&
    identity.commit === candidate.commit && identity.dirty === false, 'Build identity differs from candidate source.');
  const unpackedApp = digest(await readFile(join(unpacked, 'Math3D.exe')));
  const unpackedWorker = digest(await readFile(join(unpacked, 'resources/python-worker/worker.exe')));
  requireCondition(unpackedApp === candidate.executableSha256 && unpackedWorker === candidate.workerSha256,
    'Unpacked executable bytes differ from the signed candidate.');
  const signatures = JSON.parse((await readFile(join(assets, 'signatures.json'), 'utf8')).replace(/^\uFEFF/, ''));
  requireCondition(signatures.schema === 'math3d/release20-signatures/v1' &&
    signatures.thumbprint.toLowerCase() === candidate.signerThumbprint &&
    [candidate.installerSha256, unpackedApp, unpackedWorker].every(hash =>
      signatures.files?.some(file => file.sha256 === hash)), 'Signature receipt differs from candidate bytes.');
  const nsis = JSON.parse((await readFile(join(assets, 'nsis.json'), 'utf8')).replace(/^\uFEFF/, ''));
  requireCondition(nsis.schema === 'math3d/release20-nsis/v1' &&
    nsis.installerSha256 === candidate.installerSha256 &&
    nsis.systemDllSha256 === candidate.nsisSystemDllSha256 && nsis.systemDllBytes === 30208,
    'NSIS receipt differs from candidate bytes.');
  const sourceManifest = JSON.parse(await readFile(join(assets, 'SOURCE_MANIFEST-windows.json'), 'utf8'));
  const declaredSources = JSON.parse(await readFile(join(root, 'compliance/public-source-manifest.json'), 'utf8'));
  const selectedSources = declaredSources.sources.filter(item => item.targets.includes('windows'));
  requireCondition(sourceManifest.math3d?.version === version && sourceManifest.math3d?.commit === candidate.commit &&
    sourceManifest.math3d.sourceArchive === `Math3D-${version}-source.zip` &&
    sourceManifest.math3d.releaseBuildPatch === null &&
    sourceManifest.target === 'windows' && JSON.stringify(sourceManifest.sources) === JSON.stringify(selectedSources) &&
    selectedSources.some(item => item.name === 'CGAL' && item.version === '6.2.1' && item.targets.includes('native-cgal')),
    'Windows corresponding-source inventory differs from candidate or native source pins.');
  for (const source of selectedSources) requireCondition(listed.get(source.filename) === source.sha256,
    `Corresponding source bytes differ: ${source.filename}`);
  for (const source of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'SOURCE_OFFER.md']) {
    const published = `Math3D-${version}-${source}`;
    const bytes = await readFile(join(root, source));
    requireCondition(bytes.length > 0 && digest(bytes) === listed.get(published), `Attribution differs from source: ${published}`);
    requireCondition(digest(bytes) === digest(await readFile(join(unpacked, 'resources', source))), `Packaged attribution differs: ${source}`);
  }

  const bom = JSON.parse(await readFile(join(assets, `Math3D-${version}-windows.cdx.json`), 'utf8'));
  requireCondition(bom.bomFormat === 'CycloneDX' && bom.specVersion === '1.6' &&
    bom.metadata?.component?.name === 'Math3D' && bom.metadata.component.version === version,
  'Windows SBOM identity is invalid.');
  requireCondition(bom.components?.some(component => component.name === 'Math3D' &&
    component.properties?.some(property => property.name === 'math3d:sourceCommit' && property.value === candidate.commit)),
    'Windows SBOM source commit differs from candidate.');
  const report = await readFile(join(assets, `Math3D-${version}-windows-licenses.md`), 'utf8');
  requireCondition(report.startsWith(`# Math3D ${version} windows release inventory`) && report.includes('## Declared package licenses'),
    'Windows license inventory is invalid.');
  const filesInBom = new Map();
  for (const component of bom.components ?? []) {
    if (component.type !== 'file') continue;
    const name = component.name;
    const hash = component.hashes?.find(item => item.alg === 'SHA-256')?.content;
    requireCondition(typeof name === 'string' && !name.startsWith('/') && !name.split('/').includes('..') &&
      /^[0-9a-f]{64}$/.test(hash ?? '') && !filesInBom.has(name), `Invalid or duplicate SBOM file: ${name}`);
    requireCondition(component.properties?.some(item => item.name === 'math3d:owner' && item.value), `SBOM file lacks owner: ${name}`);
    filesInBom.set(name, hash);
  }
  const actual = new Map();
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const name = relative(unpacked, absolute).split(sep).join('/');
      if (entry.isDirectory()) { await walk(absolute); continue; }
      requireCondition(entry.isFile(), `Unpacked release contains unsupported entry: ${name}`);
      const info = await lstat(absolute);
      requireCondition(info.isFile() && !info.isSymbolicLink(), `Unpacked release entry is not a regular file: ${name}`);
      actual.set(name, digest(await readFile(absolute)));
    }
  }
  await walk(unpacked);
  requireCondition(actual.size === filesInBom.size && actual.size > 0, 'SBOM file coverage differs from unpacked app.');
  for (const [name, hash] of actual) requireCondition(filesInBom.get(name) === hash, `SBOM file mismatch: ${name}`);
  return { version, sourceCommit: candidate.commit, assetCount: files.length, unpackedFileCount: actual.size,
    installerSha256: listed.get(`Math3D-Setup-${version}.exe`), sbomSha256: listed.get(`Math3D-${version}-windows.cdx.json`) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { console.log(JSON.stringify(await verifyRelease20Assets(process.cwd(), process.argv[2] ?? '2.0.0', process.argv[3]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
