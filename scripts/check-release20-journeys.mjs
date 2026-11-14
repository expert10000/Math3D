#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [reportPath, sagePath, commit, installerHash, outputPath] = process.argv.slice(2);
if (!reportPath || !sagePath || !/^[0-9a-f]{40}$/.test(commit ?? '') ||
  !/^[0-9a-f]{64}$/.test(installerHash ?? '') || !outputPath)
  throw new Error('Usage: check-release20-journeys.mjs <playwright-json> <sage-receipt> <commit> <installer-sha256> <output>');
const read = path => JSON.parse(readFileSync(resolve(path), 'utf8').replace(/^\uFEFF/, ''));
const expected = {
  surface: 'project-surface-ridge-publication.spec.ts',
  quantum: 'quantum-qi08-study-handoff.spec.ts',
  casPolynomial: 'casLocusJourney.spec.ts',
  casIdeal: 'casDockerIdealJourney.spec.ts',
  field: 'project-field-flagship-journey.spec.ts',
};
const receipt = { schema: 'math3d/release20-four-journeys/v1', status: 'failed',
  sourceCommit: commit, installerSha256: installerHash, journeys: {},
  sage: 'failed', failure: null };
try {
  const report = read(reportPath), sage = read(sagePath);
  if (sage.schema !== 'math3d/release20-sage-oracle/v1' || sage.status !== 'passed' ||
    sage.engine !== 'sagemath' || !/^10\.10(?:\.|$)/.test(sage.engineVersion ?? ''))
    throw new Error('Live Sage oracle receipt is missing or invalid.');
  receipt.sage = 'passed';
  receipt.sageVersion = sage.engineVersion;
  const specs = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) specs.push(spec);
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  if (specs.length !== Object.keys(expected).length || report.stats?.unexpected !== 0 ||
    report.stats?.skipped !== 0) throw new Error('Journey selection is incomplete or has unexpected/skipped tests.');
  for (const [journey, filename] of Object.entries(expected)) {
    const matches = specs.filter(spec => spec.file?.replace(/\\/g, '/').endsWith(`/${filename}`));
    if (matches.length !== 1 || matches[0].tests?.length !== 1) throw new Error(`Missing or duplicate ${journey} test.`);
    const test = matches[0].tests[0];
    if (test.expectedStatus !== 'passed' || test.status !== 'expected' ||
      test.results?.length !== 1 || test.results[0].status !== 'passed')
      throw new Error(`${journey} did not pass once against the installed candidate.`);
    receipt.journeys[journey] = 'passed';
  }
  receipt.status = 'passed';
} catch (error) { receipt.failure = error.message; }
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(resolve(outputPath), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
if (receipt.status !== 'passed') process.exitCode = 1;
