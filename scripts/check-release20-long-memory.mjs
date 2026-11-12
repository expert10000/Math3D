#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [receiptArg, modeArg, outputArg] = process.argv.slice(2);
if (!receiptArg || !['source', 'installed'].includes(modeArg) || !outputArg)
  throw new Error('Usage: node scripts/check-release20-long-memory.mjs <receipt> <source|installed> <output>');
const receipt = JSON.parse(readFileSync(resolve(receiptArg), 'utf8'));
const budgets = JSON.parse(readFileSync(resolve('docs/releases/2.0.0/PERFORMANCE_BUDGETS.json'), 'utf8'));
const budget = budgets[modeArg];
const checks = [];
const check = (name, pass, observed) => checks.push({ name, pass: !!pass, observed });
check('receipt completed', receipt.schema === 'math3d.release20.long-memory.v1' && receipt.status === 'completed', receipt.status);
check('identified clean 2.0 build', receipt.build?.dirty === false && !!receipt.build?.commit && !!receipt.build?.rendererHash &&
  receipt.build?.version === '2.0.0', receipt.build);
check('two-hour elapsed duration', receipt.requestedMinutes >= 120 && receipt.elapsedMs >= 120 * 60_000,
  { requestedMinutes: receipt.requestedMinutes, elapsedMs: receipt.elapsedMs });
check('one app process and completed cycles', Number.isInteger(receipt.pid) && receipt.pid > 0 && receipt.cycles?.length >= 2 &&
  receipt.cycles.every(cycle => cycle.actions === 100 && cycle.finishedAtMs > cycle.startedAtMs &&
    cycle.samples?.length === 11 && cycle.samples.every(sample => Number.isFinite(sample.rssMiB) && sample.rssMiB > 0)),
  { pid: receipt.pid, cycles: receipt.cycles?.length });
check('no page errors', receipt.pageErrors?.length === 0, receipt.pageErrors);
const samples = receipt.cycles?.flatMap(cycle => cycle.samples.map(sample => sample.rssMiB)) ?? [];
const peak = samples.length ? Math.max(...samples) : null;
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const lateGrowth = values => {
  if (values.length < 10 || values.some(value => !Number.isFinite(value))) return null;
  const late = values.slice(Math.floor(values.length * 0.8));
  const preceding = values.slice(Math.floor(values.length * 0.6), Math.floor(values.length * 0.8));
  return late.length && preceding.length ? Number((mean(late) - mean(preceding)).toFixed(1)) : null;
};
const lateGrowthMiB = lateGrowth(samples);
const rendererPrivate = receipt.cycles?.flatMap(cycle => cycle.samples.map(sample => sample.rendererPrivateMiB)) ?? [];
const gpuPrivate = receipt.cycles?.flatMap(cycle => cycle.samples.map(sample => sample.gpuPrivateMiB)) ?? [];
const v8Used = receipt.cycles?.flatMap(cycle => cycle.samples.map(sample => sample.v8UsedMiB)) ?? [];
const peakRendererPrivateMiB = rendererPrivate.length && rendererPrivate.every(Number.isFinite) ? Math.max(...rendererPrivate) : null;
const peakGpuPrivateMiB = gpuPrivate.length && gpuPrivate.every(Number.isFinite) ? Math.max(...gpuPrivate) : null;
const peakV8UsedMiB = v8Used.length && v8Used.every(Number.isFinite) ? Math.max(...v8Used) : null;
const rendererPrivateLateGrowthMiB = lateGrowth(rendererPrivate);
const gpuPrivateLateGrowthMiB = lateGrowth(gpuPrivate);
const v8UsedLateGrowthMiB = lateGrowth(v8Used);
const contextLosses = receipt.cycles?.at(-1)?.samples?.at(-1)?.contextLosses;
const gpuPids = receipt.cycles?.flatMap(cycle => cycle.samples.map(sample => sample.gpuPid)) ?? [];
check('sampled peak agrees', peak !== null && peak === receipt.peakSampledRssMiB, { peak, reported: receipt.peakSampledRssMiB });
check('host class', receipt.method?.host === (modeArg === 'installed' ? 'installed candidate' : 'source checkout'), receipt.method?.host);
check('production runtime', receipt.method?.runtimeE2e === false, receipt.method?.runtimeE2e);
check('CDP V8 heap sample coverage', v8Used.length === samples.length && peakV8UsedMiB !== null &&
  v8Used.every(value => value > 0), { peakV8UsedMiB, v8UsedLateGrowthMiB });
check('GPU process and context health', gpuPids.length === samples.length && gpuPids.every(pid => Number.isInteger(pid) && pid > 0) &&
  new Set(gpuPids).size === 1 && contextLosses === 0, { gpuPids: [...new Set(gpuPids)], contextLosses });
if (modeArg === 'source') {
  const limits = budget?.longMemory;
  check('predeclared source long-run budget', !!limits && Object.values(limits).filter(value => typeof value === 'number').length === 6,
    limits ?? null);
  check('source peak RSS ceiling', peak !== null && peak <= limits?.peakRssMiB, { peak, limit: limits?.peakRssMiB });
  check('source late RSS plateau', lateGrowthMiB !== null && lateGrowthMiB <= limits?.lateGrowthMiB,
    { lateGrowthMiB, limit: limits?.lateGrowthMiB });
  check('source renderer private ceiling', peakRendererPrivateMiB !== null && peakRendererPrivateMiB <= limits?.peakRendererPrivateMiB,
    { peakRendererPrivateMiB, limit: limits?.peakRendererPrivateMiB });
  check('source renderer private plateau', rendererPrivateLateGrowthMiB !== null &&
    rendererPrivateLateGrowthMiB <= limits?.rendererPrivateLateGrowthMiB,
  { rendererPrivateLateGrowthMiB, limit: limits?.rendererPrivateLateGrowthMiB });
  check('source GPU private ceiling', peakGpuPrivateMiB !== null && peakGpuPrivateMiB <= limits?.peakGpuPrivateMiB,
    { peakGpuPrivateMiB, limit: limits?.peakGpuPrivateMiB });
  check('source GPU private plateau', gpuPrivateLateGrowthMiB !== null &&
    gpuPrivateLateGrowthMiB <= limits?.gpuPrivateLateGrowthMiB,
  { gpuPrivateLateGrowthMiB, limit: limits?.gpuPrivateLateGrowthMiB });
} else {
  check('qualified installed budget', budget?.qualified === true, budget?.reason ?? budget?.qualified);
  check('reviewed installed late-growth budget', budget?.reviewed === true, budget?.reviewed);
  check('exact candidate identity', !!budget?.packageSha256 && receipt.method?.packageSha256 === budget.packageSha256,
    receipt.method?.packageSha256);
  check('installed RSS ceiling', Number.isFinite(budget?.longMemoryPeakRssMiB) && peak <= budget.longMemoryPeakRssMiB,
    { peak, limit: budget?.longMemoryPeakRssMiB });
  check('installed late-growth ceiling', Number.isFinite(budget?.longMemoryLateGrowthMiB) &&
    lateGrowthMiB !== null && lateGrowthMiB <= budget.longMemoryLateGrowthMiB,
  { lateGrowthMiB, limit: budget?.longMemoryLateGrowthMiB });
}
const result = { schema: 'math3d.release20.long-memory-review.v1', mode: modeArg,
  status: checks.every(item => item.pass) ? 'passed' : 'failed',
  plateauQualified: checks.every(item => item.pass),
  peakSampledRssMiB: peak, lateGrowthMiB, peakRendererPrivateMiB, rendererPrivateLateGrowthMiB,
  peakGpuPrivateMiB, gpuPrivateLateGrowthMiB, peakV8UsedMiB, v8UsedLateGrowthMiB, checks };
mkdirSync(dirname(resolve(outputArg)), { recursive: true });
writeFileSync(resolve(outputArg), JSON.stringify(result, null, 2) + '\n');
console.log(`${result.status}: peak ${peak} MiB, late growth ${lateGrowthMiB} MiB; renderer private peak ${peakRendererPrivateMiB} MiB.`);
if (result.status === 'failed') process.exitCode = 1;
