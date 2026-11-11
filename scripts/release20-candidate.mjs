#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRelease20Freeze } from './verify-release20-freeze.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
const pins = ['electron', 'electron-builder', 'better-sqlite3'];
const inputs = ['package-lock.json', 'renderer/package-lock.json', 'python/worker/requirements.freeze.txt',
  'python/worker/build-requirements.freeze.txt'];
const expectedSystemDll = '1556ee1bf1cb477124e1269b534ed81653ba71994dab7903ee3782b75acc2810';

/** Refuse a 1.x checkout or a non-frozen dependency before any packaging work. */
export async function inspectRelease20CandidateInputs(root, sourceCommit, clean, signingPresent) {
  requireValue(/^[0-9a-f]{40}$/.test(sourceCommit) && clean, 'Candidate source must be a clean, exact Git commit.');
  const [app, renderer, lock, rendererLock] = await Promise.all(['package.json', 'renderer/package.json', 'package-lock.json', 'renderer/package-lock.json']
    .map(name => readJson(join(root, name))));
  requireValue(app.version === '2.0.0' && renderer.version === '2.0.0' && lock.version === '2.0.0' &&
    lock.packages?.['']?.version === '2.0.0' && rendererLock.version === '2.0.0' &&
    rendererLock.packages?.['']?.version === '2.0.0',
    'Candidate requires a reviewed 2.0.0 root, renderer and both npm lockfiles.');
  for (const name of pins) {
    const declared = app.dependencies?.[name] ?? app.devDependencies?.[name];
    requireValue(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(declared ?? '') &&
      lock.packages?.[`node_modules/${name}`]?.version === declared,
    `Candidate dependency ${name} is not an exact installed lockfile pin.`);
  }
  for (const name of inputs.slice(2)) {
    const lines = (await readFile(join(root, name), 'utf8')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    requireValue(lines.length > 0 && lines.every(line => /^[A-Za-z0-9_.-]+==[A-Za-z0-9_.+-]+$/.test(line)),
      `${name} must contain exact Python pins.`);
  }
  requireValue(signingPresent, 'Windows signer, certificate password, timestamp URL and thumbprint are required.');
  return { sourceCommit, version: '2.0.0', dependencies: Object.fromEntries(pins.map(name =>
    [name, app.dependencies?.[name] ?? app.devDependencies?.[name]])),
    inputSha256: Object.fromEntries(await Promise.all(inputs.map(async name => [name, sha(await readFile(join(root, name)))]))) };
}

/** Record only independently verified signatures and the extracted installer System.dll. */
export async function recordRelease20Candidate({ root, sourceCommit, installerPath, unpackedRoot, signaturesPath,
  nsisPath, freezePath, outputPath, preflight }) {
  await verifyRelease20Freeze({ root, manifestPath: freezePath, expectedCommit: sourceCommit });
  const [signatures, nsis, identity] = await Promise.all([readJson(signaturesPath), readJson(nsisPath),
    readJson(join(root, 'dist/build-identity.json'))]);
  requireValue(identity.version === '2.0.0' && identity.commit === sourceCommit && identity.dirty === false,
    'Packaged build identity must match the clean 2.0 source commit.');
  requireValue(signatures.schema === 'math3d/release20-signatures/v1' && signatures.version === '2.0.0' &&
    /^[0-9a-f]{40}$/i.test(signatures.thumbprint) && Array.isArray(signatures.files),
    'Expected exact 2.0 Authenticode verification receipt.');
  const installerName = basename(installerPath);
  requireValue(installerName === 'Math3D-Setup-2.0.0.exe', 'Candidate installer has an unexpected filename.');
  const paths = [installerPath, join(unpackedRoot, 'Math3D.exe'), join(unpackedRoot, 'resources/python-worker/worker.exe')];
  const actual = await Promise.all(paths.map(async path => sha(await readFile(path))));
  for (let index = 0; index < paths.length; index++) {
    requireValue(signatures.files.some(row => resolve(row.name) === resolve(paths[index]) && row.sha256 === actual[index]),
      `Signature receipt does not bind ${paths[index]} to these bytes.`);
  }
  requireValue(nsis.schema === 'math3d/release20-nsis/v1' && nsis.installerSha256 === actual[0] &&
    nsis.systemDllSha256 === expectedSystemDll && nsis.systemDllBytes === 30208,
  'Installer does not contain the pinned NSIS 3.13 System.dll.');
  const manifest = { schema: 'math3d/release20-candidate/v1', math3d: {
    version: '2.0.0', channel: 'stable', commit: sourceCommit, installerName, installerSha256: actual[0],
    executableSha256: actual[1], workerSha256: actual[2], signerThumbprint: signatures.thumbprint.toLowerCase(),
    nsisSystemDllSha256: nsis.systemDllSha256, buildIdentitySha256: sha(await readFile(join(root, 'dist/build-identity.json'))),
    freezeManifestSha256: sha(await readFile(freezePath)),
  }, inputs: preflight.inputSha256, dependencies: preflight.dependencies };
  await writeFile(outputPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const root = resolve(process.cwd()), sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const clean = !execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
    const signingPresent = !!(process.env.MATH3D_WINDOWS_CSC_LINK && process.env.MATH3D_WINDOWS_CSC_KEY_PASSWORD &&
      process.env.MATH3D_WINDOWS_TIMESTAMP_URL && /^[0-9a-f]{40}$/i.test(process.env.MATH3D_WINDOWS_SIGNER_THUMBPRINT ?? ''));
    const preflight = await inspectRelease20CandidateInputs(root, sourceCommit, clean, signingPresent);
    if (process.argv[2] === '--preflight') console.log(JSON.stringify(preflight));
    else if (process.argv[2] === '--record' && process.argv.length === 9) {
      const result = await recordRelease20Candidate({ root, sourceCommit, preflight, installerPath: resolve(process.argv[3]),
        unpackedRoot: resolve(process.argv[4]), signaturesPath: resolve(process.argv[5]), nsisPath: resolve(process.argv[6]),
        freezePath: resolve(process.argv[7]), outputPath: resolve(process.argv[8]) });
      console.log(JSON.stringify(result));
    } else throw new Error('Use --preflight or --record <installer> <unpacked> <signatures.json> <nsis.json> <freeze.json> <output.json>.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
