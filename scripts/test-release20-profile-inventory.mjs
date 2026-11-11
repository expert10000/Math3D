import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inventoryRelease20Profile } from './release20-profile-inventory.mjs';

const root = await mkdtemp(join(tmpdir(), 'math3d-profile-inventory-'));
try {
  const original = join(root, 'original'), backup = join(root, 'backup');
  for (const path of [original, backup]) {
    await mkdir(join(path, 'user-data'), { recursive: true });
    await writeFile(join(path, 'user-data', 'project.json'), '{"revision":1}\n');
    await writeFile(join(path, 'settings.json'), '{"preview":false}\n');
  }
  const first = await inventoryRelease20Profile(original);
  assert.equal(first.digest, (await inventoryRelease20Profile(backup)).digest);
  await writeFile(join(backup, 'settings.json'), '{"preview":true}\n');
  assert.notEqual(first.digest, (await inventoryRelease20Profile(backup)).digest);
  await writeFile(join(backup, 'settings.json'), '{"preview":false}\n');
  await writeFile(join(backup, 'user-data', 'extra.json'), '{}');
  assert.notEqual(first.digest, (await inventoryRelease20Profile(backup)).digest);
  await rm(join(backup, 'user-data', 'extra.json'));
  await symlink(join(original, 'settings.json'), join(backup, 'linked.json'));
  await assert.rejects(inventoryRelease20Profile(backup), /link/);
  console.log('Profile inventory detects changed, added and linked files across backup and rollback.');
} finally { await rm(root, { recursive: true, force: true }); }
