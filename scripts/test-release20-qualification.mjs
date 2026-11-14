#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(os.tmpdir(), 'math3d-qualification-'));
try {
  const commit = 'a'.repeat(40), installer = 'b'.repeat(64), signer = 'c'.repeat(40);
  const files = ['assets.json', 'fresh.json', 'upgrade.json', 'report.json'].map(name => path.join(root, name));
  const asset = { schema: 'math3d/release20-uploaded-assets/v1', status: 'passed', sourceCommit: commit,
    installerSha256: installer, signerThumbprint: signer };
  const fresh = { schema: 'math3d/release20-fresh-install/v1', status: 'passed', sourceCommit: commit,
    installerSha256: installer, signerThumbprint: signer.toUpperCase(),
    checks: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`check${index}`, 'passed'])),
    journeys: { schema: 'math3d/release20-four-journeys/v1', status: 'passed',
      sourceCommit: commit, installerSha256: installer, sage: 'passed', sageVersion: '10.10',
      journeys: { surface: 'passed', quantum: 'passed', casPolynomial: 'passed',
        casIdeal: 'passed', field: 'passed' } } };
  const upgrade = { schema: 'math3d/release20-upgrade/v1', status: 'passed', candidateCommit: commit,
    candidateInstallerSha256: installer, signerThumbprint: signer,
    oldInstallerSha256: 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db',
    checks: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`check${index}`, 'passed'])) };
  const save = () => [asset, fresh, upgrade].forEach((value, index) => writeFileSync(files[index], JSON.stringify(value)));
  const run = () => spawnSync(process.execPath, ['scripts/check-release20-qualification.mjs',
    ...files.slice(0, 3), commit, installer, files[3]], { encoding: 'utf8' });
  save(); assert.equal(run().status, 0);
  assert.equal(JSON.parse(readFileSync(files[3], 'utf8')).status, 'passed');
  fresh.journeys.journeys.field = 'pending'; save(); assert.equal(run().status, 1);
  fresh.journeys.journeys.field = 'passed';
  fresh.journeys.installerSha256 = 'd'.repeat(64); save(); assert.equal(run().status, 1);
  fresh.journeys.installerSha256 = installer;
  upgrade.checks.check8 = 'pending'; save(); assert.equal(run().status, 1);
  upgrade.checks.check8 = 'passed'; asset.installerSha256 = 'd'.repeat(64); save(); assert.equal(run().status, 1);
  console.log('Exact candidate qualification requires matching installed, upgrade and asset receipts.');
} finally { rmSync(root, { recursive: true, force: true }); }
