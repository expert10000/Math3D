#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease20Freeze } from './verify-release20-freeze.mjs';

export const recoveryChecks = Object.freeze([
  { id: 'project-contracts', command: 'npm', args: ['run', 'test:projects:contracts'] },
  { id: 'scientific-results', command: 'npm', args: ['run', 'test:scientific:golden'] },
  { id: 'quantum-baseline', command: 'npm', args: ['run', 'test:quantum:qwz-baseline'] },
  { id: 'build-core', command: 'npm', args: ['run', 'build:core'] },
  { id: 'first-use-study', command: 'npx', args: ['playwright', 'test', 'tests/e2e/release20-first-use-study.spec.ts', '--reporter=list'] },
  { id: 'hard-exit-project', command: 'npx', args: ['playwright', 'test', 'tests/e2e/project-hard-exit-recovery.spec.ts', '--reporter=list'] },
]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const commit = root => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const clean = root => !execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();

async function main() {
  const [mode, freezePath, evidencePath] = process.argv.slice(2);
  if (mode === '--plan') {
    console.log(JSON.stringify({ schema: 'math3d/release20-source-recovery/v1', checks: recoveryChecks,
      memoryQualification: 'deferred-to-2.5-or-later' }, null, 2));
    return;
  }
  if (mode !== '--run' || !freezePath || !evidencePath)
    throw new Error('Usage: node scripts/release20-source-recovery.mjs --plan | --run <freeze-manifest> <evidence-json>');
  if (process.env.MATH3D_PACKAGED_APP_EXE)
    throw new Error('Source recovery must not launch a packaged installer build.');
  const root = process.cwd(), sourceCommit = commit(root);
  if (!clean(root)) throw new Error('Source recovery requires a clean source checkout.');
  const freezeBytes = await readFile(resolve(freezePath));
  await verifyRelease20Freeze({ root, manifestPath: resolve(freezePath), expectedCommit: sourceCommit });
  const destination = resolve(evidencePath);
  const report = { schema: 'math3d/release20-source-recovery/v1', status: 'running', sourceCommit,
    freezeManifestSha256: sha(freezeBytes), startedAtUtc: new Date().toISOString(),
    memoryQualification: 'deferred-to-2.5-or-later', checks: [], failure: null };
  await mkdir(dirname(destination), { recursive: true });
  const save = () => writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  await save();
  try {
    for (const check of recoveryChecks) {
      if (commit(root) !== sourceCommit || !clean(root)) throw new Error('Source checkout changed during recovery qualification.');
      const started = Date.now();
      const result = spawnSync(check.command, check.args, { cwd: root, stdio: 'inherit',
        shell: process.platform === 'win32', timeout: 45 * 60_000,
        env: { ...process.env, MATH3D_RELEASE20_EXPECTED_VERSION: '2.0.0',
          MATH3D_RELEASE20_EXPECTED_COMMIT: sourceCommit } });
      const passed = result.status === 0 && !result.error && !result.signal;
      report.checks.push({ id: check.id, status: passed ? 'passed' : 'failed', exitCode: result.status,
        signal: result.signal ?? null, error: result.error?.message ?? null, durationMs: Date.now() - started });
      await save();
      if (!passed) throw new Error(`Source recovery check failed: ${check.id}`);
    }
    if (commit(root) !== sourceCommit || !clean(root)) throw new Error('Source checkout changed during recovery qualification.');
    const build = JSON.parse(await readFile(resolve(root, 'dist/build-identity.json'), 'utf8'));
    if (build.version !== '2.0.0' || build.commit !== sourceCommit || build.dirty || !build.rendererHash)
      throw new Error('Source recovery build identity differs from the frozen commit.');
    report.build = build;
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.failure = error.message; throw error; }
  finally { report.finishedAtUtc = new Date().toISOString(); await save(); }
  console.log(`Source recovery passed for ${sourceCommit}; ${report.checks.length} checks.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
