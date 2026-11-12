#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease20Freeze } from './verify-release20-freeze.mjs';

export const rc1Checks = Object.freeze([
  { id: 'types', command: 'npm', args: ['run', 'typecheck:noemit'] },
  { id: 'project-contracts', command: 'npm', args: ['run', 'test:projects:contracts'] },
  { id: 'saved-result-goldens', command: 'npm', args: ['run', 'test:scientific:golden'] },
  { id: 'quantum-baseline', command: 'npm', args: ['run', 'test:quantum:qwz-baseline'] },
  { id: 'sage-gateway-unit', command: 'npm', args: ['run', 'test:sage:gateway:unit'] },
  { id: 'release-sbom', command: 'npm', args: ['run', 'test:release:sbom'] },
  { id: 'site-and-gallery', command: 'npm', args: ['--prefix', 'apps/public-site', 'run', 'build'] },
  { id: 'core-build', command: 'npm', args: ['run', 'build:core'] },
  { id: 'renderer-build', command: 'npm', args: ['run', 'build:renderer'] },
  { id: 'flagship-source', command: 'node', args: ['scripts/release20-flagship-journeys.mjs', '--run', 'output/release20-rc1-flagship-source.json'] },
  { id: 'kernel-acceptance', command: 'npm', args: ['run', 'test:kernel:gk20'] },
  { id: 'mobile-study-preview', command: 'npx', args: ['vitest', 'run', 'tests/unit/mobileProjectExplorer.test.ts'] },
  { id: 'project-desktop', command: 'npm', args: ['run', 'test:projects:desktop'] },
  { id: 'first-use-study', command: 'npx', args: ['playwright', 'test', 'tests/e2e/release20-first-use-study.spec.ts', '--reporter=list'] },
  { id: 'field-study-desktop', command: 'npx', args: ['playwright', 'test', 'tests/e2e/project-study-field-explorer.spec.ts', '--reporter=list'] },
]);
export function assertRelease20Source(app, renderer) {
  if (app.version !== '2.0.0' || renderer.version !== '2.0.0')
    throw new Error('RC1 acceptance requires the reviewed 2.0.0 source baseline.');
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function main() {
  const [mode, freezePath, outputPath] = process.argv.slice(2);
  if (mode === '--plan') { console.log(JSON.stringify(rc1Checks, null, 2)); return; }
  if (mode !== '--run' || !freezePath || !outputPath) {
    throw new Error('Usage: node scripts/release20-rc1-checks.mjs --plan | --run <freeze-manifest> <evidence-json>');
  }
  const root = process.cwd();
  const app = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const renderer = JSON.parse(await readFile(resolve(root, 'renderer/package.json'), 'utf8'));
  assertRelease20Source(app, renderer);
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
    throw new Error('RC1 acceptance requires a clean source checkout.');
  const freezeBytes = await readFile(resolve(freezePath));
  await verifyRelease20Freeze({ root, manifestPath: resolve(freezePath), expectedCommit: sourceCommit });
  const report = { schema: 'math3d/release20-rc1-source-acceptance/v1', status: 'running',
    version: '2.0.0', sourceCommit, freezeManifestSha256: sha(freezeBytes),
    startedAtUtc: new Date().toISOString(), checks: [] };
  const destination = resolve(outputPath);
  await mkdir(dirname(destination), { recursive: true });
  const save = () => writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  await save();
  for (const check of rc1Checks) {
    const start = Date.now();
    const result = spawnSync(check.command, check.args, { cwd: root, stdio: 'inherit',
      shell: process.platform === 'win32', timeout: 45 * 60 * 1000 });
    report.checks.push({ id: check.id, command: [check.command, ...check.args],
      status: result.status === 0 && !result.error ? 'passed' : 'failed',
      exitCode: result.status, durationMs: Date.now() - start,
      error: result.error?.message ?? null });
    await save();
    if (result.status !== 0 || result.error) {
      report.status = 'failed'; report.finishedAtUtc = new Date().toISOString(); await save();
      throw new Error(`RC1 check failed: ${check.id}`);
    }
  }
  report.status = 'passed'; report.finishedAtUtc = new Date().toISOString(); await save();
  console.log(`RC1 source acceptance passed for ${sourceCommit}; evidence: ${destination}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
