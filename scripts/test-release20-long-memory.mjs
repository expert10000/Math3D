#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = mkdtempSync(path.join(os.tmpdir(), 'math3d-long-memory-'));
try {
  const input = path.join(directory, 'receipt.json'), output = path.join(directory, 'review.json');
  const cycle = start => ({ startedAtMs: start, finishedAtMs: start + 60_000, actions: 100,
    samples: Array.from({ length: 11 }, (_, index) => ({ action: index * 10, elapsedMs: start + index * 5000, rssMiB: 900 })) });
  const receipt = { schema: 'math3d.release20.long-memory.v1', status: 'completed',
    build: { version: '2.0.0', commit: 'a'.repeat(40), rendererHash: 'b'.repeat(64), dirty: false },
    method: { host: 'source checkout', packageSha256: null }, requestedMinutes: 120,
    elapsedMs: 120 * 60_000, pid: 123, cycles: [cycle(0), cycle(60_000)], pageErrors: [], peakSampledRssMiB: 900 };
  const run = mode => spawnSync(process.execPath, ['scripts/check-release20-long-memory.mjs', input, mode, output], { encoding: 'utf8' });
  writeFileSync(input, JSON.stringify(receipt));
  assert.equal(run('source').status, 0);
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).plateauQualified, false);
  for (const cycle of receipt.cycles) for (const sample of cycle.samples) sample.rssMiB = 1800;
  receipt.peakSampledRssMiB = 1800; writeFileSync(input, JSON.stringify(receipt));
  assert.equal(run('source').status, 0); // A fresh-run RSS ceiling is not a long-run budget.
  receipt.elapsedMs = 119 * 60_000; writeFileSync(input, JSON.stringify(receipt));
  assert.equal(run('source').status, 1);
  receipt.elapsedMs = 120 * 60_000; receipt.method.host = 'installed candidate'; writeFileSync(input, JSON.stringify(receipt));
  assert.equal(run('installed').status, 1);
  const installed = JSON.parse(readFileSync(output, 'utf8'));
  assert(installed.checks.some(check => check.name === 'qualified installed budget' && !check.pass));
  console.log('Long-memory review verifies two-hour source observations and refuses unqualified installed claims.');
} finally { rmSync(directory, { recursive: true, force: true }); }
