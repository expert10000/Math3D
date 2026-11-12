import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { freezeContracts, freezeLockfiles, verifyRelease20Freeze } from './verify-release20-freeze.mjs';
import { prepareRelease20Freeze } from './prepare-release20-freeze.mjs';

const root = await mkdtemp(join(tmpdir(), 'math3d-freeze20-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function write(path, value) { const target = join(root, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, value); }
const commit = 'a'.repeat(40);
try {
  const deps = { electron: '39.2.6', 'electron-builder': '26.0.12', 'better-sqlite3': '12.10.0' };
  await write('package.json', JSON.stringify({ version: '2.0.0', dependencies: deps }));
  await write('apps/desktop/package.json', JSON.stringify({ version: '2.0.0' }));
  await write('renderer/package.json', JSON.stringify({ version: '2.0.0' }));
  await write('package-lock.json', JSON.stringify({ version: '2.0.0', packages: {
    '': { version: '2.0.0' }, 'apps/desktop': { version: '2.0.0' }, ...Object.fromEntries(
      Object.entries(deps).map(([name, version]) => [`node_modules/${name}`, { version }])) } }));
  await write('renderer/package-lock.json', JSON.stringify({ version: '2.0.0', packages: { '': { version: '2.0.0' } } }));
  for (const path of freezeLockfiles.slice(2)) await write(path, `${path} pinned\n`);
  const native = { distributionStatus: 'source-bundle-integrated-not-bundled', windowsReferenceBuild: { cgal: '6.2' } };
  const publicSources = { sources: [{ name: 'CGAL', version: '6.2', sha256: 'b'.repeat(64), targets: ['windows', 'native-cgal'] },
    ...['GMP', 'MPFR'].map(name => ({ name, targets: ['windows', 'native-cgal'] }))] };
  await write('native/cgal-worker/dependency-manifest.json', JSON.stringify(native));
  await write('compliance/public-source-manifest.json', JSON.stringify(publicSources));
  const contracts = {};
  for (const [path, expected] of Object.entries(freezeContracts)) {
    const source = [expected.format ? `export const ${expected.format[0]} = "${expected.format[1]}" as const;` : '',
      `export const ${expected.version[0]} = ${expected.version[1]} as const;`].join('\n');
    await write(path, source);
    contracts[path] = { sha256: sha(source), format: expected.format?.[1] ?? null, schemaVersion: expected.version[1] };
  }
  const lockfiles = Object.fromEntries(await Promise.all(freezeLockfiles.map(async path => [path, sha(await readFile(join(root, path)))])));
  const manifest = { schema: 'math3d/release20-rc1-freeze/v1', status: 'frozen', version: '2.0.0',
    sourceCommit: commit, lockfiles, dependencies: deps, contracts,
    nativeSources: { dependencyManifestSha256: sha(JSON.stringify(native)), publicSourceManifestSha256: sha(JSON.stringify(publicSources)),
      distributionStatus: native.distributionStatus, windowsCgalVersion: '6.2', windowsCgalSourceSha256: 'b'.repeat(64) } };
  const manifestPath = join(root, 'freeze.json');
  await write('freeze.json', JSON.stringify(manifest));
  const args = { root, manifestPath, expectedCommit: commit };
  assert.equal((await verifyRelease20Freeze(args)).lockfiles, 4);
  assert.deepEqual(await prepareRelease20Freeze(root, commit), manifest);
  await write('native/cgal-worker/dependency-manifest.json', JSON.stringify({
    ...native, distributionStatus: 'blocked-pending-public-source-bundle-integration' }));
  await assert.rejects(verifyRelease20Freeze(args), /Pinned Windows native source inventory/);
  await write('native/cgal-worker/dependency-manifest.json', JSON.stringify(native));
  await write('python/worker/requirements.freeze.txt', 'drift\n');
  await assert.rejects(verifyRelease20Freeze(args), /Frozen bytes changed/);
  await write('python/worker/requirements.freeze.txt', 'python/worker/requirements.freeze.txt pinned\n');
  await write('renderer/package.json', JSON.stringify({ version: '1.7.0' }));
  await assert.rejects(verifyRelease20Freeze(args), /all identify 2.0.0/);
  console.log('RC1 freeze fixture accepts current native sources and rejects old status, lockfile drift and 1.7 identity.');
} finally { await rm(root, { recursive: true, force: true }); }
