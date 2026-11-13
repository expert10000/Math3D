#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { reviewMixedRouteMemory } from './check-release20-800-switch.mjs';

const receiptPath = resolve(process.env.MATH3D_MEMORY_800_REPORT || 'test-results/release20-memory-800.json');
const reviewPath = resolve(process.env.MATH3D_MEMORY_800_REVIEW || 'test-results/release20-memory-800-review.json');
const build = JSON.parse(readFileSync(resolve('dist/build-identity.json'), 'utf8'));
const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
if (head.status !== 0 || status.status !== 0 || status.stdout.trim() || build.dirty || build.commit !== head.stdout.trim())
  throw new Error('800-switch qualification requires the clean source commit matching the core build.');
const run = spawnSync('npx', ['playwright', 'test', 'tests/e2e/release20-long-memory.spec.ts', '--reporter=list'], {
  shell: process.platform === 'win32', stdio: 'inherit', timeout: 50 * 60_000,
  env: { ...process.env, MATH3D_MEMORY_SOAK_SMOKE: '1', MATH3D_MEMORY_SOAK_SMOKE_CYCLES: '8',
    MATH3D_MEMORY_SOAK_FORCE_GC: '1', MATH3D_MEMORY_SOAK_REPORT: receiptPath,
    MATH3D_RELEASE20_EXPECTED_COMMIT: build.commit },
});
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const budgets = JSON.parse(readFileSync(resolve('docs/releases/2.0.0/PERFORMANCE_BUDGETS.json'), 'utf8'));
const review = reviewMixedRouteMemory(receipt, budgets);
mkdirSync(dirname(reviewPath), { recursive: true });
writeFileSync(reviewPath, JSON.stringify(review, null, 2) + '\n');
console.log(`${review.status}: ${review.checks.filter(item => !item.pass).map(item => item.name).join(', ') || '800-switch mixed-route plateau'}`);
if (run.error || run.status !== 0 || review.status !== 'passed') process.exitCode = 1;
