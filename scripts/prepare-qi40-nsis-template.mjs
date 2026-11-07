import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const templatePath = resolve(process.argv[2] ?? '');
const reportPath = resolve(process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3]) {
  throw new Error('Usage: node prepare-qi40-nsis-template.mjs TEMPLATE REPORT');
}

const packagePath = resolve(dirname(templatePath), '../..', 'package.json');
const packageInfo = JSON.parse(await readFile(packagePath, 'utf8'));
if (packageInfo.name !== 'app-builder-lib' || packageInfo.version !== '26.0.12') {
  throw new Error(`Unexpected NSIS template owner: ${packageInfo.name}@${packageInfo.version}`);
}

const original = await readFile(templatePath, 'utf8');
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const originalSha256 = sha256(original);
if (originalSha256 !== 'afa9046492317e72e79e022cdb1f42edba4687ea605300bfc01c002f3106201c') {
  throw new Error(`Unexpected multiUser.nsh bytes: ${originalSha256}`);
}

const stores = [...original.matchAll(/^([ \t]*)System::Store ([SL])\r?\n/gm)];
if (stores.length !== 2 || stores[0][2] !== 'S' || stores[1][2] !== 'L') {
  throw new Error('Expected exactly the per-user System::Store S/L pair');
}

// Isolate the faulting plug-in call while retaining the known-folder lookup.
const patched = original.replace(/^([ \t]*)System::Store [SL]\r?\n/gm, '');
await writeFile(templatePath, patched, 'utf8');
const report = {
  schema: 'math3d/qi40-nsis-template-variant/v1',
  variant: 'without-store',
  package: 'app-builder-lib@26.0.12',
  originalSha256,
  patchedSha256: sha256(patched),
  removedCalls: ['System::Store S', 'System::Store L'],
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report)}\n`);
