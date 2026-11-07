import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertLegacyReleaseTag } from './legacy-release-tag-policy.mjs';

assert.equal(assertLegacyReleaseTag('v1.7.0'), 'v1.7.0');
assert.throws(() => assertLegacyReleaseTag('v2.0.0'), /dedicated exact-candidate/);
assert.throws(() => assertLegacyReleaseTag('2.0.0'), /v-prefixed/);
const run = tag => spawnSync(process.execPath, ['scripts/legacy-release-tag-policy.mjs', tag], { encoding: 'utf8' });
assert.equal(run('v1.7.0').status, 0);
assert.equal(run('v2.0.0').status, 1);
const build = readFileSync('.github/workflows/release.yml', 'utf8');
const publish = readFileSync('.github/workflows/publish-verified-release.yml', 'utf8');
assert.match(build, /release-tag-policy:[\s\S]*?node scripts\/legacy-release-tag-policy\.mjs/);
assert.match(build, /mobile-release-gate:\s*\n\s*needs: release-tag-policy/);
assert.match(publish, /node scripts\/legacy-release-tag-policy\.mjs/);
console.log('Legacy workflows refuse v2.0.0 before build or publish while retaining v1.7.0.');
