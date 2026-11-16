#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Provide the downloaded package directory");
const text = await readFile(path.join(directory, "latest-linux.yml"), "utf8");
const records = [...text.matchAll(/^\s*- url: ([^\r\n]+)\r?\n\s+sha512: ([^\r\n]+)\r?\n\s+size: (\d+)/gm)];
if (records.length !== 3) throw new Error("Expected exactly three packages in latest-linux.yml");
for (const [, name, expectedSha512, expectedSize] of records) {
  if (!/\.AppImage$|\.deb$|\.rpm$/.test(name) || path.basename(name) !== name)
    throw new Error(`Unexpected Linux package path: ${name}`);
  const packagePath = path.join(directory, name);
  if ((await stat(packagePath)).size !== Number(expectedSize)) throw new Error(`Size mismatch: ${name}`);
  const sha512 = createHash("sha512");
  for await (const chunk of createReadStream(packagePath)) sha512.update(chunk);
  if (sha512.digest("base64") !== expectedSha512) throw new Error(`SHA-512 mismatch: ${name}`);
  process.stdout.write(`verified ${name}\n`);
}
