#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const [archive, output, expectedCommit] = process.argv.slice(2);
if (!archive || !output || !/^[0-9a-f]{40}$/.test(expectedCommit ?? '')) {
  throw new Error('Usage: extract-installed-build-identity.mjs <app.asar> <output> <expected-commit>');
}
const bytes = asar.extractFile(resolve(archive), 'dist/build-identity.json');
const identity = JSON.parse(bytes.toString('utf8'));
if (identity.version !== '2.0.0' || identity.commit !== expectedCommit || identity.dirty !== false) {
  throw new Error('Installed asar build identity differs from the pinned clean source commit.');
}
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(resolve(output), bytes);
process.stdout.write(JSON.stringify(identity) + '\n');
