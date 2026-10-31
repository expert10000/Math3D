import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

const root = await mkdtemp(join(tmpdir(), 'math3d-release-gate-test-'));
const verifier = resolve('scripts/verify-stable-release-gates.mjs');
const sha = data => createHash('sha256').update(data).digest('hex');
const save = async (path, data) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data); };
const json = async (path, value) => save(path, JSON.stringify(value));
const run = (extraEnv = {}) => spawnSync(process.execPath, [verifier], {
  cwd: root, encoding: 'utf8', env: { ...process.env, RELEASE_TAG: 'v1.7.0', GITHUB_RUN_ID: '42', VERIFIED_BUILD_RUN_ID: '42', ...extraEnv },
});
try {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Gate test', '-c', 'user.email=gate@example.invalid',
    'commit', '--allow-empty', '-qm', 'frozen'], { cwd: root });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const mathName = 'Math3D-Setup-1.7.0.exe', labName = 'Quantum-Hamiltonian-Lab-Setup-0.1.0.exe';
  const math = Buffer.from('exact Math3D installer'), lab = Buffer.from('exact Lab installer');
  const linux = Buffer.from('exact Linux package');
  const manifest = { schema: 'math3d/two-app-candidate/v1', buildRunId: '42',
    math3d: { version: '1.7.0', commit, channel: 'stable', installerName: mathName, installerSha256: sha(math) },
    theoryLab: { version: '0.1.0', commit: 'a'.repeat(40), installerName: labName, installerSha256: sha(lab) } };
  await save(join(root, 'release-assets', mathName), math);
  await save(join(root, 'release-assets-linux', 'Math3D-1.7.0-linux-x64.deb'), linux);
  await save(join(root, 'clean-evidence/candidate', labName), lab);
  await json(join(root, 'clean-evidence/candidate/candidate-manifest.json'), manifest);
  await save(join(root, 'release-assets/SHA256SUMS.txt'), `${sha(math)}  ${mathName}\n`);
  await save(join(root, 'release-assets-linux/SHA256SUMS-linux.txt'), `${sha(linux)}  Math3D-1.7.0-linux-x64.deb\n`);
  await json(join(root, 'clean-evidence/test-results/final-clean-install.json'), {
    status: 'passed', math3d: { commit, installerSha256: sha(math) },
    theoryLab: { commit: manifest.theoryLab.commit, installerSha256: sha(lab) },
    checks: { candidateBytes: 'passed', install: 'passed', installedUiRoundtrip: 'passed' },
  });
  const upgradePath = join(root, 'upgrade-evidence/test-results/final-upgrade.json');
  const upgrade = { status: 'passed', candidate: { math3d: manifest.math3d, theoryLab: manifest.theoryLab,
    manifestSha256: sha(await readFile(join(root, 'clean-evidence/candidate/candidate-manifest.json'))) },
  checks: { exactBytes: 'passed', oldInstall: 'passed', oldProjectAndSetting: 'passed',
    inPlaceUpgrade: 'passed', retainedProjectAndSetting: 'passed', installedUiRoundtrip: 'passed' } };
  await json(upgradePath, upgrade);
  if (run().status !== 0) throw new Error('Valid gate evidence was refused');
  if (run({ VERIFIED_BUILD_RUN_ID: '42', GITHUB_RUN_ID: '99' }).status !== 0)
    throw new Error('Verified cross-run evidence was refused');
  if (run({ VERIFIED_BUILD_RUN_ID: '43' }).status === 0)
    throw new Error('Evidence from a different build run was accepted');
  await save(join(root, 'release-assets', mathName), 'changed Math3D installer');
  if (run().status === 0) throw new Error('Changed installer bytes were accepted');
  await save(join(root, 'release-assets', mathName), math);
  await json(upgradePath, { ...upgrade, status: 'failed' });
  if (run().status === 0) throw new Error('Failed upgrade evidence was accepted');
  console.log('Stable release gate accepts aligned evidence and refuses changed bytes or a failed upgrade.');
} finally {
  if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes('math3d-release-gate-test-'))
    throw new Error('Unsafe release gate fixture cleanup path');
  await rm(root, { recursive: true, force: true });
}
