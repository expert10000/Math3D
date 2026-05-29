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

function getTargetPlatform() {
  return process.env.npm_config_platform || os.platform();
}

function getTargetArch() {
  return process.env.npm_config_arch || process.arch;
}

function getElectronPaths() {
  const packageJsonPath = require.resolve("electron/package.json");
  const electronDir = path.dirname(packageJsonPath);
  const platformPath = getPlatformPath();
  return {
    electronDir,
    platformPath,
    pathFile: path.join(electronDir, "path.txt"),
    executablePath: path.join(electronDir, "dist", platformPath),
  };
}

function unsetEnvKeyCaseInsensitive(target, key) {
  const needle = key.toLowerCase();
  const removed = [];
  for (const name of Object.keys(target)) {
    if (name.toLowerCase() === needle) {
      removed.push(`${name}=${target[name]}`);
      delete target[name];
    }
  }
  return removed;
}

function writeMarkerIfExecutableExists(paths) {
  if (!fs.existsSync(paths.executablePath)) return false;
  fs.writeFileSync(paths.pathFile, paths.platformPath);
  return true;
}

function markerMatches(paths) {
  if (!fs.existsSync(paths.pathFile)) return false;
  const marker = fs.readFileSync(paths.pathFile, "utf8").trim();
  return marker === paths.platformPath && fs.existsSync(paths.executablePath);
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
  const removedSkipFlags = unsetEnvKeyCaseInsensitive(childEnv, "ELECTRON_SKIP_BINARY_DOWNLOAD");
  if (removedSkipFlags.length > 0) {
    // The ensure script is an explicit repair path; always allow binary download here.
    process.stderr.write(`[ensure-electron] Ignoring ${removedSkipFlags.join(", ")} during repair\n`);
  }
  const removedOverrideFlags = unsetEnvKeyCaseInsensitive(childEnv, "ELECTRON_OVERRIDE_DIST_PATH");
  if (removedOverrideFlags.length > 0) {
    // Always repair into node_modules/electron/dist + path.txt so later scripts behave consistently.
    process.stderr.write(`[ensure-electron] Ignoring ${removedOverrideFlags.join(", ")} during repair\n`);
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

async function downloadElectronArtifactDirect(paths, timeoutMs) {
  const { downloadArtifact } = require("@electron/get");
  const extract = require("extract-zip");
  const { version } = require("electron/package.json");
  const distPath = path.join(paths.electronDir, "dist");
  fs.rmSync(distPath, { recursive: true, force: true });
  fs.mkdirSync(distPath, { recursive: true });

  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    force: process.env.force_no_cache === "true",
    cacheRoot: process.env.electron_config_cache,
    checksums:
      process.env.electron_use_remote_checksums || process.env.npm_config_electron_use_remote_checksums
        ? undefined
        : require("electron/checksums.json"),
    platform: getTargetPlatform(),
    arch: getTargetArch(),
    downloadOptions: {
      timeout: {
        request: timeoutMs,
      },
    },
  });

  await extract(zipPath, { dir: distPath });
  const srcTypeDefPath = path.join(distPath, "electron.d.ts");
  const targetTypeDefPath = path.join(paths.electronDir, "electron.d.ts");
  if (fs.existsSync(srcTypeDefPath)) {
    fs.renameSync(srcTypeDefPath, targetTypeDefPath);
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

  if (markerMatches(paths)) {
    return;
  }

  try {
    resolveElectronBinary();
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!canRepair(message)) throw error;
  }

  if (writeMarkerIfExecutableExists(paths)) {
    process.stderr.write("[ensure-electron] Restored electron/path.txt from existing binary\n");
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
      if (!fs.existsSync(paths.executablePath)) {
        process.stderr.write(
          "[ensure-electron] electron/install.js finished without binary; trying direct artifact download\n"
        );
        await downloadElectronArtifactDirect(paths, timeoutMs);
      }
      if (writeMarkerIfExecutableExists(paths) && markerMatches(paths)) {
        process.stderr.write("[ensure-electron] Restored electron/path.txt after repair\n");
        process.stderr.write("[ensure-electron] Electron install repair succeeded\n");
        return;
      }
      throw new Error("Repair completed but marker/binary validation still failed.");
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

export function getElectronExecutablePath() {
  return getElectronPaths().executablePath;
}

export async function ensureElectronExecutablePath() {
  await ensureElectronInstalled();
  const executablePath = getElectronExecutablePath();
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `[ensure-electron] executable missing after ensure: ${executablePath}`
    );
  }
  return executablePath;
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
