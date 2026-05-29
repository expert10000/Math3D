#!/usr/bin/env node

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

function getElectronDir() {
  return path.dirname(require.resolve("electron/package.json"));
}

function resolveElectronBinary() {
  return require("electron");
}

function getTargetPlatform() {
  return process.env.npm_config_platform || os.platform();
}

function getTargetArch() {
  return process.env.npm_config_arch || process.arch;
}

function getPlatformPath() {
  const platform = getTargetPlatform();
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

async function downloadElectronArtifact(paths, timeoutMs) {
  const { downloadArtifact } = require("@electron/get");
  const extract = require("extract-zip");
  const { version } = require("electron/package.json");
  const distPath = process.env.ELECTRON_OVERRIDE_DIST_PATH || path.join(paths.electronDir, "dist");
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
  fs.writeFileSync(paths.pathFile, paths.platformPath);
}

async function downloadElectronArtifactWithTimeout(paths) {
  const timeoutMs = readBoundedIntegerEnv("MATH3D_ELECTRON_DOWNLOAD_TIMEOUT_MS", {
    min: 30_000,
    max: 60 * 60_000,
    defaultValue: 20 * 60_000,
  });
  const maxRetries = readBoundedIntegerEnv("MATH3D_ELECTRON_DOWNLOAD_RETRIES", {
    min: 0,
    max: 5,
    defaultValue: 1,
  });
  const totalAttempts = maxRetries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const startMs = Date.now();
    process.stderr.write(
      `[ensure-electron] Downloading Electron (${getTargetPlatform()}/${getTargetArch()}); timeout=${timeoutMs}ms; attempt=${attempt}/${totalAttempts}\n`
    );
    let timeoutHandle;
    const heartbeatHandle = setInterval(() => {
      const elapsedMs = Date.now() - startMs;
      process.stderr.write(`[ensure-electron] Download in progress... elapsed=${elapsedMs}ms\n`);
    }, 15_000);

    try {
      await Promise.race([
        downloadElectronArtifact(paths, timeoutMs),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`Electron download timed out after ${timeoutMs}ms.`));
          }, timeoutMs);
        }),
      ]);
      const totalMs = Date.now() - startMs;
      process.stderr.write(`[ensure-electron] Download completed in ${totalMs}ms\n`);
      return;
    } catch (error) {
      lastError = error;
      clearInterval(heartbeatHandle);
      const message = String(error?.message ?? error);
      process.stderr.write(`[ensure-electron] Download attempt ${attempt}/${totalAttempts} failed: ${message}\n`);
      if (attempt < totalAttempts) {
        const backoffMs = Math.min(60_000, attempt * 15_000);
        process.stderr.write(`[ensure-electron] Retrying after ${backoffMs}ms...\n`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
      continue;
    } finally {
      clearInterval(heartbeatHandle);
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  throw lastError ?? new Error("Electron download failed.");
}

function listDist(paths) {
  const distDir = path.join(paths.electronDir, "dist");
  try {
    return fs.readdirSync(distDir).slice(0, 20).join(", ");
  } catch {
    return "(dist folder missing)";
  }
}

export async function ensureElectronInstalled() {
  const paths = getElectronPaths();
  if (markerMatches(paths)) {
    resolveElectronBinary();
    return;
  }

  if (writeMarkerIfExecutableExists(paths)) {
    process.stderr.write("[ensure-electron] Restored electron/path.txt from existing binary\n");
    resolveElectronBinary();
    return;
  }

  process.stderr.write("[ensure-electron] Electron executable missing; downloading Electron artifact\n");
  await downloadElectronArtifactWithTimeout(paths);

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

  // Validate against Electron's own path resolution before returning success.
  resolveElectronBinary();
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
