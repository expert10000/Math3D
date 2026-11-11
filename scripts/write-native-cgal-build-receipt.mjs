#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { currentNativeCgalBuild, receiptName } = require("./native-cgal-build-receipt.cjs");
const sourceManifestPath = resolve(process.argv[2] ?? "release-source/SOURCE_MANIFEST-windows.json");
const target = resolve(process.argv[3] ?? `build/native/cgal-worker/${receiptName}`);
if (!target.endsWith(receiptName)) throw new Error(`Native build receipt must be named ${receiptName}.`);
const receipt = currentNativeCgalBuild({ sourceManifestPath });
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(receipt, null, 2) + "\n");
console.log(`Native CGAL source-to-binary receipt: ${target}`);
