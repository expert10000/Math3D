#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [outputPath] = process.argv.slice(2);
if (!outputPath) throw new Error('Usage: release20-sage-oracle.mjs <receipt-path>');
const url = process.env.MATH3D_RELEASE20_SAGE_SERVICE_URL;
if (!url) throw new Error('MATH3D_RELEASE20_SAGE_SERVICE_URL is required for the installed journeys.');
const endpoint = new URL(url);
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
  !['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Invalid Sage service URL.');
if (endpoint.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))
  throw new Error('Remote Sage service must use HTTPS.');
const base = url.replace(/\/+$/, '');
const json = async (path, data) => {
  const response = await fetch(`${base}${path}`, { method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Sage ${path} returned HTTP ${response.status}.`);
  return response.json();
};
const health = await json('/health');
if (health.engine !== 'sagemath' || health.available !== true ||
  !/^10\.10(?:\.|$)/.test(health.engineVersion ?? '') ||
  !health.operations?.includes('sage.symbolic.singularities'))
  throw new Error('Sage service is not the supported live SageMath 10.10 singularity route.');
const run = async (label, equations) => {
  const response = await json('/run', { operation: 'sage.symbolic.singularities', backend: 'docker',
    jobId: `release20-${label}-${Date.now()}`, params: { equations, variables: ['x', 'y', 'z'] } });
  if (response.success !== true || response.engine !== 'sagemath' ||
    response.engineVersion !== health.engineVersion) throw new Error(`Live Sage ${label} oracle failed.`);
  return response.result;
};
const cusp = await run('cusp', ['y^2-x^3', 'z']);
const smooth = await run('smooth', ['y-x', 'z']);
const polynomial = async (label, expression) => {
  const response = await json('/run', { operation: 'sage.symbolic.singularities', backend: 'docker',
    jobId: `release20-polynomial-${label}-${Date.now()}`,
    params: { expression, variables: ['x', 'y'] } });
  if (response.success !== true || response.engine !== 'sagemath' ||
    response.engineVersion !== health.engineVersion) throw new Error(`Live Sage polynomial ${label} oracle failed.`);
  return response.result;
};
const polynomialCusp = await polynomial('cusp', 'y^2-x^3');
const polynomialSmooth = await polynomial('smooth', 'x^2+y^2-1');
if (JSON.stringify(cusp.points) !== JSON.stringify([{ x: '0', y: '0', z: '0' }]) ||
  cusp.dimension !== 1 || cusp.codimension !== 2 || !cusp.jacobianMinors?.length ||
  JSON.stringify(smooth.points) !== '[]' ||
  JSON.stringify(polynomialCusp.points) !== JSON.stringify([{ x: '0', y: '0' }]) ||
  polynomialCusp.criterion !== 'F=0 and gradient F=0' ||
  JSON.stringify(polynomialSmooth.points) !== '[]') throw new Error('Live Sage cusp/smooth oracle differs.');
const receipt = { schema: 'math3d/release20-sage-oracle/v1', status: 'passed',
  engine: health.engine, engineVersion: health.engineVersion, operation: 'sage.symbolic.singularities',
  cuspPoints: cusp.points, smoothPoints: smooth.points,
  polynomialCuspPoints: polynomialCusp.points, polynomialSmoothPoints: polynomialSmooth.points };
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(resolve(outputPath), JSON.stringify(receipt, null, 2) + '\n');
console.log(`Live SageMath ${health.engineVersion} ideal and polynomial cusp/smooth oracles passed.`);
