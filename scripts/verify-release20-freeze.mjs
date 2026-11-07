#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
export const freezeLockfiles = ['package-lock.json', 'renderer/package-lock.json',
  'python/worker/requirements.freeze.txt', 'python/worker/build-requirements.freeze.txt'];
export const freezeContracts = {
  'packages/core/src/math3dProject.ts': { format: ['MATH3D_PROJECT_FORMAT', 'math3d.project'], version: ['MATH3D_PROJECT_SCHEMA_VERSION', 1] },
  'packages/core/src/mixedWorkspace.ts': { format: ['MIXED_WORKSPACE_FORMAT', 'math3d.mixed-workspace'], version: ['MIXED_WORKSPACE_SCHEMA_VERSION', 1] },
  'packages/core/src/analysisResults.ts': { version: ['ANALYSIS_RESULT_SCHEMA_VERSION', 1] },
};
const dependencyNames = ['electron', 'electron-builder', 'better-sqlite3'];
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');

export async function verifyRelease20Freeze({ root, manifestPath, expectedCommit }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  requireValue(manifest.schema === 'math3d/release20-rc1-freeze/v1' && manifest.status === 'frozen' &&
    manifest.version === '2.0.0' && /^[0-9a-f]{40}$/.test(manifest.sourceCommit ?? '') &&
    manifest.sourceCommit === expectedCommit, 'RC1 freeze must identify the exact 2.0.0 source commit.');
  const app = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const renderer = JSON.parse(await readFile(join(root, 'renderer/package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  requireValue(app.version === '2.0.0' && renderer.version === '2.0.0' && lock.version === '2.0.0',
    'Root, renderer and lockfile must all identify 2.0.0.');
  requireValue(exactKeys(manifest.lockfiles, freezeLockfiles), 'Freeze lockfile inventory differs from the required set.');
  for (const path of freezeLockfiles) {
    requireValue(manifest.lockfiles[path] === sha(await readFile(join(root, path))), `Frozen bytes changed: ${path}`);
  }
  requireValue(exactKeys(manifest.dependencies, dependencyNames), 'Frozen dependency inventory is incomplete.');
  for (const name of dependencyNames) {
    const declared = app.dependencies?.[name] ?? app.devDependencies?.[name];
    const installed = lock.packages?.[`node_modules/${name}`]?.version;
    requireValue(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(declared ?? '') &&
      declared === installed && manifest.dependencies[name] === installed,
    `Dependency is not an exact frozen package: ${name}`);
  }
  requireValue(exactKeys(manifest.contracts, Object.keys(freezeContracts)), 'Frozen schema contract inventory differs from the required set.');
  for (const [path, expected] of Object.entries(freezeContracts)) {
    const bytes = await readFile(join(root, path));
    const source = bytes.toString('utf8');
    const record = manifest.contracts[path];
    requireValue(exactKeys(record, ['sha256', 'format', 'schemaVersion']) && record.sha256 === sha(bytes),
      `Frozen contract bytes changed: ${path}`);
    if (expected.format) {
      const [, format] = expected.format;
      requireValue(record.format === format && source.includes(`export const ${expected.format[0]} = "${format}" as const`),
        `Frozen format changed: ${path}`);
    } else requireValue(record.format === null, `Unexpected format declaration: ${path}`);
    requireValue(record.schemaVersion === expected.version[1] &&
      source.includes(`export const ${expected.version[0]} = ${expected.version[1]} as const`),
    `Frozen schema version changed: ${path}`);
  }
  return { sourceCommit: expectedCommit, version: '2.0.0', lockfiles: freezeLockfiles.length,
    contracts: Object.keys(freezeContracts).length, dependencies: dependencyNames.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const manifestPath = process.argv[2];
  if (!manifestPath) { console.error('Usage: node scripts/verify-release20-freeze.mjs <freeze-manifest>'); process.exitCode = 2; }
  else {
    try {
      const root = process.cwd();
      const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
      requireValue(!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
        'RC1 source checkout must be clean.');
      console.log(JSON.stringify(await verifyRelease20Freeze({ root, manifestPath, expectedCommit })));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
