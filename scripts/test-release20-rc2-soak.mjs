import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { soakChecks, soakMinutes } from './release20-rc2-soak.mjs';

assert.throws(() => soakMinutes('119'), /120/);
assert.throws(() => soakMinutes('120.5'), /whole/);
assert.throws(() => soakMinutes('1441'), /1440/);
assert.equal(soakMinutes('120'), 120);
assert.deepEqual(soakChecks.map(check => check.id),
  ['project-contracts', 'scientific-results', 'quantum-baseline', 'first-use-study', 'hard-exit-project', 'same-process-memory']);
assert(!soakChecks.some(check => /installer|dist:|publish/.test([check.id, check.command, ...check.args].join(' '))));
const plan = spawnSync(process.execPath, ['scripts/release20-rc2-soak.mjs', '--plan'], { encoding: 'utf8' });
assert.equal(plan.status, 0);
assert.equal(JSON.parse(plan.stdout).checks.length, soakChecks.length);
const current = JSON.parse((await import('node:fs')).readFileSync('package.json', 'utf8'));
if (current.version !== '2.0.0') {
  const refused = spawnSync(process.execPath,
    ['scripts/release20-rc2-soak.mjs', '--run', 'missing-freeze.json', '120', 'test-results/never-written-soak.json'],
    { encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /clean source checkout|ENOENT/);
}
console.log('RC2 source soak plan requires a two-hour minimum and an exact freeze manifest.');
