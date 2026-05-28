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

function getElectronPaths() {
  const electronDir = getElectronDir();
  const platformPath = getPlatformPath();
  return {
    electronDir,
    platformPath,
    pathFile: path.join(electronDir, "path.txt"),
    executablePath: process.env.ELECTRON_OVERRIDE_DIST_PATH
      ? path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, platformPath)
      : path.join(electronDir, "dist", platformPath),
  };
}

function markerMatches(paths) {
  if (!fs.existsSync(paths.pathFile)) return false;
  const marker = fs.readFileSync(paths.pathFile, "utf8").trim();
  return marker === paths.platformPath && fs.existsSync(paths.executablePath);
}

function writeMarkerIfExecutableExists(paths) {
  if (!fs.existsSync(paths.executablePath)) return false;
  fs.writeFileSync(paths.pathFile, paths.platformPath);
  return true;
}

function runElectronInstall(paths) {
  const installScript = path.join(paths.electronDir, "install.js");
  const env = { ...process.env };
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  delete env.npm_config_electron_skip_binary_download;
  delete env.NPM_CONFIG_ELECTRON_SKIP_BINARY_DOWNLOAD;
  const result = spawnSync(process.execPath, [installScript], {
    cwd: paths.electronDir,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Electron install repair failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function listDist(paths) {
  const distDir = path.join(paths.electronDir, "dist");
  try {
    return fs.readdirSync(distDir).slice(0, 20).join(", ");
  } catch {
    return "(dist folder missing)";
  }
}

const paths = getElectronPaths();
if (!markerMatches(paths)) {
  if (writeMarkerIfExecutableExists(paths)) {
    process.stderr.write("[ensure-electron] Restored electron/path.txt from existing binary\n");
  } else {
    process.stderr.write("[ensure-electron] Electron binary marker missing; running electron/install.js\n");
    runElectronInstall(paths);

    if (!markerMatches(paths) && !writeMarkerIfExecutableExists(paths)) {
      throw new Error(
        [
          "Electron failed to install correctly after repair.",
          `Expected executable: ${paths.executablePath}`,
          `Expected marker: ${paths.pathFile}`,
          `electron/dist entries: ${listDist(paths)}`,
        ].join("\n")
      );
    }
  }
}
