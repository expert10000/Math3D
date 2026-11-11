#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [assetsPath, freshPath, upgradePath, commit, installerHash, outputPath] = process.argv.slice(2);
if (!assetsPath || !freshPath || !upgradePath || !/^[0-9a-f]{40}$/.test(commit ?? '') ||
  !/^[0-9a-f]{64}$/.test(installerHash ?? '') || !outputPath)
  throw new Error('Usage: check-release20-qualification.mjs <assets> <fresh> <upgrade> <commit> <installer-sha256> <output>');
const read = path => JSON.parse(readFileSync(resolve(path), 'utf8').replace(/^\uFEFF/, ''));
const checks = [];
const check = (name, pass, actual) => checks.push({ name, pass: !!pass, actual });
try {
  const assets = read(assetsPath), fresh = read(freshPath), upgrade = read(upgradePath);
  check('uploaded asset integrity', assets.schema === 'math3d/release20-uploaded-assets/v1' && assets.status === 'passed' &&
    assets.sourceCommit === commit && assets.installerSha256 === installerHash, assets.status);
  check('fresh Windows installation', fresh.schema === 'math3d/release20-fresh-install/v1' && fresh.status === 'passed' &&
    fresh.sourceCommit === commit && fresh.installerSha256 === installerHash &&
    Object.values(fresh.checks ?? {}).every(value => value === 'passed') && Object.keys(fresh.checks ?? {}).length >= 7,
  fresh.status);
  check('1.7 upgrade and rollback', upgrade.schema === 'math3d/release20-upgrade/v1' && upgrade.status === 'passed' &&
    upgrade.candidateCommit === commit && upgrade.candidateInstallerSha256 === installerHash &&
    upgrade.oldInstallerSha256 === 'eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db' &&
    Object.values(upgrade.checks ?? {}).every(value => value === 'passed') && Object.keys(upgrade.checks ?? {}).length >= 9,
  upgrade.status);
  check('one signer', !!assets.signerThumbprint &&
    fresh.signerThumbprint?.toLowerCase() === assets.signerThumbprint &&
    upgrade.signerThumbprint?.toLowerCase() === assets.signerThumbprint,
  { assets: assets.signerThumbprint, fresh: fresh.signerThumbprint, upgrade: upgrade.signerThumbprint });
} catch (error) { check('receipts readable', false, error.message); }
const report = { schema: 'math3d/release20-installed-qualification/v1', sourceCommit: commit,
  installerSha256: installerHash, status: checks.every(item => item.pass) ? 'passed' : 'failed',
  scope: 'asset integrity, fresh installation, 1.7 upgrade and rollback; installed memory remains separate', checks };
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(resolve(outputPath), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (report.status !== 'passed') process.exitCode = 1;
