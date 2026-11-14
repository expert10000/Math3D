import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertRelease20RehearsalIdentities, verifyRelease20SiteBundle } from './verify-release20-rc2-rehearsal.mjs';

const commit = 'a'.repeat(40), installerSha256 = 'b'.repeat(64), freezeManifestSha256 = 'c'.repeat(64);
const passed = keys => Object.fromEntries(keys.map(key => [key, 'passed']));
const inputs = {
  sourceCommit: commit, freezeManifestSha256, freeze: { sourceCommit: commit },
  candidate: { schema: 'math3d/release20-candidate/v1', math3d: { version: '2.0.0', channel: 'stable',
    commit, installerName: 'Math3D-Setup-2.0.0.exe', installerSha256 } },
  assets: { installerSha256, assetCount: 6, unpackedFileCount: 4 },
  fresh: { schema: 'math3d/release20-fresh-install/v1', status: 'passed', sourceCommit: commit, installerSha256,
    signerThumbprint: 'd'.repeat(40), checks: passed(['exactBytes', 'signature', 'cleanInstall', 'installedResources', 'workerWithoutPython', 'firstUseStudy', 'fourJourneys']),
    journeys: { schema: 'math3d/release20-four-journeys/v1', status: 'passed', sourceCommit: commit,
      installerSha256, sage: 'passed', sageVersion: '10.10',
      journeys: passed(['surface', 'quantum', 'casPolynomial', 'casIdeal', 'field']) } },
  upgrade: { schema: 'math3d/release20-upgrade/v1', status: 'passed', oldVersion: '1.7.0', candidateVersion: '2.0.0',
    oldInstallerSha256: 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db',
    candidateCommit: commit, candidateInstallerSha256: installerSha256, signerThumbprint: 'd'.repeat(40),
    checkpointSha256: 'e'.repeat(64), checks: passed(['exactBytes', 'signature', 'oldInstall', 'seed', 'profileBackup', 'inPlaceUpgrade', 'retainedBytesAndSetting']) },
  soak: { schema: 'math3d/release20-rc2-source-soak/v1', status: 'passed', sourceCommit: commit,
    freezeManifestSha256, requestedMinutes: 120, elapsedMs: 7_200_000,
    cycles: [{ finishedAtUtc: '2026-11-07T12:00:00Z', checks:
      ['project-contracts', 'scientific-results', 'quantum-baseline', 'first-use-study'].map(id => ({ id, status: 'passed' })) }] },
  gallery: { version: '2.0.0', sourceCommit: commit, installerSha256, scenarios: ['algebra', 'quantum', 'surface'] },
};
assert.equal(assertRelease20RehearsalIdentities(inputs).installerSha256, installerSha256);
assert.throws(() => assertRelease20RehearsalIdentities({ ...inputs,
  upgrade: { ...inputs.upgrade, candidateInstallerSha256: 'f'.repeat(64) } }), /Upgrade evidence/);
assert.throws(() => assertRelease20RehearsalIdentities({ ...inputs,
  soak: { ...inputs.soak, elapsedMs: 7_199_999 } }), /requested duration/);
assert.throws(() => assertRelease20RehearsalIdentities({ ...inputs,
  assets: { ...inputs.assets, installerSha256: 'f'.repeat(64) } }), /asset integrity/);
const plan = spawnSync(process.execPath, ['scripts/verify-release20-rc2-rehearsal.mjs', '--plan'], { encoding: 'utf8' });
assert.equal(plan.status, 0);
assert.match(plan.stdout, /Math3D-Setup-2\.0\.0\.exe/);

const root = await mkdtemp(join(tmpdir(), 'math3d-rc2-site-'));
try {
  const galleryDir = join(root, 'gallery'), siteDir = join(root, 'site');
  const stagedDir = join(siteDir, 'assets/release-2.0.0');
  await mkdir(galleryDir); await mkdir(stagedDir, { recursive: true });
  const bytes = Buffer.from('image fixture');
  const manifest = { captures: [{ file: 'surface.png', sha256: createHash('sha256').update(bytes).digest('hex') }] };
  await writeFile(join(galleryDir, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(stagedDir, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(stagedDir, 'surface.png'), bytes);
  await writeFile(join(siteDir, 'index.html'), '<a href="https://github.com/expert10000/Math3D/releases/download/v2.0.0/Math3D-Setup-2.0.0.exe">Download</a>');
  assert.equal((await verifyRelease20SiteBundle({ siteDir, galleryDir })).galleryCaptures, 1);
  await writeFile(join(stagedDir, 'surface.png'), 'tampered');
  await assert.rejects(verifyRelease20SiteBundle({ siteDir, galleryDir }), /Staged gallery image differs/);
  await writeFile(join(stagedDir, 'surface.png'), bytes);
  await writeFile(join(siteDir, 'index.html'), '<a href="/releases">Download</a>');
  await assert.rejects(verifyRelease20SiteBundle({ siteDir, galleryDir }), /exact 2.0 installer download link/);
} finally { await rm(root, { recursive: true, force: true }); }
console.log('RC2 rehearsal rejects mixed candidate receipts, short soaks, altered staged images, and missing download links.');
