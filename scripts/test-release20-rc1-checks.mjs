import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertRelease20Source, rc1Checks } from './release20-rc1-checks.mjs';

assert.throws(() => assertRelease20Source({ version: '1.7.0' }, { version: '1.7.0' }), /2.0.0/);
assert.doesNotThrow(() => assertRelease20Source({ version: '2.0.0' }, { version: '2.0.0' }));
assert.deepEqual(rc1Checks.map(check => check.id), [
  'types', 'project-contracts', 'saved-result-goldens', 'quantum-baseline',
  'sage-gateway-unit', 'release-sbom', 'site-and-gallery', 'core-build',
  'renderer-build', 'kernel-acceptance', 'project-desktop', 'first-use-study',
]);
assert(!rc1Checks.some(check => /installer|dist:|publish/.test([check.id, check.command, ...check.args].join(' '))));
const plan = spawnSync(process.execPath, ['scripts/release20-rc1-checks.mjs', '--plan'], { encoding: 'utf8' });
assert.equal(plan.status, 0);
assert.equal(JSON.parse(plan.stdout).length, rc1Checks.length);
const current = JSON.parse((await import('node:fs')).readFileSync('package.json', 'utf8'));
if (current.version !== '2.0.0') {
  const refusal = spawnSync(process.execPath,
    ['scripts/release20-rc1-checks.mjs', '--run', 'missing-freeze.json', 'output/never-written-rc1.json'],
    { encoding: 'utf8' });
  assert.equal(refusal.status, 1);
  assert.match(refusal.stderr, /reviewed 2\.0\.0 source baseline/);
}
console.log('RC1 source plan covers required domains and refuses a 1.7 baseline without installer execution.');
