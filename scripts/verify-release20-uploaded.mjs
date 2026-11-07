#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = 'https://api.github.com/repos/expert10000/Math3D';
const releaseBase = 'https://github.com/expert10000/Math3D/releases/download/v2.0.0/';
const insist = (ok, message) => { if (!ok) throw new Error(message); };
const hex40 = value => /^[0-9a-f]{40}$/.test(value ?? '');
const hex64 = value => /^[0-9a-f]{64}$/.test(value ?? '');
const safeName = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function hashResponse(response) {
  insist(response.ok && response.body, `Asset download failed: HTTP ${response.status}`);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) { hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest('hex'), size };
}

export async function verifyRelease20Uploaded({ mapPath, reportPath, fetchImpl = fetch, token = process.env.GH_TOKEN }) {
  const mapBytes = await readFile(resolve(mapPath));
  const map = JSON.parse(mapBytes);
  insist(map.schema === 'math3d/release20-ga-assets/v1' && map.tag === 'v2.0.0' &&
    hex40(map.sourceCommit) && hex64(map.installerSha256) &&
    Array.isArray(map.publishedPlatforms) && map.publishedPlatforms.includes('windows') &&
    Array.isArray(map.files) && map.files.length > 0, 'Invalid 2.0 GA asset map.');
  const directory = dirname(resolve(mapPath)), expected = new Map();
  for (const item of map.files) {
    insist(safeName(item.asset) && hex64(item.sha256) &&
      (!expected.has(item.asset) || expected.get(item.asset) === item.sha256),
    'GA asset map has an unsafe or conflicting entry.');
    expected.set(item.asset, item.sha256);
  }
  insist(expected.get('Math3D-Setup-2.0.0.exe') === map.installerSha256,
    'GA asset map installer differs from candidate.');
  expected.set('RELEASE_ASSET_MAP.json', sha(mapBytes));
  const names = await readdir(directory);
  insist(names.length === expected.size && names.every(name => expected.has(name)),
    'Local GA staging directory differs from asset map.');
  for (const [name, digest] of expected)
    insist(await hashFile(join(directory, name)) === digest, `Local staged asset changed: ${name}`);

  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Math3D-release20-audit',
    ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const getJson = async url => {
    const response = await fetchImpl(url, { headers });
    insist(response.ok, `GitHub API request failed: HTTP ${response.status}`);
    return response.json();
  };
  const ref = await getJson(`${api}/git/ref/tags/v2.0.0`);
  let remoteCommit = ref.object?.sha;
  if (ref.object?.type === 'tag') {
    const tag = await getJson(`${api}/git/tags/${remoteCommit}`);
    insist(tag.object?.type === 'commit', 'Published tag does not peel to a commit.');
    remoteCommit = tag.object.sha;
  } else insist(ref.object?.type === 'commit', 'Published tag is not a commit or annotated tag.');
  insist(remoteCommit === map.sourceCommit, 'Published tag points to a different source commit.');
  const release = await getJson(`${api}/releases/tags/v2.0.0`);
  insist(release.tag_name === 'v2.0.0' && release.draft === false && release.prerelease === false &&
    Array.isArray(release.assets) && release.assets.length === expected.size,
  'Published stable release or asset count differs from staged GA bundle.');
  const localNotes = (await readFile(join(directory, 'RELEASE_NOTES.md'), 'utf8')).replace(/\r\n/g, '\n').trim();
  insist(typeof release.body === 'string' && release.body.replace(/\r\n/g, '\n').trim() === localNotes,
    'Published release notes differ from approved notes.');
  const remote = new Map();
  for (const asset of release.assets) {
    insist(safeName(asset.name) && !remote.has(asset.name) && expected.has(asset.name) &&
      asset.browser_download_url === releaseBase + asset.name,
    'Published asset name or download URL is unexpected.');
    remote.set(asset.name, asset);
  }
  const checked = [];
  for (const [name, digest] of expected) {
    const asset = remote.get(name);
    insist(asset && Number.isSafeInteger(asset.size) && asset.size > 0,
      `Published asset is missing or has invalid size: ${name}`);
    const response = await fetchImpl(asset.browser_download_url, { headers: { 'User-Agent': 'Math3D-release20-audit' } });
    const downloaded = await hashResponse(response);
    insist(downloaded.sha256 === digest && downloaded.size === asset.size,
      `Published download differs from staged asset: ${name}`);
    checked.push({ name, sha256: digest, size: downloaded.size });
  }
  const report = { schema: 'math3d/release20-upload-audit/v1', status: 'passed',
    checkedAtUtc: new Date().toISOString(), tag: 'v2.0.0', sourceCommit: remoteCommit,
    installerSha256: map.installerSha256, assetMapSha256: sha(mapBytes),
    releaseId: release.id, assets: checked };
  if (reportPath) {
    const destination = resolve(reportPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [mapPath, reportPath] = process.argv.slice(2);
  if (!mapPath || !reportPath) {
    console.error('Usage: node scripts/verify-release20-uploaded.mjs <staged-RELEASE_ASSET_MAP.json> <audit-report-json>');
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(await verifyRelease20Uploaded({ mapPath, reportPath }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
