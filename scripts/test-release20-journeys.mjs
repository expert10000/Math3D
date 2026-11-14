#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'math3d-installed-journeys-'));
try {
  const commit = 'a'.repeat(40), hash = 'b'.repeat(64);
  const reportPath = join(root, 'playwright.json'), sagePath = join(root, 'sage.json'), output = join(root, 'receipt.json');
  const names = ['project-surface-ridge-publication', 'quantum-qi08-study-handoff',
    'casLocusJourney', 'casDockerIdealJourney', 'project-field-flagship-journey'];
  const report = { stats: { unexpected: 0, skipped: 0 }, suites: names.map(name => ({
    specs: [{ file: `tests/e2e/${name}.spec.ts`, tests: [{ expectedStatus: 'passed',
      status: 'expected', results: [{ status: 'passed' }] }] }],
  })) };
  const sage = { schema: 'math3d/release20-sage-oracle/v1', status: 'passed',
    engine: 'sagemath', engineVersion: '10.10' };
  const save = () => { writeFileSync(reportPath, JSON.stringify(report)); writeFileSync(sagePath, JSON.stringify(sage)); };
  const run = () => spawnSync(process.execPath, ['scripts/check-release20-journeys.mjs',
    reportPath, sagePath, commit, hash, output], { encoding: 'utf8' });
  save(); assert.equal(run().status, 0);
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).status, 'passed');
  report.suites[4].specs[0].tests[0].results[0].status = 'skipped';
  save(); assert.equal(run().status, 1);
  report.suites[4].specs[0].tests[0].results[0].status = 'passed';
  sage.engineVersion = '9.5'; save(); assert.equal(run().status, 1);
  sage.engineVersion = '10.10'; report.suites.pop(); save(); assert.equal(run().status, 1);
  console.log('Installed journey receipt requires every selected test and live Sage 10.10.');
} finally { rmSync(root, { recursive: true, force: true }); }
