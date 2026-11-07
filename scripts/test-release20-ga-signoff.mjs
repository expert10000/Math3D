import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease20GaSignoff } from './verify-release20-ga-signoff.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = await mkdtemp(join(tmpdir(), 'math3d-ga-signoff-'));
try {
  const sourceCommit = 'a'.repeat(40), installerSha256 = 'b'.repeat(64);
  const candidatePath = join(root, 'candidate.json'), rc2Path = join(root, 'rc2.json');
  const notesPath = join(root, 'notes.md'), signoffPath = join(root, 'signoff.json');
  const candidateBytes = Buffer.from(JSON.stringify({ schema: 'math3d/release20-candidate/v1',
    math3d: { version: '2.0.0', channel: 'stable', commit: sourceCommit,
      installerName: 'Math3D-Setup-2.0.0.exe', installerSha256 } }));
  const rc2Bytes = Buffer.from(JSON.stringify({ schema: 'math3d/release20-rc2-rehearsal/v1', status: 'passed',
    sourceCommit, installerSha256, freezeManifestSha256: 'c'.repeat(64), galleryCaptures: 3,
    assetCount: 6, unpackedFileCount: 4,
    stagedDownloadUrl: 'https://github.com/expert10000/Math3D/releases/download/v2.0.0/Math3D-Setup-2.0.0.exe' }));
  const notesBytes = Buffer.from('# Math3D 2.0.0\n\n## Changes\nA\n## Compatibility\nB\n## Known limitations\nC\n## Migration\nD\n## Release evidence\nE\n');
  const signoff = { schema: 'math3d/release20-ga-signoff/v1', status: 'approved', tag: 'v2.0.0',
    sourceCommit, installerSha256, candidateManifestSha256: sha(candidateBytes),
    rc2ReportSha256: sha(rc2Bytes), releaseNotesSha256: sha(notesBytes),
    reviewer: 'reviewer@example.invalid', reviewedAtUtc: '2026-11-07T13:00:00Z',
    blockers: [], knownLimitations: ['Hosted browser remains unqualified'], publishedPlatforms: ['windows'] };
  await writeFile(candidatePath, candidateBytes); await writeFile(rc2Path, rc2Bytes);
  await writeFile(notesPath, notesBytes); await writeFile(signoffPath, JSON.stringify(signoff));
  const args = { root, signoffPath, candidatePath, rc2Path, notesPath, expectedCommit: sourceCommit };
  assert.equal((await verifyRelease20GaSignoff(args)).signoffStatus, 'approved');
  await writeFile(notesPath, Buffer.concat([notesBytes, Buffer.from('changed\n')]));
  await assert.rejects(verifyRelease20GaSignoff(args), /GA sign-off/);
  await writeFile(notesPath, notesBytes);
  signoff.blockers.push('Unresolved Project loss');
  await writeFile(signoffPath, JSON.stringify(signoff));
  await assert.rejects(verifyRelease20GaSignoff(args), /GA sign-off/);
  signoff.blockers = [];
  signoff.installerSha256 = 'd'.repeat(64);
  await writeFile(signoffPath, JSON.stringify(signoff));
  await assert.rejects(verifyRelease20GaSignoff(args), /GA sign-off/);
  console.log('GA sign-off binds exact candidate, RC2 report, notes, reviewer and zero blockers.');
} finally { await rm(root, { recursive: true, force: true }); }
