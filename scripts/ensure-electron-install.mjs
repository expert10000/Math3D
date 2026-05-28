#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

function getElectronDir() {
  return path.dirname(require.resolve("electron/package.json"));
}

function getPlatformPath() {
  const platform = process.env.npm_config_platform || os.platform();
  switch (platform) {
    case "mas":
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "freebsd":
    case "openbsd":
    case "linux":
      return "electron";
    case "win32":
      return "electron.exe";
    default:
      throw new Error(`Electron builds are not available on platform: ${platform}`);
  }
}

function resolveElectronBinary() {
  return require("electron");
}

function runElectronInstall() {
  const electronDir = getElectronDir();
  const installScript = path.join(electronDir, "install.js");
  const result = spawnSync(process.execPath, [installScript], {
    cwd: electronDir,
    env: {
      ...process.env,
      ELECTRON_SKIP_BINARY_DOWNLOAD: "",
      npm_config_electron_skip_binary_download: "",
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Electron install repair failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function repairPathMarkerIfPossible() {
  const electronDir = getElectronDir();
  const platformPath = getPlatformPath();
  const executablePath = process.env.ELECTRON_OVERRIDE_DIST_PATH
    ? path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, platformPath)
    : path.join(electronDir, "dist", platformPath);
  if (!fs.existsSync(executablePath)) return false;
  fs.writeFileSync(path.join(electronDir, "path.txt"), platformPath);
  return true;
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
  try {
    resolveElectronBinary();
  } catch (secondError) {
    const repaired = repairPathMarkerIfPossible();
    if (!repaired) throw secondError;
    resolveElectronBinary();
  }
}
