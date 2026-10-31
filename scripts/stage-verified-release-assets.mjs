import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');

export async function stageVerifiedReleaseAssets(root) {
  const output = join(root, 'publish-assets');
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Publish staging directory must be empty');
  const candidate = JSON.parse(await readFile(join(root, 'clean-evidence/candidate/candidate-manifest.json'), 'utf8'));
  const staged = new Map();
  const mappings = [];
  for (const [directory, names] of [
    ['release-assets', null],
    ['release-assets-linux', null],
    ['clean-evidence/candidate', [candidate.theoryLab.installerName, 'candidate-manifest.json']],
    ['clean-evidence/test-results', ['final-clean-install.json']],
    ['upgrade-evidence/test-results', ['final-upgrade.json']],
  ]) {
    const files = names ?? (await readdir(join(root, directory))).sort();
    for (const name of files) {
      const source = join(root, directory, name);
      const hash = await sha256(source);
      let assetName = name;
      if (staged.has(name)) {
        if (staged.get(name) === hash) {
          mappings.push({ source: `${directory}/${name}`, asset: name, sha256: hash });
          continue;
        }
        if (directory !== 'release-assets-linux') throw new Error(`Conflicting asset name: ${name}`);
        assetName = `linux-${name}`;
        if (staged.has(assetName)) throw new Error(`Conflicting Linux asset name: ${assetName}`);
      }
      await copyFile(source, join(output, assetName));
      staged.set(assetName, hash);
      mappings.push({ source: `${directory}/${name}`, asset: assetName, sha256: hash });
    }
  }
  const mapName = 'RELEASE_ASSET_MAP.json';
  if (staged.has(mapName)) throw new Error(`Conflicting asset name: ${mapName}`);
  await writeFile(join(output, mapName), `${JSON.stringify({ schema: 'math3d/release-asset-map/v1', files: mappings }, null, 2)}\n`);
  for (const [name, hash] of staged) {
    if (await sha256(join(output, name)) !== hash) throw new Error(`Staged asset changed: ${name}`);
  }
  console.log(`Staged ${staged.size} unique release files and asset map; original hashes preserved.`);
  return mappings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await stageVerifiedReleaseAssets(process.cwd());
}
