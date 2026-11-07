import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease20Uploaded } from './verify-release20-uploaded.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = await mkdtemp(join(tmpdir(), 'math3d-ga-upload-'));
try {
  const commit = 'a'.repeat(40), installer = Buffer.from('approved installer');
  const notes = Buffer.from('# Math3D 2.0.0\n\nApproved notes\n');
  const contents = new Map([['Math3D-Setup-2.0.0.exe', installer], ['RELEASE_NOTES.md', notes]]);
  const map = { schema: 'math3d/release20-ga-assets/v1', tag: 'v2.0.0', sourceCommit: commit,
    installerSha256: sha(installer), publishedPlatforms: ['windows'], files: [...contents].map(([asset, bytes]) =>
      ({ source: asset, asset, sha256: sha(bytes) })) };
  const mapPath = join(root, 'RELEASE_ASSET_MAP.json'), mapBytes = Buffer.from(JSON.stringify(map));
  for (const [name, bytes] of contents) await writeFile(join(root, name), bytes);
  await writeFile(mapPath, mapBytes);
  contents.set('RELEASE_ASSET_MAP.json', mapBytes);
  const base = 'https://github.com/expert10000/Math3D/releases/download/v2.0.0/';
  const assets = [...contents].map(([name, bytes], index) =>
    ({ id: index + 1, name, size: bytes.length, browser_download_url: base + name }));
  const makeFetch = ({ tagCommit = commit, remote = contents, listed = assets } = {}) => async url => {
    if (url.endsWith('/git/ref/tags/v2.0.0'))
      return Response.json({ object: { type: 'commit', sha: tagCommit } });
    if (url.endsWith('/releases/tags/v2.0.0'))
      return Response.json({ id: 42, tag_name: 'v2.0.0', draft: false, prerelease: false,
        body: notes.toString('utf8'), assets: listed });
    const name = url.startsWith(base) ? url.slice(base.length) : null;
    return name && remote.has(name) ? new Response(remote.get(name)) : new Response('missing', { status: 404 });
  };
  const args = { mapPath, token: '', fetchImpl: makeFetch() };
  const report = await verifyRelease20Uploaded(args);
  assert.equal(report.status, 'passed');
  assert.equal(report.assets.length, contents.size);
  assert.equal(report.installerSha256, sha(installer));
  await assert.rejects(verifyRelease20Uploaded({ ...args, fetchImpl: makeFetch({ tagCommit: 'f'.repeat(40) }) }),
    /different source commit/);
  const changed = new Map(contents); changed.set('Math3D-Setup-2.0.0.exe', Buffer.from('altered installer'));
  await assert.rejects(verifyRelease20Uploaded({ ...args, fetchImpl: makeFetch({ remote: changed }) }),
    /Published download differs/);
  await assert.rejects(verifyRelease20Uploaded({ ...args, fetchImpl: makeFetch({ listed: assets.slice(1) }) }),
    /asset count/);
  await writeFile(join(root, 'Math3D-Setup-2.0.0.exe'), 'changed locally');
  await assert.rejects(verifyRelease20Uploaded(args), /Local staged asset changed/);
  assert.equal((await readFile(mapPath)).toString(), mapBytes.toString());
  console.log('Uploaded audit checks tag commit, full asset set, notes, and downloaded bytes.');
} finally { await rm(root, { recursive: true, force: true }); }
