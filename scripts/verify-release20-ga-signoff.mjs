#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const insist = (ok, message) => { if (!ok) throw new Error(message); };

export function assertRelease20GaSignoff({ signoff, candidate, rc2, notes, sourceCommit,
  candidateManifestSha256, rc2ReportSha256, notesSha256 }) {
  const app = candidate.math3d;
  insist(['math3d/release20-candidate/v1', 'math3d/two-app-candidate/v1'].includes(candidate.schema) &&
    app?.version === '2.0.0' && app.channel === 'stable' && app.commit === sourceCommit &&
    app.installerName === 'Math3D-Setup-2.0.0.exe' && /^[0-9a-f]{64}$/.test(app.installerSha256 ?? ''),
  'Candidate does not identify the exact stable 2.0 source.');
  insist(rc2.schema === 'math3d/release20-rc2-rehearsal/v1' && rc2.status === 'passed' &&
    rc2.sourceCommit === sourceCommit && rc2.installerSha256 === app.installerSha256 &&
    /^[0-9a-f]{64}$/.test(rc2.freezeManifestSha256 ?? '') &&
    rc2.galleryCaptures >= 3 && rc2.assetCount >= 6 && rc2.unpackedFileCount > 0 &&
    rc2.stagedDownloadUrl === 'https://github.com/expert10000/Math3D/releases/download/v2.0.0/Math3D-Setup-2.0.0.exe',
  'RC2 rehearsal does not identify the same exact candidate.');
  insist(signoff.schema === 'math3d/release20-ga-signoff/v1' && signoff.status === 'approved' &&
    signoff.tag === 'v2.0.0' && signoff.sourceCommit === sourceCommit &&
    signoff.installerSha256 === app.installerSha256 &&
    signoff.candidateManifestSha256 === candidateManifestSha256 &&
    signoff.rc2ReportSha256 === rc2ReportSha256 && signoff.releaseNotesSha256 === notesSha256 &&
    Array.isArray(signoff.blockers) && signoff.blockers.length === 0 &&
    Array.isArray(signoff.knownLimitations) &&
    Array.isArray(signoff.publishedPlatforms) && signoff.publishedPlatforms.includes('windows') &&
    signoff.publishedPlatforms.every(platform => ['windows', 'linux'].includes(platform)) &&
    new Set(signoff.publishedPlatforms).size === signoff.publishedPlatforms.length &&
    typeof signoff.reviewer === 'string' && signoff.reviewer.trim().length > 0 &&
    !Number.isNaN(Date.parse(signoff.reviewedAtUtc)),
  'GA sign-off is missing review, has blockers, or differs from the candidate and RC2 evidence.');
  insist(notes.startsWith('# Math3D 2.0.0\n') &&
    ['## Changes', '## Compatibility', '## Known limitations', '## Migration', '## Release evidence']
      .every(heading => notes.includes(heading)) &&
    !/\b(?:TODO|TBD|PENDING)\b/i.test(notes),
  '2.0 release notes are incomplete or still contain draft markers.');
  return { tag: 'v2.0.0', sourceCommit, installerSha256: app.installerSha256,
    signoffStatus: 'approved', publishedPlatforms: signoff.publishedPlatforms,
    knownLimitations: signoff.knownLimitations.length };
}

export async function verifyRelease20GaSignoff({ root, signoffPath, candidatePath, rc2Path, notesPath, expectedCommit }) {
  const [signoffBytes, candidateBytes, rc2Bytes, notesBytes] = await Promise.all(
    [signoffPath, candidatePath, rc2Path, notesPath].map(path => readFile(resolve(path))));
  const sourceCommit = expectedCommit ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = assertRelease20GaSignoff({ signoff: JSON.parse(signoffBytes), candidate: JSON.parse(candidateBytes),
    rc2: JSON.parse(rc2Bytes), notes: notesBytes.toString('utf8'), sourceCommit,
    candidateManifestSha256: sha(candidateBytes), rc2ReportSha256: sha(rc2Bytes), notesSha256: sha(notesBytes) });
  return { ...result, signoffSha256: sha(signoffBytes), candidateManifestSha256: sha(candidateBytes),
    rc2ReportSha256: sha(rc2Bytes), releaseNotesSha256: sha(notesBytes) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [signoffPath, candidatePath, rc2Path, notesPath] = process.argv.slice(2);
  if (![signoffPath, candidatePath, rc2Path, notesPath].every(Boolean)) {
    console.error('Usage: node scripts/verify-release20-ga-signoff.mjs <signoff> <candidate> <rc2-report> <release-notes>');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await verifyRelease20GaSignoff({ root: process.cwd(), signoffPath,
      candidatePath, rc2Path, notesPath }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
