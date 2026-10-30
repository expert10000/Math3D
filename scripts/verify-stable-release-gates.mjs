import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const tag = process.env.RELEASE_TAG;
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) throw new Error('Stable release tag is required');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const version = tag.slice(1);
const root = process.cwd();
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const sha256 = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const candidate = await readJson(join(root, 'clean-evidence/candidate/candidate-manifest.json'));
const clean = await readJson(join(root, 'clean-evidence/test-results/final-clean-install.json'));
const upgrade = await readJson(join(root, 'upgrade-evidence/test-results/final-upgrade.json'));

if (candidate.schema !== 'math3d/two-app-candidate/v1' ||
    candidate.math3d.version !== version || candidate.math3d.commit !== sourceCommit ||
    candidate.math3d.channel !== 'stable' ||
    candidate.buildRunId !== process.env.GITHUB_RUN_ID) {
  throw new Error('Candidate identity differs from this frozen stable tag and build run');
}
for (const [label, evidence, checks] of [
  ['clean', clean, ['candidateBytes', 'install', 'installedUiRoundtrip']],
  ['upgrade', upgrade, ['exactBytes', 'oldInstall', 'oldProjectAndSetting',
    'inPlaceUpgrade', 'retainedProjectAndSetting', 'installedUiRoundtrip']],
]) {
  if (evidence.status !== 'passed' || checks.some(check => evidence.checks?.[check] !== 'passed'))
    throw new Error(`${label} gate did not pass every required check`);
}
if (clean.math3d.commit !== sourceCommit || clean.math3d.installerSha256 !== candidate.math3d.installerSha256 ||
    clean.theoryLab.commit !== candidate.theoryLab.commit ||
    clean.theoryLab.installerSha256 !== candidate.theoryLab.installerSha256 ||
    upgrade.candidate.math3d.installerSha256 !== candidate.math3d.installerSha256 ||
    upgrade.candidate.theoryLab.installerSha256 !== candidate.theoryLab.installerSha256 ||
    upgrade.candidate.manifestSha256 !== await sha256(join(root, 'clean-evidence/candidate/candidate-manifest.json'))) {
  throw new Error('Clean and upgrade evidence do not refer to the same exact installers');
}
const installer = join(root, 'release-assets', candidate.math3d.installerName);
if (await sha256(installer) !== candidate.math3d.installerSha256)
  throw new Error('Publish installer bytes differ from the tested Windows installer');
const labInstaller = join(root, 'clean-evidence/candidate', candidate.theoryLab.installerName);
if (await sha256(labInstaller) !== candidate.theoryLab.installerSha256)
  throw new Error('Publish Lab installer bytes differ from the tested Lab installer');

for (const [directory, sumsName] of [
  ['release-assets', 'SHA256SUMS.txt'],
  ['release-assets-linux', 'SHA256SUMS-linux.txt'],
]) {
  const files = (await readdir(join(root, directory))).filter(name => name !== sumsName);
  if (!files.length) throw new Error(`No ${directory} assets`);
  const sums = (await readFile(join(root, directory, sumsName), 'utf8')).trim().split(/\r?\n/);
  const expected = new Map(sums.map(line => {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line);
    if (!match) throw new Error(`Malformed ${sumsName} entry: ${line}`);
    return [match[2], match[1].toLowerCase()];
  }));
  if (expected.size !== files.length) throw new Error(`${sumsName} does not cover all assets`);
  for (const file of files) {
    if (!(await stat(join(root, directory, file))).isFile() ||
        expected.get(basename(file)) !== await sha256(join(root, directory, file)))
      throw new Error(`Asset checksum mismatch: ${directory}/${file}`);
  }
}
console.log(`Stable ${tag}: exact final installers passed clean and v1.6.0 upgrade gates; all publish assets match SHA-256 manifests.`);
