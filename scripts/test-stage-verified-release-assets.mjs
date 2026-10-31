import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageVerifiedReleaseAssets } from './stage-verified-release-assets.mjs';

const root = await mkdtemp(join(tmpdir(), 'math3d-stage-release-'));
const put = async (path, content) => {
  const full = join(root, path);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
};
try {
  await put('clean-evidence/candidate/candidate-manifest.json', JSON.stringify({ theoryLab: { installerName: 'Lab.exe' } }));
  await put('clean-evidence/candidate/Lab.exe', 'verified Lab');
  await put('clean-evidence/test-results/final-clean-install.json', '{}');
  await put('upgrade-evidence/test-results/final-upgrade.json', '{}');
  await put('release-assets/common.txt', 'same');
  await put('release-assets/source.zip', 'Windows source');
  await put('release-assets-linux/common.txt', 'same');
  await put('release-assets-linux/source.zip', 'Linux source');
  const map = await stageVerifiedReleaseAssets(root);
  assert.equal(await readFile(join(root, 'publish-assets/source.zip'), 'utf8'), 'Windows source');
  assert.equal(await readFile(join(root, 'publish-assets/linux-source.zip'), 'utf8'), 'Linux source');
  assert.equal(map.find(item => item.source === 'release-assets-linux/common.txt').asset, 'common.txt');
  assert.equal(map.find(item => item.source === 'release-assets-linux/source.zip').asset, 'linux-source.zip');
  assert.equal((await readdir(join(root, 'publish-assets'))).length, 8);
  const json = JSON.parse(await readFile(join(root, 'publish-assets/RELEASE_ASSET_MAP.json'), 'utf8'));
  assert.equal(json.schema, 'math3d/release-asset-map/v1');
  await assert.rejects(stageVerifiedReleaseAssets(root), /must be empty/);
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log('Release staging preserves differing platform bytes and deduplicates identical files.');
