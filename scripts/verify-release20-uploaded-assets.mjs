#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { verifyRelease20Candidate } from './verify-release20-candidate.mjs';

const [rootArg, expectedCommit, expectedInstallerHash, expectedFreezeHash, outputArg] = process.argv.slice(2);
if (!rootArg || !/^[0-9a-f]{40}$/.test(expectedCommit ?? '') ||
    !/^[0-9a-f]{64}$/.test(expectedInstallerHash ?? '') ||
    !/^[0-9a-f]{64}$/.test(expectedFreezeHash ?? '') || !outputArg)
  throw new Error('Usage: verify-release20-uploaded-assets.mjs <candidate-root> <commit> <installer-sha256> <freeze-sha256> <receipt-json>');
const root = resolve(rootArg), assets = join(root, 'assets');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const insist = (ok, message) => { if (!ok) throw new Error(message); };
const names = (await readdir(assets, { withFileTypes: true }));
insist(names.every(entry => entry.isFile() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name)),
  'Uploaded asset directory must be flat and contain only regular files.');
const sums = (await readFile(join(assets, 'SHA256SUMS.txt'), 'utf8')).trimEnd().split(/\r?\n/);
const listed = new Map();
for (const line of sums) {
  const match = /^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(line);
  insist(match && !listed.has(match[2]) && match[2] !== 'SHA256SUMS.txt', 'Malformed or repeated uploaded checksum.');
  listed.set(match[2], match[1]);
}
const actualNames = names.map(entry => entry.name).filter(name => name !== 'SHA256SUMS.txt');
insist(actualNames.length === listed.size && actualNames.every(name => listed.has(name)),
  'Uploaded asset names differ from SHA256SUMS.');
for (const name of actualNames) insist(digest(await readFile(join(assets, name))) === listed.get(name), `Uploaded asset differs: ${name}`);
const installerName = 'Math3D-Setup-2.0.0.exe';
insist(listed.get(installerName) === expectedInstallerHash, 'Approved installer hash differs from uploaded assets.');
const rootInstaller = join(root, installerName), rootManifest = join(root, 'candidate-manifest.json');
const candidate = await verifyRelease20Candidate(rootManifest, rootInstaller);
insist(candidate.commit === expectedCommit && candidate.installerSha256 === expectedInstallerHash &&
  candidate.freezeManifestSha256 === expectedFreezeHash, 'Candidate identity differs from dispatch approval.');
insist(digest(await readFile(join(assets, 'candidate-manifest.json'))) === digest(await readFile(rootManifest)) &&
  digest(await readFile(join(assets, installerName))) === expectedInstallerHash,
  'Root and published candidate copies differ.');
const freezeBytes = await readFile(join(assets, 'freeze-manifest.json'));
const freeze = JSON.parse(freezeBytes.toString('utf8').replace(/^\uFEFF/, ''));
insist(digest(freezeBytes) === expectedFreezeHash && freeze.sourceCommit === expectedCommit &&
  freeze.version === '2.0.0' && freeze.status === 'frozen', 'Uploaded source freeze differs from approval.');
const signatures = JSON.parse((await readFile(join(assets, 'signatures.json'), 'utf8')).replace(/^\uFEFF/, ''));
const nsis = JSON.parse((await readFile(join(assets, 'nsis.json'), 'utf8')).replace(/^\uFEFF/, ''));
insist(signatures.schema === 'math3d/release20-signatures/v1' &&
  signatures.thumbprint?.toLowerCase() === candidate.signerThumbprint &&
  signatures.files?.some(file => file.sha256 === expectedInstallerHash) &&
  nsis.schema === 'math3d/release20-nsis/v1' && nsis.installerSha256 === expectedInstallerHash &&
  nsis.systemDllSha256 === candidate.nsisSystemDllSha256 && nsis.systemDllBytes === 30208,
  'Uploaded signature or pinned NSIS receipt differs from candidate.');
for (const name of ['SOURCE_MANIFEST-windows.json', 'Math3D-2.0.0-source.zip', 'Math3D-2.0.0-windows.cdx.json',
  'Math3D-2.0.0-windows-licenses.md', 'Math3D-2.0.0-LICENSE', 'Math3D-2.0.0-THIRD_PARTY_NOTICES.md',
  'Math3D-2.0.0-SOURCE_OFFER.md']) insist(listed.has(name), `Uploaded release evidence is missing: ${name}`);
const source = JSON.parse(await readFile(join(assets, 'SOURCE_MANIFEST-windows.json'), 'utf8'));
const bom = JSON.parse(await readFile(join(assets, 'Math3D-2.0.0-windows.cdx.json'), 'utf8'));
insist(source.math3d?.commit === expectedCommit && source.math3d?.version === '2.0.0' &&
  source.math3d?.sourceArchive === 'Math3D-2.0.0-source.zip' &&
  source.sources?.some(item => item.name === 'CGAL' && item.version === '6.2.1') &&
  bom.bomFormat === 'CycloneDX' && bom.metadata?.component?.version === '2.0.0' &&
  bom.components?.some(item => item.name === 'Math3D' && item.properties?.some(property =>
    property.name === 'math3d:sourceCommit' && property.value === expectedCommit)),
  'Uploaded source or SBOM identity differs from candidate.');
const receipt = { schema: 'math3d/release20-uploaded-assets/v1', status: 'passed', sourceCommit: expectedCommit,
  installerSha256: expectedInstallerHash, freezeManifestSha256: expectedFreezeHash,
  signerThumbprint: candidate.signerThumbprint, assetCount: actualNames.length,
  checks: ['sha256-coverage', 'root-asset-identity', 'candidate', 'freeze', 'signatures-receipt', 'nsis-receipt', 'source-inventory', 'sbom-identity'] };
const output = resolve(outputArg);
insist(basename(output) !== basename(rootInstaller), 'Receipt output must not replace the installer.');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
