#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { verifyNativeCgalSourceBundle } = require("./native-cgal-source-contract.cjs");
const directory = path.resolve(process.argv[2] ?? "release-source");
const receipt = JSON.parse(fs.readFileSync(path.join(directory, "SOURCE_MANIFEST-windows.json"), "utf8"));
const inventory = JSON.parse(fs.readFileSync(path.join(root, "compliance/public-source-manifest.json"), "utf8"));
const dependency = fs.readFileSync(path.join(root, "native/cgal-worker/dependency-manifest.json"));
const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
if (git.status !== 0) throw new Error(git.stderr || "Cannot identify source commit.");
const checked = verifyNativeCgalSourceBundle(directory, receipt, inventory, dependency, git.stdout.trim());
console.log(`Verified ${checked.assetCount} public source assets for native CGAL, including ${checked.sourceArchive}.`);
