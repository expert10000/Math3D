#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const insist = (ok, message) => { if (!ok) throw new Error(message); };
const hex40 = value => /^[0-9a-f]{40}$/.test(value ?? '');
const hex64 = value => /^[0-9a-f]{64}$/.test(value ?? '');
const name = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);

export async function verifyRelease20Gallery({ candidatePath, installerPath, installEvidencePath, galleryDir }) {
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
  const app = candidate.math3d;
  insist(['math3d/two-app-candidate/v1', 'math3d/release20-candidate/v1'].includes(candidate.schema) &&
    app?.version === '2.0.0' && app.channel === 'stable' && hex40(app.commit) &&
    name(app.installerName) && hex64(app.installerSha256), 'Exact stable 2.0 candidate identity is required.');
  insist(basename(installerPath) === app.installerName && hash(await readFile(installerPath)) === app.installerSha256,
    'Installer bytes do not match candidate manifest.');
  const install = JSON.parse(await readFile(installEvidencePath, 'utf8'));
  insist(install.schema === 'math3d/release20-fresh-install/v1' && install.status === 'passed' &&
    install.sourceCommit === app.commit && install.installerSha256 === app.installerSha256 &&
    ['exactBytes', 'signature', 'cleanInstall', 'installedResources', 'workerWithoutPython', 'firstUseStudy']
      .every(key => install.checks?.[key] === 'passed'), 'Exact installed-app first-use evidence has not passed.');
  const manifest = JSON.parse(await readFile(join(galleryDir, 'manifest.json'), 'utf8'));
  insist(manifest.schema === 'math3d/release20-gallery/v1' && manifest.version === '2.0.0' &&
    manifest.sourceCommit === app.commit && manifest.installerSha256 === app.installerSha256 &&
    Array.isArray(manifest.captures) && manifest.captures.length >= 3,
  'Gallery manifest does not identify the exact installed candidate.');
  const scenarios = new Set(), files = new Set();
  for (const capture of manifest.captures) {
    insist(['surface', 'quantum', 'algebra'].includes(capture.scenario) &&
      name(capture.file) && capture.file.endsWith('.png') && !files.has(capture.file) &&
      name(capture.evidenceFile) && capture.evidenceFile.endsWith('.json') &&
      hex64(capture.sha256) && hex64(capture.evidenceSha256) && hex64(capture.sourceHash),
    'Invalid or duplicate gallery capture.');
    files.add(capture.file); scenarios.add(capture.scenario);
    const imagePath = join(galleryDir, capture.file);
    insist((await lstat(imagePath)).isFile(), `Screenshot is not a regular file: ${capture.file}`);
    const bytes = await readFile(imagePath);
    insist(hash(bytes) === capture.sha256, `Screenshot hash failed: ${capture.file}`);
    const png = PNG.sync.read(bytes);
    insist(png.width >= 1400 && png.height >= 900, `Screenshot dimensions failed: ${capture.file}`);
    insist((await lstat(join(galleryDir, capture.evidenceFile))).isFile(), `Scene evidence is not a regular file: ${capture.evidenceFile}`);
    const evidenceBytes = await readFile(join(galleryDir, capture.evidenceFile));
    insist(hash(evidenceBytes) === capture.evidenceSha256, `Scene evidence hash failed: ${capture.evidenceFile}`);
    const evidence = JSON.parse(evidenceBytes.toString('utf8'));
    insist(evidence.schema === 'math3d/release20-scene-capture/v1' && evidence.status === 'passed' &&
      evidence.scenario === capture.scenario && evidence.appVersion === '2.0.0' &&
      evidence.sourceCommit === app.commit && evidence.installerSha256 === app.installerSha256 &&
      evidence.sourceHash === capture.sourceHash && evidence.checks?.sourceVerified === 'passed' &&
      evidence.checks?.installedUiCapture === 'passed', `Scene evidence does not bind the installed capture: ${capture.evidenceFile}`);
  }
  insist(['surface', 'quantum', 'algebra'].every(scenario => scenarios.has(scenario)),
    'Surface, quantum, and algebra captures are all required.');
  return { version: '2.0.0', sourceCommit: app.commit, installerSha256: app.installerSha256,
    captures: manifest.captures.length, scenarios: [...scenarios].sort() };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [candidatePath, installerPath, installEvidencePath, galleryDir] = process.argv.slice(2);
  if (![candidatePath, installerPath, installEvidencePath, galleryDir].every(Boolean)) {
    console.error('Usage: node scripts/verify-release20-gallery.mjs <candidate-manifest> <installer> <fresh-install-evidence> <gallery-dir>');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await verifyRelease20Gallery({ candidatePath, installerPath, installEvidencePath, galleryDir }))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
