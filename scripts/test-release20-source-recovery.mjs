import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { recoveryChecks } from './release20-source-recovery.mjs';

assert.deepEqual(recoveryChecks.map(check => check.id),
  ['project-contracts', 'scientific-results', 'quantum-baseline', 'build-core',
    'first-use-study', 'hard-exit-project']);
const plan = spawnSync(process.execPath, ['scripts/release20-source-recovery.mjs', '--plan'], { encoding: 'utf8' });
assert.equal(plan.status, 0);
assert.equal(JSON.parse(plan.stdout).memoryQualification, 'deferred-to-2.5-or-later');
assert(!plan.stdout.includes('same-process-memory'));
const refused = spawnSync(process.execPath,
  ['scripts/release20-source-recovery.mjs', '--run', 'missing-freeze.json', 'test-results/never-written-recovery.json'],
  { encoding: 'utf8' });
assert.equal(refused.status, 1);
assert.match(refused.stderr, /clean source checkout|ENOENT/);
console.log('2.0 recovery gate retains hard-exit Project evidence and refuses missing freeze identity.');
