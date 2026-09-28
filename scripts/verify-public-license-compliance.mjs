#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const requireFile = (relative) => {
  if (!exists(relative)) failures.push(`Missing required compliance file: ${relative}`);
};
const requireText = (relative, text) => {
  requireFile(relative);
  if (exists(relative) && !read(relative).includes(text)) {
    failures.push(`${relative} must contain ${JSON.stringify(text)}`);
  }
};

for (const file of [
  "LICENSE",
  "LICENSES/Apache-2.0.txt",
  "THIRD_PARTY_NOTICES.md",
  "SOURCE_OFFER.md",
  "compliance/public-source-manifest.json",
  "docs/licensing-and-distribution-roadmap.md",
]) requireFile(file);

requireText("LICENSE", "GNU GENERAL PUBLIC LICENSE");
requireText("LICENSE", "Version 3, 29 June 2007");
requireText("LICENSES/Apache-2.0.txt", "Apache License");
requireText("package.json", '"license": "GPL-3.0-or-later"');
requireText("package-lock.json", '"license": "GPL-3.0-or-later"');
requireText("readme.md", "GPL-3.0-or-later");
requireText("electron-builder.config.cjs", 'from: "LICENSE"');
requireText("electron-builder.config.cjs", 'from: "THIRD_PARTY_NOTICES.md"');
requireText("electron-builder.config.cjs", 'from: "SOURCE_OFFER.md"');
requireText(".github/workflows/release.yml", "npm run verify:license-compliance");
requireText(".github/workflows/release.yml", "npm run release:source");
requireText(".github/workflows/release.yml", "python -m pip install pyinstaller -r python/worker/requirements.freeze.txt");
requireText(".github/workflows/release.yml", 'MATH3D_REQUIRE_PYGALMESH: "1"');
requireText(".github/workflows/release.yml", 'MATH3D_REQUIRE_CGAL: "1"');

const requirements = read("python/worker/requirements.freeze.txt")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
for (const expected of [
  "CGAL==6.0.1.post202410241521",
  "pygalmesh==0.10.7",
]) {
  if (!requirements.includes(expected)) failures.push(`Frozen worker requirement must pin ${expected}`);
}
if (requirements.some((line) => !/^[A-Za-z0-9_.-]+==[^=\s]+$/.test(line))) {
  failures.push("Every frozen Python worker requirement must use an exact == version pin.");
}

let manifest;
try {
  manifest = JSON.parse(read("compliance/public-source-manifest.json"));
} catch (error) {
  failures.push(`Invalid public source manifest: ${error.message}`);
}
if (manifest) {
  if (manifest.distributionLicense !== "GPL-3.0-or-later") {
    failures.push("Public source manifest must declare GPL-3.0-or-later.");
  }
  const names = new Set();
  for (const [index, source] of (manifest.sources ?? []).entries()) {
    const label = `sources[${index}]`;
    if (!source.name || !source.version || !source.filename) failures.push(`${label} is incomplete.`);
    if (!Array.isArray(source.targets) || source.targets.length === 0) failures.push(`${label}.targets is empty.`);
    if (!/^https:\/\//.test(source.url ?? "")) failures.push(`${label}.url must use HTTPS.`);
    if (!/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) failures.push(`${label}.sha256 is invalid.`);
    const key = `${source.filename}:${source.sha256}`;
    if (names.has(key)) failures.push(`${label} duplicates another source archive.`);
    names.add(key);
  }
  for (const required of ["pygalmesh", "CGAL Python bindings", "GMP", "MPFR"]) {
    if (!(manifest.sources ?? []).some((entry) => entry.name === required)) {
      failures.push(`Public source manifest is missing ${required}.`);
    }
  }
}

if (failures.length) {
  console.error("Public license compliance verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Public GPL release compliance metadata is internally consistent.");
