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
check('sampled peak agrees', peak !== null && peak === receipt.peakSampledRssMiB, { peak, reported: receipt.peakSampledRssMiB });
check('host class', receipt.method?.host === (modeArg === 'installed' ? 'installed candidate' : 'source checkout'), receipt.method?.host);
if (modeArg === 'source') {
  check('source RSS ceiling', peak !== null && peak <= budgets.source.navigationPeakRssMiB,
    { peak, limit: budgets.source.navigationPeakRssMiB });
} else {
  check('qualified installed budget', budget?.qualified === true, budget?.reason ?? budget?.qualified);
  check('exact candidate identity', !!budget?.packageSha256 && receipt.method?.packageSha256 === budget.packageSha256,
    receipt.method?.packageSha256);
  check('installed RSS ceiling', Number.isFinite(budget?.longMemoryPeakRssMiB) && peak <= budget.longMemoryPeakRssMiB,
    { peak, limit: budget?.longMemoryPeakRssMiB });
}
const late = samples.slice(Math.floor(samples.length * 0.8));
const preceding = samples.slice(Math.floor(samples.length * 0.6), Math.floor(samples.length * 0.8));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const lateGrowthMiB = late.length && preceding.length ? Number((mean(late) - mean(preceding)).toFixed(1)) : null;
const result = { schema: 'math3d.release20.long-memory-review.v1', mode: modeArg,
  status: checks.every(item => item.pass) ? 'observed' : 'failed',
  plateauQualified: false, // A budget and independent same-candidate review are still required.
  peakSampledRssMiB: peak, lateGrowthMiB, checks };
mkdirSync(dirname(resolve(outputArg)), { recursive: true });
writeFileSync(resolve(outputArg), JSON.stringify(result, null, 2) + '\n');
console.log(`${result.status}: peak ${peak} MiB, late growth ${lateGrowthMiB} MiB; plateau qualification pending review.`);
if (result.status === 'failed') process.exitCode = 1;
