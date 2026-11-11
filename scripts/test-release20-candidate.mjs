import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectRelease20CandidateInputs, recordRelease20Candidate } from './release20-candidate.mjs';
import { verifyRelease20Candidate } from './verify-release20-candidate.mjs';

const root = await mkdtemp(join(tmpdir(), 'math3d-release20-candidate-test-'));
const commit = 'a'.repeat(40), thumbprint = 'b'.repeat(40);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const put = async (name, bytes) => { const path = join(root, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes); return path; };
try {
  const dependencies = { electron: '38.5.0', 'electron-builder': '26.0.12', 'better-sqlite3': '12.4.1' };
  const app = { version: '2.0.0', devDependencies: dependencies };
  await put('package.json', JSON.stringify(app));
  await put('renderer/package.json', JSON.stringify({ version: '2.0.0' }));
  await put('package-lock.json', JSON.stringify({ version: '2.0.0', packages: { '': { version: '2.0.0' },
    ...Object.fromEntries(Object.entries(dependencies).map(([name, version]) => [`node_modules/${name}`, { version }])) } }));
  await put('renderer/package-lock.json', JSON.stringify({ version: '2.0.0', packages: { '': { version: '2.0.0' } } }));
  await put('python/worker/requirements.freeze.txt', 'vtk==9.7.0\n');
  await put('python/worker/build-requirements.freeze.txt', 'pyinstaller==6.19.0\n');
  const preflight = await inspectRelease20CandidateInputs(root, commit, true, true);
  assert.equal(preflight.dependencies.electron, dependencies.electron);
  await assert.rejects(inspectRelease20CandidateInputs(root, commit, true, false), /signer/);
  await assert.rejects(inspectRelease20CandidateInputs(root, commit, false, true), /clean/);
  await put('renderer/package.json', JSON.stringify({ version: '1.7.0' }));
  await assert.rejects(inspectRelease20CandidateInputs(root, commit, true, true), /2.0.0/);
  await put('renderer/package.json', JSON.stringify({ version: '2.0.0' }));
  await put('dist/build-identity.json', JSON.stringify({ version: '2.0.0', commit, dirty: false }));
  const installer = await put('candidate/Math3D-Setup-2.0.0.exe', 'signed installer');
  const unpacked = join(root, 'release/win-unpacked');
  const appExe = await put('release/win-unpacked/Math3D.exe', 'signed app');
  const worker = await put('release/win-unpacked/resources/python-worker/worker.exe', 'signed worker');
  const signatures = await put('candidate/signatures.json', '\uFEFF' + JSON.stringify({ schema: 'math3d/release20-signatures/v1',
    version: '2.0.0', thumbprint, files: await Promise.all([installer, appExe, worker].map(async name => ({ name, sha256: sha(await readFile(name)) }))) }));
  const nsis = await put('candidate/nsis.json', '\uFEFF' + JSON.stringify({ schema: 'math3d/release20-nsis/v1',
    installerSha256: sha(await readFile(installer)), systemDllSha256: '1556ee1bf1cb477124e1269b534ed81653ba71994dab7903ee3782b75acc2810', systemDllBytes: 30208 }));
  const output = join(root, 'candidate/candidate-manifest.json');
  const options = { root, sourceCommit: commit, installerPath: installer, unpackedRoot: unpacked,
    signaturesPath: signatures, nsisPath: nsis, outputPath: output, preflight };
  const manifest = await recordRelease20Candidate(options);
  assert.equal(manifest.math3d.installerSha256, sha(await readFile(installer)));
  assert.equal((await verifyRelease20Candidate(output, installer)).signerThumbprint, thumbprint);
  await put('candidate/Math3D-Setup-2.0.0.exe', 'changed installer');
  await assert.rejects(verifyRelease20Candidate(output, installer), /bytes differ/);
  await put('candidate/Math3D-Setup-2.0.0.exe', 'signed installer');
  await assert.rejects(recordRelease20Candidate(options), /EEXIST/);
  await put('release/win-unpacked/resources/python-worker/worker.exe', 'tampered worker');
  await assert.rejects(recordRelease20Candidate({ ...options, outputPath: join(root, 'candidate/second.json') }), /Signature receipt/);
  console.log('Pinned 2.0 candidate inputs and exact artifact receipts reject 1.x, absent signing, drift and worker tampering.');
} finally { await rm(root, { recursive: true, force: true }); }
