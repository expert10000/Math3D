#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function readBoundedIntegerEnv(name, { min, max, defaultValue }) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function resolveElectronBinary() {
  return require("electron");
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
  const packageJsonPath = require.resolve("electron/package.json");
  const electronDir = path.dirname(packageJsonPath);
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

function writeMarkerIfExecutableExists(paths) {
  if (!fs.existsSync(paths.executablePath)) return false;
  fs.writeFileSync(paths.pathFile, paths.platformPath);
  return true;
}

function describeElectronState(paths) {
  const pathFileExists = fs.existsSync(paths.pathFile);
  const pathFileValue = pathFileExists ? fs.readFileSync(paths.pathFile, "utf8") : "(missing)";
  const executableExists = fs.existsSync(paths.executablePath);
  return [
    `path.txt exists: ${pathFileExists}`,
    `path.txt value: ${JSON.stringify(pathFileValue)}`,
    `executable exists: ${executableExists}`,
    `expected executable: ${paths.executablePath}`,
  ].join("; ");
}

function runElectronInstall(timeoutMs) {
  const { electronDir } = getElectronPaths();
  const installScript = path.join(electronDir, "install.js");
  const childEnv = { ...process.env };
  const skipDownloadFlag = childEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;
  if (skipDownloadFlag != null && skipDownloadFlag !== "") {
    // The ensure script is an explicit repair path; always allow binary download here.
    delete childEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;
    process.stderr.write(
      `[ensure-electron] Ignoring ELECTRON_SKIP_BINARY_DOWNLOAD=${skipDownloadFlag} during repair\n`
    );
  }

  const result = spawnSync(process.execPath, [installScript], {
    cwd: electronDir,
    env: childEnv,
    stdio: "inherit",
    timeout: timeoutMs,
  });

  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`Electron install repair timed out after ${timeoutMs}ms.`);
    }
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Electron install repair failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function canRepair(message) {
  return (
    message.includes("Electron failed to install correctly") ||
    message.includes("Cannot find module") ||
    message.includes("Cannot find package 'electron'")
  );
}

export async function ensureElectronInstalled() {
  const paths = getElectronPaths();

  try {
    resolveElectronBinary();
    return;
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!canRepair(message)) {
      throw error;
    }
  }

  if (writeMarkerIfExecutableExists(paths)) {
    process.stderr.write("[ensure-electron] Restored electron/path.txt from existing binary\n");
    resolveElectronBinary();
    return;
  }

  const timeoutMs = readBoundedIntegerEnv("MATH3D_ELECTRON_DOWNLOAD_TIMEOUT_MS", {
    min: 30_000,
    max: 60 * 60_000,
    defaultValue: 10 * 60_000,
  });
  const retries = readBoundedIntegerEnv("MATH3D_ELECTRON_DOWNLOAD_RETRIES", {
    min: 0,
    max: 5,
    defaultValue: 1,
  });
  const totalAttempts = retries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    process.stderr.write(
      `[ensure-electron] Running electron/install.js; timeout=${timeoutMs}ms; attempt=${attempt}/${totalAttempts}\n`
    );
    try {
      runElectronInstall(timeoutMs);
      if (writeMarkerIfExecutableExists(paths)) {
        process.stderr.write("[ensure-electron] Restored electron/path.txt after repair\n");
      }
      resolveElectronBinary();
      process.stderr.write("[ensure-electron] Electron install repair succeeded\n");
      return;
    } catch (error) {
      lastError = error;
      process.stderr.write(
        `[ensure-electron] Electron repair attempt ${attempt}/${totalAttempts} failed: ${String(error?.message ?? error)}\n`
      );
      if (attempt < totalAttempts) {
        const backoffMs = Math.min(60_000, attempt * 15_000);
        process.stderr.write(`[ensure-electron] Retrying after ${backoffMs}ms...\n`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  const stateDetails = describeElectronState(paths);
  if (lastError) {
    throw new Error(`${String(lastError?.message ?? lastError)}\n[ensure-electron] ${stateDetails}`);
  }
  throw new Error(`Electron install repair failed.\n[ensure-electron] ${stateDetails}`);
}

async function main() {
  await ensureElectronInstalled();
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.stack ?? error?.message ?? error)}\n`);
    process.exit(1);
  });
}
