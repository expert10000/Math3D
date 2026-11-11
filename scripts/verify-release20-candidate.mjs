#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const hex64 = value => /^[0-9a-f]{64}$/.test(value ?? '');
const nsisHash = '1556ee1bf1cb477124e1269b534ed81653ba71994dab7903ee3782b75acc2810';

export async function verifyRelease20Candidate(manifestPath, installerPath) {
  const candidate = JSON.parse(await readFile(manifestPath, 'utf8'));
  const m = candidate.math3d ?? {};
  assert(candidate.schema === 'math3d/release20-candidate/v1' && m.version === '2.0.0' &&
    m.channel === 'stable' && /^[0-9a-f]{40}$/.test(m.commit ?? ''), 'Exact stable 2.0 candidate identity is missing.');
  assert(m.installerName === 'Math3D-Setup-2.0.0.exe' && basename(installerPath) === m.installerName,
    'Installer filename differs from the 2.0 candidate.');
  for (const key of ['installerSha256', 'executableSha256', 'workerSha256', 'buildIdentitySha256']) {
    assert(hex64(m[key]), `Candidate ${key} is absent or invalid.`);
  }
  assert(m.nsisSystemDllSha256 === nsisHash && /^[0-9a-f]{40}$/.test(m.signerThumbprint ?? ''),
    'Candidate signer or pinned NSIS component is missing.');
  assert(candidate.inputs && Object.keys(candidate.inputs).length === 4 &&
    Object.values(candidate.inputs).every(hex64), 'Candidate input digests are incomplete.');
  const installerSha256 = sha(await readFile(installerPath));
  assert(installerSha256 === m.installerSha256, 'Installer bytes differ from candidate manifest.');
  return { commit: m.commit, installerSha256, signerThumbprint: m.signerThumbprint,
    executableSha256: m.executableSha256, workerSha256: m.workerSha256, nsisSystemDllSha256: nsisHash };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: verify-release20-candidate.mjs <manifest> <installer>');
    console.log(JSON.stringify(await verifyRelease20Candidate(resolve(process.argv[2]), resolve(process.argv[3]))));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
