#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease20Assets } from './verify-release20-assets.mjs';
import { verifyRelease20Freeze } from './verify-release20-freeze.mjs';
import { verifyRelease20Gallery } from './verify-release20-gallery.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const insist = (condition, message) => { if (!condition) throw new Error(message); };
const requiredFresh = ['exactBytes', 'signature', 'cleanInstall', 'installedResources', 'workerWithoutPython', 'firstUseStudy', 'fourJourneys'];
const requiredUpgrade = ['exactBytes', 'signature', 'oldInstall', 'seed', 'profileBackup', 'inPlaceUpgrade', 'retainedBytesAndSetting'];
const requiredRecovery = ['project-contracts', 'scientific-results', 'quantum-baseline',
  'build-core', 'first-use-study', 'hard-exit-project'];
const releaseUrl = 'https://github.com/expert10000/Math3D/releases/download/v2.0.0/Math3D-Setup-2.0.0.exe';
const memoryLimitation = 'Long-running mixed Mesh and Volume use has not passed the memory budget.';
const failedMemoryReview = 'docs/releases/2.0.0/evidence/m3d20-long-memory-review-v2-79325f2d.json';

export function assertRelease20RehearsalIdentities({ candidate, freeze, freezeManifestSha256, fresh, upgrade, recovery, memory, assets, gallery, sourceCommit }) {
  const app = candidate.math3d;
  insist(['math3d/two-app-candidate/v1', 'math3d/release20-candidate/v1'].includes(candidate.schema) &&
    app?.version === '2.0.0' && app.channel === 'stable' && app.commit === sourceCommit &&
    app.installerName === 'Math3D-Setup-2.0.0.exe' && /^[0-9a-f]{64}$/.test(app.installerSha256 ?? ''),
  'Candidate does not identify this exact stable 2.0 checkout and installer.');
  insist(freeze.sourceCommit === sourceCommit, 'Freeze manifest source differs from candidate.');
  insist(assets.installerSha256 === app.installerSha256 && assets.assetCount >= 6 && assets.unpackedFileCount > 0,
    'Release asset integrity differs from candidate.');
  insist(fresh.schema === 'math3d/release20-fresh-install/v1' && fresh.status === 'passed' &&
    fresh.sourceCommit === sourceCommit && fresh.installerSha256 === app.installerSha256 &&
    requiredFresh.every(key => fresh.checks?.[key] === 'passed') &&
    fresh.journeys?.schema === 'math3d/release20-four-journeys/v1' && fresh.journeys.status === 'passed' &&
    fresh.journeys.sourceCommit === sourceCommit && fresh.journeys.installerSha256 === app.installerSha256 &&
    fresh.journeys.sage === 'passed' &&
    ['surface', 'quantum', 'casPolynomial', 'casIdeal', 'field'].every(key =>
      fresh.journeys.journeys?.[key] === 'passed') &&
    /^[0-9A-Fa-f]{40}$/.test(fresh.signerThumbprint ?? ''),
  'Fresh-install evidence is incomplete or has a different candidate.');
  insist(upgrade.schema === 'math3d/release20-upgrade/v1' && upgrade.status === 'passed' &&
    upgrade.oldVersion === '1.7.0' && upgrade.candidateVersion === '2.0.0' &&
    upgrade.oldInstallerSha256 === 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db' &&
    upgrade.candidateCommit === sourceCommit && upgrade.candidateInstallerSha256 === app.installerSha256 &&
    upgrade.signerThumbprint?.toLowerCase() === fresh.signerThumbprint.toLowerCase() &&
    requiredUpgrade.every(key => upgrade.checks?.[key] === 'passed') &&
    upgrade.checkpointSha256 === upgrade.checkpointSha256?.toLowerCase() &&
    /^[0-9a-f]{64}$/.test(upgrade.checkpointSha256 ?? ''),
  'Upgrade evidence is incomplete or has a different candidate.');
  insist(recovery.schema === 'math3d/release20-source-recovery/v1' && recovery.status === 'passed' &&
    recovery.sourceCommit === sourceCommit && recovery.freezeManifestSha256 === freezeManifestSha256 &&
    recovery.memoryQualification === 'deferred-to-2.5-or-later' &&
    recovery.build?.version === '2.0.0' && recovery.build.commit === sourceCommit &&
    recovery.build.dirty === false && !!recovery.build.rendererHash &&
    !Number.isNaN(Date.parse(recovery.finishedAtUtc)) &&
    Array.isArray(recovery.checks) && recovery.checks.length === requiredRecovery.length &&
    recovery.checks.every((check, index) => check.id === requiredRecovery[index] && check.status === 'passed'),
  'Source recovery evidence is incomplete or differs from the exact freeze.');
  insist(memory?.schema === 'math3d/release20-memory-deferral/v1' && memory.status === 'deferred' &&
    memory.sourceCommit === sourceCommit && memory.freezeManifestSha256 === freezeManifestSha256 &&
    memory.releaseVersion === '2.0.0' && memory.earliestVersion === '2.5.0' &&
    JSON.stringify(memory.unpassedChecks) === JSON.stringify(['800-switch', 'two-hour-source-memory', 'installed-memory']) &&
    memory.knownLimitation === memoryLimitation && Array.isArray(memory.failedEvidence) &&
    memory.failedEvidence.includes(failedMemoryReview),
  'RC2 memory deferral is incomplete or differs from the exact freeze.');
  insist(gallery.version === '2.0.0' && gallery.sourceCommit === sourceCommit &&
    gallery.installerSha256 === app.installerSha256 &&
    ['algebra', 'quantum', 'surface'].every(scenario => gallery.scenarios.includes(scenario)),
  'Gallery evidence differs from the exact candidate.');
  return { sourceCommit, installerSha256: app.installerSha256, releaseUrl,
    memoryGate: { status: 'deferred', earliestVersion: memory.earliestVersion, knownLimitation: memory.knownLimitation } };
}

export async function verifyRelease20SiteBundle({ siteDir, galleryDir }) {
  const files = (await readdir(siteDir)).filter(name => /\.(?:html|js)$/.test(name));
  insist(files.length > 0, 'Built public site has no HTML or JS.');
  const siteText = (await Promise.all(files.map(name => readFile(join(siteDir, name), 'utf8')))).join('\n');
  insist(siteText.includes(releaseUrl), 'Staged site lacks the exact 2.0 installer download link.');
  insist(!/current desktop download is 1\.7\.0|installed 2\.0 candidate has not passed/i.test(siteText),
    'Staged site still presents the 1.7 release or unqualified 2.0 copy.');
  const gallery = JSON.parse(await readFile(join(galleryDir, 'manifest.json'), 'utf8'));
  const staged = JSON.parse(await readFile(join(siteDir, 'assets/release-2.0.0/manifest.json'), 'utf8'));
  insist(sha(Buffer.from(JSON.stringify(staged))) === sha(Buffer.from(JSON.stringify(gallery))),
    'Staged gallery manifest differs from verified source.');
  for (const capture of gallery.captures) {
    const stagedBytes = await readFile(join(siteDir, 'assets/release-2.0.0', capture.file));
    insist(sha(stagedBytes) === capture.sha256, `Staged gallery image differs: ${capture.file}`);
  }
  return { releaseUrl, galleryCaptures: gallery.captures.length };
}

async function main() {
  const [mode, candidatePath, freezePath, freshPath, upgradePath, recoveryPath, memoryPath, galleryDir, siteDir, reportPath] = process.argv.slice(2);
  if (mode === '--plan') {
    console.log(JSON.stringify({ releaseUrl, requiredFresh, requiredUpgrade,
      inputs: ['candidate', 'freeze', 'fresh install', 'upgrade', 'source recovery', 'memory deferral', 'gallery', 'built site', 'release-assets'],
      memoryQualification: 'deferred-to-2.5-or-later' }, null, 2));
    return;
  }
  if (mode !== '--run' || ![candidatePath, freezePath, freshPath, upgradePath, recoveryPath, memoryPath, galleryDir, siteDir, reportPath].every(Boolean))
    throw new Error('Usage: node scripts/verify-release20-rc2-rehearsal.mjs --plan | --run <candidate> <freeze> <fresh> <upgrade> <source-recovery> <memory-deferral> <gallery-dir> <site-dir> <report-json>');
  const root = process.cwd(), sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const freezeBytes = await readFile(resolve(freezePath));
  await verifyRelease20Freeze({ root, manifestPath: resolve(freezePath), expectedCommit: sourceCommit });
  const candidate = JSON.parse(await readFile(resolve(candidatePath), 'utf8'));
  const fresh = JSON.parse(await readFile(resolve(freshPath), 'utf8'));
  const upgrade = JSON.parse(await readFile(resolve(upgradePath), 'utf8'));
  const recovery = JSON.parse(await readFile(resolve(recoveryPath), 'utf8'));
  const memory = JSON.parse(await readFile(resolve(memoryPath), 'utf8'));
  const assets = await verifyRelease20Assets(root);
  const installerPath = join(root, 'release-assets', candidate.math3d?.installerName ?? 'missing');
  insist(basename(installerPath) === 'Math3D-Setup-2.0.0.exe', 'Candidate installer filename is unexpected.');
  const gallery = await verifyRelease20Gallery({ candidatePath: resolve(candidatePath), installerPath,
    installEvidencePath: resolve(freshPath), galleryDir: resolve(galleryDir) });
  const result = assertRelease20RehearsalIdentities({ candidate, freeze: JSON.parse(freezeBytes),
    freezeManifestSha256: sha(freezeBytes), fresh, upgrade, recovery, memory, assets, gallery, sourceCommit });
  const site = await verifyRelease20SiteBundle({ siteDir: resolve(siteDir), galleryDir: resolve(galleryDir) });
  execFileSync(process.execPath, ['scripts/verify-public-license-compliance.mjs'], { cwd: root, stdio: 'inherit' });
  const report = { schema: 'math3d/release20-rc2-rehearsal/v2', status: 'passed',
    checkedAtUtc: new Date().toISOString(),
    sourceCommit, installerSha256: result.installerSha256, freezeManifestSha256: sha(freezeBytes),
    memoryQualification: 'deferred-to-2.5-or-later',
    assetCount: assets.assetCount, unpackedFileCount: assets.unpackedFileCount,
    galleryCaptures: site.galleryCaptures, stagedDownloadUrl: site.releaseUrl,
    evidenceSha256: Object.fromEntries(await Promise.all([
      ['candidate', candidatePath], ['freshInstall', freshPath], ['upgrade', upgradePath], ['sourceRecovery', recoveryPath], ['memoryDeferral', memoryPath],
      ['assetChecksums', join(root, 'release-assets/SHA256SUMS.txt')], ['galleryManifest', join(galleryDir, 'manifest.json')],
    ].map(async ([name, path]) => [name, sha(await readFile(resolve(path)))]))) };
  const destination = resolve(reportPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, reportPath: destination }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
