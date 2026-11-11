import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ProjectDurabilityStore } = require('../dist/main/projectDurability.js');
const root = mkdtempSync(join(tmpdir(), 'math3d-project-durability-'));
try {
  const store = new ProjectDurabilityStore(root), id = `math3d:project:${'a'.repeat(32)}`;
  const snapshot = { id, savedAt: 1234, activate: true,
    projectBytes: JSON.stringify({ format: 'math3d.project', identity: { id } }),
    libraryBytes: JSON.stringify({ format: 'math3d.project-library', version: 1, entries: [{ id, savedAt: 1234 }] }) };
  store.write(snapshot);
  assert.deepEqual(store.read(), [snapshot]);
  assert.throws(() => store.write({ ...snapshot, id: `math3d:project:${'b'.repeat(32)}` }), /differ/);
  assert.deepEqual(store.read(), [snapshot]);
  const file = join(root, 'project-checkpoints-v1', `${createHash('sha256').update(id).digest('hex')}.json`);
  const record = JSON.parse(readFileSync(file, 'utf8'));
  record.body.projectBytes = 'changed';
  writeFileSync(file, JSON.stringify(record));
  assert.throws(() => store.read(), /corrupt/);
  store.clearForTest();
  assert.deepEqual(readdirSync(join(root, 'project-checkpoints-v1')), []);
  console.log('Durable Project checkpoints retain exact bytes and reject mismatched identities and corruption.');
} finally { rmSync(root, { recursive: true, force: true }); }
