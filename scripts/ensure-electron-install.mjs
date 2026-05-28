#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

function resolveElectronBinary() {
  return require("electron");
}

function runElectronInstall() {
  const packageJsonPath = require.resolve("electron/package.json");
  const electronDir = path.dirname(packageJsonPath);
  const installScript = path.join(electronDir, "install.js");
  const result = spawnSync(process.execPath, [installScript], {
    cwd: electronDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Electron install repair failed with exit code ${result.status ?? "unknown"}.`);
  }
}

try {
  resolveElectronBinary();
} catch (error) {
  const message = String(error?.message ?? error);
  if (!message.includes("Electron failed to install correctly")) {
    throw error;
  }
  process.stderr.write("[ensure-electron] Electron binary marker missing; running electron/install.js\n");
  runElectronInstall();
  resolveElectronBinary();
}
