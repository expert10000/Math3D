#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function reviewMixedRouteMemory(receipt, budgets) {
  const limits = budgets.source?.longMemory;
  const checks = [];
  const check = (name, pass, observed) => checks.push({ name, pass: !!pass, observed });
  const cycles = receipt.cycles ?? [];
  const postGc = cycles.map(cycle => cycle.samples?.find(sample => sample.action === 101));
  const metric = name => postGc.map(sample => sample?.[name]);
  const span = values => values.length === 8 && values.every(Number.isFinite)
    ? Number((Math.max(...values.slice(4)) - Math.min(...values.slice(4))).toFixed(1)) : null;
  const late = name => span(metric(name));
  const allSamples = cycles.flatMap(cycle => cycle.samples ?? []);
  const peak = name => allSamples.length && allSamples.every(sample => Number.isFinite(sample[name]))
    ? Math.max(...allSamples.map(sample => sample[name])) : null;
  check('clean identified source build', receipt.build?.dirty === false && receipt.build?.version === '2.0.0'
    && !!receipt.build?.commit && !!receipt.build?.rendererHash && receipt.method?.host === 'source checkout', receipt.build);
  check('production renderer', receipt.method?.runtimeE2e === false, receipt.method?.runtimeE2e);
  check('800 mixed-route switches', receipt.status === 'smoke' && cycles.length === 8
    && JSON.stringify(receipt.method?.routeSequence) === JSON.stringify(['graphs', 'surfaces', 'mesh', 'volume', 'projects'])
    && cycles.every(cycle => cycle.actions === 100 && cycle.finishedAtMs > cycle.startedAtMs)
    && postGc.every(sample => sample?.action === 101), { status: receipt.status, cycles: cycles.length });
  check('no page errors or context losses', receipt.pageErrors?.length === 0
    && allSamples.every(sample => sample.contextLosses === 0), receipt.pageErrors);
  for (const [name, ceiling] of [
    ['rssMiB', limits?.peakRssMiB], ['rendererPrivateMiB', limits?.peakRendererPrivateMiB],
    ['gpuPrivateMiB', limits?.peakGpuPrivateMiB]
  ]) check(`${name} peak`, peak(name) !== null && peak(name) <= ceiling, { observed: peak(name), ceiling });
  for (const [name, ceiling] of [
    ['v8UsedMiB', limits?.v8PostGcLateSpanMiB],
    ['rendererPrivateMiB', limits?.rendererPrivateLateGrowthMiB],
    ['gpuPrivateMiB', limits?.gpuPrivateLateGrowthMiB]
  ]) check(`${name} post-GC plateau`, late(name) !== null && late(name) <= ceiling,
    { observed: late(name), ceiling, lastFour: metric(name).slice(4) });
  return { schema: 'math3d.release20.mixed-route-memory-review.v1',
    status: checks.every(item => item.pass) ? 'passed' : 'failed',
    build: receipt.build, routeSequence: receipt.method?.routeSequence,
    postGc: postGc.map(sample => sample && ({ rssMiB: sample.rssMiB,
      rendererPrivateMiB: sample.rendererPrivateMiB, gpuPrivateMiB: sample.gpuPrivateMiB,
      v8UsedMiB: sample.v8UsedMiB, domNodes: sample.domNodes })), checks };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [receiptArg, outputArg] = process.argv.slice(2);
  if (!receiptArg || !outputArg) throw new Error('Usage: check-release20-800-switch.mjs <receipt> <review>');
  const receipt = JSON.parse(readFileSync(resolve(receiptArg), 'utf8'));
  const budgets = JSON.parse(readFileSync(resolve('docs/releases/2.0.0/PERFORMANCE_BUDGETS.json'), 'utf8'));
  const review = reviewMixedRouteMemory(receipt, budgets);
  mkdirSync(dirname(resolve(outputArg)), { recursive: true });
  writeFileSync(resolve(outputArg), JSON.stringify(review, null, 2) + '\n');
  console.log(`${review.status}: 800-switch mixed route; ${review.checks.filter(item => !item.pass).map(item => item.name).join(', ') || 'all budgets met'}`);
  if (review.status !== 'passed') process.exitCode = 1;
}
