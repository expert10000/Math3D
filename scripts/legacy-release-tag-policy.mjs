#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function assertLegacyReleaseTag(tag) {
  if (typeof tag !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error('Legacy stable release requires a v-prefixed stable tag.');
  if (tag === 'v2.0.0')
    throw new Error('v2.0.0 requires the dedicated exact-candidate GA path; legacy 1.x sign-off is insufficient.');
  return tag;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { console.log(`Legacy release tag accepted: ${assertLegacyReleaseTag(process.argv[2] ?? process.env.RELEASE_TAG)}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
