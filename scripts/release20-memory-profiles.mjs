#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = process.argv[2] && resolve(process.argv[2]);
if (!output) throw new Error('Usage: node scripts/release20-memory-profiles.mjs <summary.json>');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw new Error('Route profiles require a clean source checkout.');
const build = JSON.parse(readFileSync(resolve('dist/build-identity.json'), 'utf8'));
if (build.version !== '2.0.0' || build.commit !== commit || build.dirty || !build.rendererHash)
  throw new Error('Route profiles require a matching clean 2.0 build identity.');
mkdirSync(dirname(output), { recursive: true });

const profiles = [];
for (const route of ['mesh', 'volume', 'mixed']) {
  const receiptPath = resolve(dirname(output), `release20-memory-${route}.json`);
  const env = { ...process.env, MATH3D_MEMORY_SOAK_SMOKE: '1', MATH3D_MEMORY_SOAK_SMOKE_CYCLES: '3',
    MATH3D_MEMORY_SOAK_FORCE_GC: '1', MATH3D_MEMORY_SOAK_REPORT: receiptPath };
  if (route === 'mixed') delete env.MATH3D_MEMORY_SOAK_ROUTE;
  else env.MATH3D_MEMORY_SOAK_ROUTE = route;
  const run = spawnSync('npx', ['playwright', 'test', 'tests/e2e/release20-long-memory.spec.ts', '--reporter=list'],
    { shell: process.platform === 'win32', env, stdio: 'inherit', timeout: 30 * 60_000 });
  const bytes = readFileSync(receiptPath);
  const receipt = JSON.parse(bytes.toString('utf8'));
  if (run.status !== 0 || receipt.status !== 'smoke' || receipt.build?.commit !== commit ||
    receipt.method?.runtimeE2e !== false ||
    receipt.cycles?.length !== 3 || receipt.cycles.some(cycle => cycle.actions !== 100 ||
      !cycle.samples?.some(sample => sample.action === 101 && Number.isFinite(sample.v8UsedMiB))))
    throw new Error(`${route} profile did not complete on the identified build.`);
  profiles.push({ route, receipt: receiptPath, sha256: createHash('sha256').update(bytes).digest('hex'),
    postGc: receipt.cycles.map(cycle => {
      const sample = cycle.samples.find(row => row.action === 101);
      return { rssMiB: sample.rssMiB, rendererPrivateMiB: sample.rendererPrivateMiB,
        v8UsedMiB: sample.v8UsedMiB, gpuPrivateMiB: sample.gpuPrivateMiB, domNodes: sample.domNodes };
    }) });
}
writeFileSync(output, JSON.stringify({ schema: 'math3d.release20.memory-routes.v1', sourceCommit: commit,
  rendererHash: build.rendererHash, profiles }, null, 2) + '\n');
console.log(`Wrote identified production-mode route profiles: ${output}`);
