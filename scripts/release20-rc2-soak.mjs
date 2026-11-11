#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease20Freeze } from './verify-release20-freeze.mjs';

export const soakChecks = Object.freeze([
  { id: 'project-contracts', command: 'npm', args: ['run', 'test:projects:contracts'] },
  { id: 'scientific-results', command: 'npm', args: ['run', 'test:scientific:golden'] },
  { id: 'quantum-baseline', command: 'npm', args: ['run', 'test:quantum:qwz-baseline'] },
  { id: 'restore-build-identity', command: 'node', args: ['scripts/write-build-identity.mjs'] },
  { id: 'first-use-study', command: 'npx', args: ['playwright', 'test', 'tests/e2e/release20-first-use-study.spec.ts', '--reporter=list'] },
  { id: 'hard-exit-project', command: 'npx', args: ['playwright', 'test', 'tests/e2e/project-hard-exit-recovery.spec.ts', '--reporter=list'] },
  { id: 'same-process-memory', command: 'npx', args: ['playwright', 'test', 'tests/e2e/release20-long-memory.spec.ts', '--reporter=list'] },
]);
export const soakMinutes = value => {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 120 || minutes > 24 * 60)
    throw new Error('RC2 reliability soak must run for 120 to 1440 whole minutes.');
  return minutes;
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const commit = root => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const clean = root => !execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();

async function main() {
  const [mode, freezePath, minutesArg, evidencePath] = process.argv.slice(2);
  if (mode === '--plan') { console.log(JSON.stringify({ minimumMinutes: 120, checks: soakChecks }, null, 2)); return; }
  if (mode !== '--run' || !freezePath || !minutesArg || !evidencePath)
    throw new Error('Usage: node scripts/release20-rc2-soak.mjs --plan | --run <freeze-manifest> <minutes> <evidence-json>');
  if (process.env.MATH3D_PACKAGED_APP_EXE)
    throw new Error('The RC2 source soak must not launch a packaged installer build.');
  const minutes = soakMinutes(minutesArg), root = process.cwd(), sourceCommit = commit(root);
  if (!clean(root)) throw new Error('RC2 soak requires a clean source checkout.');
  const freezeBytes = await readFile(resolve(freezePath));
  await verifyRelease20Freeze({ root, manifestPath: resolve(freezePath), expectedCommit: sourceCommit });
  const destination = resolve(evidencePath), started = Date.now(), deadline = started + minutes * 60_000;
  const memoryReceipt = resolve(dirname(destination), 'release20-long-memory.json');
  const memoryReview = resolve(dirname(destination), 'release20-long-memory-review.json');
  const report = { schema: 'math3d/release20-rc2-source-soak/v1', status: 'running', sourceCommit,
    freezeManifestSha256: sha(freezeBytes), requestedMinutes: minutes, startedAtUtc: new Date(started).toISOString(),
    cycles: [], failure: null };
  await mkdir(dirname(destination), { recursive: true });
  const save = () => writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  await save();
  try {
    // Every cycle completes the full representative set, including the cycle crossing the deadline.
    do {
      if (commit(root) !== sourceCommit || !clean(root)) throw new Error('Source checkout changed during the soak.');
      const cycle = { startedAtUtc: new Date().toISOString(), checks: [] };
      report.cycles.push(cycle); await save();
      for (const check of soakChecks) {
        const checkStart = Date.now();
        const result = spawnSync(check.command, check.args, { cwd: root, stdio: 'inherit',
          shell: process.platform === 'win32', timeout: check.id === 'same-process-memory' ? (minutes + 45) * 60_000 : 45 * 60_000,
          env: { ...process.env, MATH3D_RELEASE20_EXPECTED_VERSION: '2.0.0', MATH3D_RELEASE20_EXPECTED_COMMIT: sourceCommit,
            ...(check.id === 'same-process-memory' ? { MATH3D_MEMORY_SOAK_MINUTES: String(minutes),
              MATH3D_MEMORY_SOAK_REPORT: memoryReceipt } : {}) } });
        const passed = result.status === 0 && !result.error && !result.signal;
        cycle.checks.push({ id: check.id, status: passed ? 'passed' : 'failed', exitCode: result.status,
          signal: result.signal ?? null, error: result.error?.message ?? null, durationMs: Date.now() - checkStart });
        await save();
        if (!passed) throw new Error(`RC2 soak check failed: ${check.id}`);
        if (check.id === 'same-process-memory') {
          const memory = JSON.parse(await readFile(memoryReceipt, 'utf8'));
          if (memory.status !== 'completed' || memory.build?.commit !== sourceCommit || memory.elapsedMs < 120 * 60_000 ||
              memory.cycles?.length < 2 || memory.pageErrors?.length)
            throw new Error('Same-process memory receipt is incomplete or differs from the frozen source.');
          const reviewed = spawnSync('node', ['scripts/check-release20-long-memory.mjs', memoryReceipt, 'source', memoryReview],
            { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
          if (reviewed.status !== 0) throw new Error('Same-process memory observation is incomplete or invalid.');
          cycle.memory = { receipt: memoryReceipt, cycles: memory.cycles.length,
            peakSampledRssMiB: memory.peakSampledRssMiB, elapsedMs: memory.elapsedMs,
            review: memoryReview, plateauQualified: false };
          await save();
        }
      }
      cycle.finishedAtUtc = new Date().toISOString(); await save();
    } while (Date.now() < deadline);
    if (commit(root) !== sourceCommit || !clean(root)) throw new Error('Source checkout changed during the soak.');
    report.status = 'passed';
  } catch (error) { report.status = 'failed'; report.failure = error.message; throw error; }
  finally { report.finishedAtUtc = new Date().toISOString(); report.elapsedMs = Date.now() - started; await save(); }
  console.log(`RC2 source soak passed for ${sourceCommit}; ${report.cycles.length} complete cycles in ${report.elapsedMs} ms.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
