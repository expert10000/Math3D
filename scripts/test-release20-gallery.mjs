import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { verifyRelease20Gallery } from './verify-release20-gallery.mjs';

const root = await mkdtemp(join(tmpdir(), 'math3d-gallery20-'));
const galleryDir = join(root, 'gallery');
const candidatePath = join(root, 'candidate.json');
const installerPath = join(root, 'Math3D-Setup-2.0.0.exe');
const installEvidencePath = join(root, 'fresh.json');
const commit = 'a'.repeat(40), sourceHash = 'b'.repeat(64);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
try {
  await mkdir(galleryDir);
  await writeFile(installerPath, 'fixture installer');
  const installerSha256 = sha(await readFile(installerPath));
  await save(candidatePath, { schema: 'math3d/release20-candidate/v1', math3d: {
    version: '2.0.0', channel: 'stable', commit, installerName: 'Math3D-Setup-2.0.0.exe', installerSha256 } });
  await save(installEvidencePath, { schema: 'math3d/release20-fresh-install/v1', status: 'passed',
    sourceCommit: commit, installerSha256, checks: Object.fromEntries(
      ['exactBytes', 'signature', 'cleanInstall', 'installedResources', 'workerWithoutPython', 'firstUseStudy'].map(key => [key, 'passed'])) });
  const png = new PNG({ width: 1400, height: 900 });
  png.data.fill(255);
  const image = PNG.sync.write(png);
  const captures = [];
  for (const scenario of ['surface', 'quantum', 'algebra']) {
    const file = `${scenario}.png`, evidenceFile = `${scenario}.json`;
    await writeFile(join(galleryDir, file), image);
    const evidence = { schema: 'math3d/release20-scene-capture/v1', status: 'passed', scenario,
      appVersion: '2.0.0', sourceCommit: commit, installerSha256, sourceHash,
      checks: { sourceVerified: 'passed', installedUiCapture: 'passed' } };
    await save(join(galleryDir, evidenceFile), evidence);
    captures.push({ scenario, file, sha256: sha(image), evidenceFile,
      evidenceSha256: sha(await readFile(join(galleryDir, evidenceFile))), sourceHash });
  }
  const manifest = { schema: 'math3d/release20-gallery/v1', version: '2.0.0',
    sourceCommit: commit, installerSha256, captures };
  await save(join(galleryDir, 'manifest.json'), manifest);
  const args = { candidatePath, installerPath, installEvidencePath, galleryDir };
  assert.equal((await verifyRelease20Gallery(args)).captures, 3);
  await writeFile(join(galleryDir, 'quantum.png'), 'altered');
  await assert.rejects(verifyRelease20Gallery(args), /Screenshot hash failed/);
  await writeFile(join(galleryDir, 'quantum.png'), image);
  const evidence = JSON.parse(await readFile(join(galleryDir, 'algebra.json'), 'utf8'));
  evidence.checks.sourceVerified = 'failed';
  await save(join(galleryDir, 'algebra.json'), evidence);
  manifest.captures[2].evidenceSha256 = sha(await readFile(join(galleryDir, 'algebra.json')));
  await save(join(galleryDir, 'manifest.json'), manifest);
  await assert.rejects(verifyRelease20Gallery(args), /Scene evidence does not bind/);
  evidence.checks.sourceVerified = 'passed';
  await save(join(galleryDir, 'algebra.json'), evidence);
  manifest.captures[2].evidenceSha256 = sha(await readFile(join(galleryDir, 'algebra.json')));
  manifest.installerSha256 = 'c'.repeat(64);
  await save(join(galleryDir, 'manifest.json'), manifest);
  await assert.rejects(verifyRelease20Gallery(args), /Gallery manifest does not identify/);
  console.log('2.0 gallery gate binds three valid PNGs to installer, install, and scene evidence; altered inputs fail.');
} finally { await rm(root, { recursive: true, force: true }); }
