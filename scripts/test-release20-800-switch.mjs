import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewMixedRouteMemory } from './check-release20-800-switch.mjs';

const budgets = JSON.parse(readFileSync('docs/releases/2.0.0/PERFORMANCE_BUDGETS.json', 'utf8'));
const fixture = () => ({
  status: 'smoke', build: { dirty: false, version: '2.0.0', commit: 'abc', rendererHash: 'def' },
  method: { host: 'source checkout', runtimeE2e: false,
    routeSequence: ['graphs', 'surfaces', 'mesh', 'volume', 'projects'] }, pageErrors: [],
  cycles: Array.from({ length: 8 }, (_, index) => ({ actions: 100, startedAtMs: index * 1000,
    finishedAtMs: index * 1000 + 500, samples: [{ action: 101, rssMiB: 1000,
      rendererPrivateMiB: 300, gpuPrivateMiB: 300, v8UsedMiB: 50, domNodes: 400, contextLosses: 0 }] })),
});
assert.equal(reviewMixedRouteMemory(fixture(), budgets).status, 'passed');
const heapGrowth = fixture();
heapGrowth.cycles.forEach((cycle, index) => { cycle.samples[0].v8UsedMiB += index * 10; });
assert.equal(reviewMixedRouteMemory(heapGrowth, budgets).status, 'failed');
const gpuGrowth = fixture();
gpuGrowth.cycles.forEach((cycle, index) => { cycle.samples[0].gpuPrivateMiB += index * 20; });
assert.equal(reviewMixedRouteMemory(gpuGrowth, budgets).status, 'failed');
const wrongRoute = fixture();
wrongRoute.method.routeSequence = ['graphs', 'mesh'];
assert.equal(reviewMixedRouteMemory(wrongRoute, budgets).status, 'failed');
console.log('800-switch mixed-route checker fixtures passed');
